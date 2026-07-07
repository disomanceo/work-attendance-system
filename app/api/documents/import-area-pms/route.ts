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

function normalizedKey(value: string) {
  return value
    .toLocaleLowerCase("th")
    .replace(/[\s._\-:/()[\]{}]+/g, "");
}

function firstText(payload: ImportPayload, keys: string[]) {
  const normalizedEntries = Object.entries(payload).map(([key, value]) => [
    normalizedKey(key),
    value,
  ] as const);

  for (const key of keys) {
    const value = text(payload[key]);
    if (value) return value;
  }

  for (const key of keys) {
    const matchKey = normalizedKey(key);
    const entry = normalizedEntries.find(([candidate]) => candidate === matchKey);
    const value = text(entry?.[1]);
    if (value) return value;
  }

  return "";
}

function firstTextByKey(payload: ImportPayload, keys: string[]) {
  const matchKeys = keys.map(normalizedKey);
  const entry = Object.entries(payload).find(([key, value]) => {
    if (!text(value)) return false;

    const candidate = normalizedKey(key);
    return matchKeys.some(
      (matchKey) => candidate === matchKey || candidate.includes(matchKey),
    );
  });

  return text(entry?.[1]);
}

function firstTextAfterLabel(payload: ImportPayload, keys: string[]) {
  const detailText = Object.values(payload).map(text).filter(Boolean).join("\n");

  for (const key of keys) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = detailText.match(
      new RegExp(`${escapedKey}\\s*[:：]?\\s*([^\\n\\r]+)`, "i"),
    );
    const value = text(match?.[1]);
    if (value) return value;
  }

  return "";
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

function thaiMonthNumber(value: string) {
  const normalized = value.replace(/\s+/g, "").replace(/[.]/g, "");

  for (const [month, numberValue] of Object.entries(THAI_MONTHS)) {
    const monthKey = month.replace(/\s+/g, "").replace(/[.]/g, "");
    if (normalized === monthKey || normalized.startsWith(monthKey)) {
      return numberValue;
    }
  }

  return 0;
}

