import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type ImportPayload = Record<string, unknown>;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Import-Secret",
    "Access-Control-Max-Age": "86400",
  };
}

function json(data: Record<string, unknown>, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: corsHeaders(),
  });
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function number(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function serverConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) return null;

  return { supabaseUrl, serviceRoleKey };
}

function adminClient() {
  const config = serverConfig();

  if (!config) return null;

  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function requireImportSecret(request: Request, payload: ImportPayload) {
  const expected = process.env.SMART_AREA_IMPORT_SECRET?.trim();

  if (!expected) return true;

  const supplied =
    request.headers.get("x-import-secret")?.trim() || text(payload.secret);

  return supplied === expected;
}

async function readPayload(request: Request): Promise<ImportPayload> {
  if (request.method === "GET") {
    return Object.fromEntries(new URL(request.url).searchParams.entries());
  }

  const raw = await request.text();

  if (!raw.trim()) return {};

  try {
    return JSON.parse(raw) as ImportPayload;
  } catch {
    return Object.fromEntries(new URLSearchParams(raw).entries());
  }
}

const THAI_MONTHS: Record<string, number> = {
  "ม.ค.": 1,
  "มกราคม": 1,
  "ก.พ.": 2,
  "กุมภาพันธ์": 2,
  "มี.ค.": 3,
  "มีนาคม": 3,
  "เม.ย.": 4,
  "เมษายน": 4,
  "พ.ค.": 5,
  "พฤษภาคม": 5,
  "มิ.ย.": 6,
  "มิถุนายน": 6,
  "ก.ค.": 7,
  "กรกฎาคม": 7,
  "ส.ค.": 8,
  "สิงหาคม": 8,
  "ก.ย.": 9,
  "กันยายน": 9,
  "ต.ค.": 10,
  "ตุลาคม": 10,
  "พ.ย.": 11,
  "พฤศจิกายน": 11,
  "ธ.ค.": 12,
  "ธันวาคม": 12,
};

function isoDate(value: unknown) {
  const raw = text(value);

  if (!raw) return null;

  const iso = raw.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;

  const slash = raw.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (slash) {
    let year = Number(slash[3]);
    if (year < 100) year += 2000;
    if (year > 2400) year -= 543;

    return `${year}-${slash[2].padStart(2, "0")}-${slash[1].padStart(2, "0")}`;
  }

  const thai = raw.match(/(\d{1,2})\s+([ก-๙.]+)\s+(\d{4})/);
  if (thai) {
    let year = Number(thai[3]);
    if (year > 2400) year -= 543;

    const month = THAI_MONTHS[thai[2]];
    if (month) {
      return `${year}-${String(month).padStart(2, "0")}-${thai[1].padStart(2, "0")}`;
    }
  }

  return null;
}

function parseNumberedLines(value: unknown) {
  return text(value)
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\d+\.\s*/, "").trim())
    .filter(Boolean);
}

function extension(payload: ImportPayload) {
  const url = text(payload.sourceUrl);
  const match = url.match(/[?&]b_id=(\d+)/i);

  return {
    smartAreaId: text(payload.smartAreaId) || (match ? match[1] : ""),
    sourceUrl: url,
    subject: text(payload.subject),
    receiveNo: text(payload.receiveNo),
    documentNo: text(payload.documentNo),
    documentDate: isoDate(payload.documentDate),
    receivedDate: isoDate(payload.sentAt) || isoDate(payload.documentDate),
    sender: text(payload.sender),
    priority: text(payload.priority),
    summary: text(payload.summary),
    centralLatestPage: text(payload.centralLatestPage),
    smartAreaPage: text(payload.smartAreaPage),
    attachmentNames: parseNumberedLines(payload.attachmentText),
    attachmentUrls: parseNumberedLines(payload.attachmentUrl),
  };
}

async function checkExisting(payload: ImportPayload) {
  const admin = adminClient();

  if (!admin) return json({ ok: false, message: "Missing Supabase server config" }, 500);

  const items = Array.isArray(payload.items) ? payload.items : [];
  const ids = Array.from(
    new Set(
      items
        .map((item) =>
          text(
            typeof item === "object" && item
              ? (item as Record<string, unknown>).smartAreaId ||
                  (item as Record<string, unknown>).id
              : item,
          ),
        )
        .filter(Boolean),
    ),
  );

  const existing: Record<string, boolean> = {};

  for (let index = 0; index < ids.length; index += 500) {
    const chunk = ids.slice(index, index + 500);
    const { data, error } = await admin
      .from("smart_area_books")
      .select("legacy_smart_area_id")
      .in("legacy_smart_area_id", chunk);

    if (error) {
      console.error("Import check existing error:", error);
      return json({ ok: false, message: "Cannot check existing Smart Area IDs" }, 500);
    }

    for (const row of data ?? []) {
      existing[text((row as any).legacy_smart_area_id)] = true;
    }
  }

  return json({
    ok: true,
    existing,
    existingCount: Object.keys(existing).length,
  });
}

async function upsertDocument(payload: ImportPayload) {
  const admin = adminClient();

  if (!admin) return json({ ok: false, message: "Missing Supabase server config" }, 500);

  const item = extension(payload);

  if (!item.smartAreaId) {
    return json({ ok: false, message: "Missing Smart Area ID" }, 400);
  }

  if (!item.subject) {
    return json({ ok: false, message: "Missing document subject" }, 400);
  }

  const { data: existing, error: existingError } = await admin
    .from("smart_area_books")
    .select("id")
    .eq("legacy_smart_area_id", item.smartAreaId)
    .maybeSingle();

  if (existingError) {
    console.error("Import existing lookup error:", existingError);
    return json({ ok: false, message: "Cannot check existing document" }, 500);
  }

  if (existing?.id) {
    return json({
      ok: true,
      message: "duplicate",
      duplicate: true,
      bookId: existing.id,
      smartAreaId: item.smartAreaId,
      attachments: 0,
    });
  }

  const { data: book, error: insertError } = await admin
    .from("smart_area_books")
    .insert({
      legacy_smart_area_id: item.smartAreaId,
      registration_number: item.receiveNo || null,
      received_date: item.receivedDate,
      source_agency: item.sender || null,
      subject: item.subject,
      document_number: item.documentNo || null,
      document_date: item.documentDate,
      document_type: null,
      urgency: item.priority || null,
      status: "clerk_review",
      note: item.summary || null,
      director_note: null,
      source_system: "smart-area-central",
      is_active: true,
      legacy_payload: {
        imported_by: "Import Area PMS",
        source_url: item.sourceUrl,
        smart_area_page: item.smartAreaPage,
        central_latest_page: item.centralLatestPage,
        raw: payload,
      },
    })
    .select("id")
    .single();

  if (insertError || !book) {
    console.error("Import insert book error:", insertError);
    return json({ ok: false, message: "Cannot insert Smart Area book" }, 500);
  }

  const attachmentRows = item.attachmentUrls.map((url, index) => ({
    book_id: book.id,
    legacy_smart_area_id: item.smartAreaId,
    legacy_sheet_row: 0,
    legacy_attachment_key: `${item.smartAreaId}:original:${index + 1}:${url}`,
    source_url: url,
    file_url: url,
    drive_file_id: null,
    file_name: item.attachmentNames[index] || `ไฟล์แนบ ${index + 1}`,
    mime_type: null,
    file_order: index + 1,
    attachment_type: "original",
    status: "active",
    is_active: true,
    legacy_payload: {
      imported_by: "Import Area PMS",
      source_text: item.attachmentNames[index] || "",
    },
  }));

  let attachments = 0;

  if (attachmentRows.length > 0) {
    const { error: attachmentError } = await admin
      .from("smart_area_attachments")
      .insert(attachmentRows);

    if (attachmentError) {
      console.error("Import insert attachments error:", attachmentError);
      return json(
        {
          ok: false,
          message: "Book inserted but attachments failed",
          bookId: book.id,
        },
        500,
      );
    }

    attachments = attachmentRows.length;
  }

  return json({
    ok: true,
    message: "saved",
    duplicate: false,
    bookId: book.id,
    smartAreaId: item.smartAreaId,
    attachments,
  });
}

async function getImportScanPlan(payload: ImportPayload) {
  const latestPage = number(payload.latestPage);
  const lookback = Math.max(number(payload.lookbackPages) || 5, 1);

  return json({
    ok: true,
    scanStartPage: latestPage ? Math.max(1, latestPage - lookback + 1) : 1,
    scanEndPage: latestPage || 1,
    lookbackPages: lookback,
  });
}

async function finalizeImportScan(payload: ImportPayload) {
  return json({
    ok: true,
    updatedLatestPage: number(payload.scanEndPage),
    summary: {
      scanStartPage: number(payload.scanStartPage),
      scanEndPage: number(payload.scanEndPage),
      totalFound: number(payload.totalFound),
      addedCount: number(payload.addedCount),
      duplicateCount: number(payload.duplicateCount),
      errorCount: number(payload.errorCount),
    },
  });
}

async function handle(request: Request) {
  const payload = await readPayload(request);
  const action = text(payload.action);

  if (!requireImportSecret(request, payload)) {
    return json({ ok: false, message: "Invalid import secret" }, 401);
  }

  if (action === "health") {
    return json({ ok: true, service: "Import Area PMS Next API" });
  }

  if (action === "getImportScanPlan") return getImportScanPlan(payload);
  if (action === "finalizeImportScan") return finalizeImportScan(payload);
  if (action === "checkExistingSmartAreaItems") return checkExisting(payload);
  if (action === "upsertDocument") return upsertDocument(payload);

  return json({ ok: false, message: `Unknown action: ${action || "-"}` }, 400);
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