function isoDate(value: unknown) {
  const raw = text(value);

  if (!raw) return null;

  if (/^\d+(\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    if (serial > 20000 && serial < 80000) {
      const epoch = Date.UTC(1899, 11, 30);
      const date = new Date(epoch + serial * 86400000);
      return date.toISOString().slice(0, 10);
    }
  }

  const iso = raw.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;

  const slash = raw.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (slash) {
    let year = Number(slash[3]);
    if (year < 100) year += 2000;
    if (year > 2400) year -= 543;

    return `${year}-${slash[2].padStart(2, "0")}-${slash[1].padStart(2, "0")}`;
  }

  const thai = raw.match(/(\d{1,2})\s*([ก-๙.]+)\s*(\d{4})/);
  if (thai) {
    let year = Number(thai[3]);
    if (year > 2400) year -= 543;

    const month = THAI_MONTHS[thai[2]] || thaiMonthNumber(thai[2]);
    if (month) {
      return `${year}-${String(month).padStart(2, "0")}-${thai[1].padStart(2, "0")}`;
    }
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
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
  const documentDate = isoDate(
    firstText(payload, [
      "documentDate",
      "docDate",
      "document_date",
      "letterDate",
      "bookDate",
      "issuedDate",
      "issueDate",
      "dateOfDocument",
      "dateDocument",
      "วันที่หนังสือ",
      "หนังสือลงวันที่",
      "ลงวันที่",
    ]) ||
      firstTextByKey(payload, [
        "documentDate",
        "docDate",
        "letterDate",
        "bookDate",
        "issuedDate",
        "issueDate",
        "dateOfDocument",
        "วันที่หนังสือ",
        "หนังสือลงวันที่",
        "ลงวันที่",
      ]) ||
      firstTextAfterLabel(payload, [
        "หนังสือลงวันที่",
        "วันที่หนังสือ",
        "ลงวันที่",
      ]),
  );
  const receivedDate =
    isoDate(
      firstText(payload, [
        "receivedDate",
        "receiveDate",
        "receive_date",
        "receivedAt",
        "receiveAt",
        "receivedOn",
        "receiveOn",
        "sentAt",
        "sentDate",
        "submittedAt",
        "dateReceived",
        "วันที่รับ",
        "วันรับ",
        "วันเวลาที่ส่ง",
        "วันที่ส่ง",
        "ลงทะเบียนรับแล้วเมื่อ",
      ]) ||
        firstTextByKey(payload, [
          "receivedDate",
          "receiveDate",
          "receivedAt",
          "receiveAt",
          "receivedOn",
          "receiveOn",
          "dateReceived",
          "วันที่รับ",
          "วันรับ",
          "วันเวลาที่ส่ง",
          "วันที่ส่ง",
          "ลงทะเบียนรับแล้วเมื่อ",
        ]) ||
        firstTextAfterLabel(payload, [
          "วันเวลาที่ส่ง",
          "วันที่รับ",
          "วันรับ",
          "ลงทะเบียนรับแล้วเมื่อ",
        ]),
    ) || documentDate;

  return {
    smartAreaId: text(payload.smartAreaId) || (match ? match[1] : ""),
    sourceUrl: url,
    subject:
      firstText(payload, ["subject", "เรื่อง"]) ||
      firstTextByKey(payload, ["subject", "เรื่อง"]),
    receiveNo:
      firstText(payload, [
        "receiveNo",
        "registrationNumber",
        "เลขทะเบียนหนังสือรับ",
        "เลขทะเบียนรับ",
      ]) ||
      firstTextByKey(payload, [
        "receiveNo",
        "registrationNumber",
        "เลขทะเบียนหนังสือรับ",
        "เลขทะเบียนรับ",
      ]),
    documentNo:
      firstText(payload, ["documentNo", "documentNumber", "เลขที่หนังสือ"]) ||
      firstTextByKey(payload, ["documentNo", "documentNumber", "เลขที่หนังสือ"]),
    documentDate,
    receivedDate,
    sender:
      firstText(payload, ["sender", "sourceAgency", "ส่งโดย", "จาก"]) ||
      firstTextByKey(payload, ["sender", "sourceAgency", "ส่งโดย", "จาก"]),
    priority:
      firstText(payload, ["priority", "urgency", "ชั้นความเร็ว", "ปกติ"]) ||
      firstTextByKey(payload, ["priority", "urgency", "ชั้นความเร็ว"]),
    summary:
      firstText(payload, ["summary", "note", "เนื้อหาโดยสรุป"]) ||
      firstTextByKey(payload, ["summary", "note", "เนื้อหาโดยสรุป"]),
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
    .select("id, received_date, document_date")
    .eq("legacy_smart_area_id", item.smartAreaId)
    .maybeSingle();

  if (existingError) {
    console.error("Import existing lookup error:", existingError);
    return json({ ok: false, message: "Cannot check existing document" }, 500);
  }

  if (existing?.id) {
    const bookUpdates: Record<string, unknown> = {};

    if (item.receivedDate && item.receivedDate !== existing.received_date) {
      bookUpdates.received_date = item.receivedDate;
    }

    if (item.documentDate && item.documentDate !== existing.document_date) {
      bookUpdates.document_date = item.documentDate;
    }

    if (Object.keys(bookUpdates).length > 0) {
      const { error: updateError } = await admin
        .from("smart_area_books")
        .update(bookUpdates)
        .eq("id", existing.id);

      if (updateError) {
        console.error("Import update existing book dates error:", updateError);
        return json(
          {
            ok: false,
            message: "Cannot update Smart Area book dates",
            bookId: existing.id,
            smartAreaId: item.smartAreaId,
          },
          500,
        );
      }
    }

    return json({
      ok: true,
      message: "duplicate",
      duplicate: true,
      bookId: existing.id,
      smartAreaId: item.smartAreaId,
      attachments: 0,
      updatedDates: Object.keys(bookUpdates),
      receivedDate: item.receivedDate,
      documentDate: item.documentDate,
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
    receivedDate: item.receivedDate,
    documentDate: item.documentDate,
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
