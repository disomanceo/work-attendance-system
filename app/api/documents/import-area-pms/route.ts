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


function importQuestionMarkRatio(value: unknown) {
  const raw = String(value ?? "").replace(/\s+/g, "");
  if (!raw) return 0;
  return (raw.match(/\?/g) || []).length / raw.length;
}

function importHasMeaningfulText(value: unknown) {
  return /[\u0E00-\u0E7Fa-zA-Z0-9]/.test(String(value ?? ""));
}

function importLooksGarbled(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return false;
  const compact = raw.replace(/\s+/g, "");
  return (
    /^\?+$/.test(compact) ||
    (compact.length >= 6 &&
      importQuestionMarkRatio(compact) >= 0.5 &&
      !importHasMeaningfulText(compact))
  );
}

function importGarbledFields(values: Record<string, unknown>) {
  return Object.entries(values)
    .filter(([, value]) => importLooksGarbled(value))
    .map(([key]) => key);
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

  const garbledFields = importGarbledFields({
    subject: item.subject,
    sender: item.sender,
    documentNo: item.documentNo,
    receiveNo: item.receiveNo,
    summary: item.summary,
  });
  if (garbledFields.length) {
    return json({
      ok: false,
      message: "Garbled Thai text detected",
      fields: garbledFields,
      smartAreaId: item.smartAreaId,
    }, 400);
  }

  const { data: existing, error: existingError } = await admin
    .from("smart_area_books")
    .select(`
      id,
      registration_number,
      received_date,
      source_agency,
      subject,
      document_number,
      document_date,
      urgency,
      legacy_payload
    `)
    .eq("legacy_smart_area_id", item.smartAreaId)
    .maybeSingle();

  if (existingError) {
    console.error("Import existing lookup error:", existingError);
    return json({ ok: false, message: "Cannot check existing document" }, 500);
  }

  const bookValues = {
    registration_number: item.receiveNo || null,
    received_date: item.receivedDate,
    source_agency: item.sender || null,
    subject: item.subject,
    document_number: item.documentNo || null,
    document_date: item.documentDate,
    urgency: item.priority || null,
    source_system: "smart-area-central",
    is_active: true,
    legacy_payload: {
      ...(existing?.legacy_payload && typeof existing.legacy_payload === "object"
        ? existing.legacy_payload
        : {}),
      imported_by: "Import Area PMS",
      source_url: item.sourceUrl,
      smart_area_page: item.smartAreaPage,
      central_latest_page: item.centralLatestPage,
      last_synced_at: new Date().toISOString(),
      raw: payload,
    },
  };

  let bookId = text(existing?.id);
  let bookChanged = false;
  let message = "unchanged";

  if (!bookId) {
    const { data: inserted, error: insertError } = await admin
      .from("smart_area_books")
      .insert({
        legacy_smart_area_id: item.smartAreaId,
        ...bookValues,
        document_type: null,
        status: "clerk_review",
        note: item.summary || null,
        director_note: null,
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      console.error("Import insert book error:", insertError);
      return json({ ok: false, message: "Cannot insert Smart Area book" }, 500);
    }

    bookId = text(inserted.id);
    bookChanged = true;
    message = "saved";
  } else {
    const comparable = {
      registration_number: item.receiveNo || null,
      received_date: item.receivedDate,
      source_agency: item.sender || null,
      subject: item.subject,
      document_number: item.documentNo || null,
      document_date: item.documentDate,
      urgency: item.priority || null,
    };

    bookChanged = Object.entries(comparable).some(
      ([key, value]) => text((existing as any)[key]) !== text(value),
    );

    const oldPage = text((existing as any).legacy_payload?.smart_area_page);
    const oldUrl = text((existing as any).legacy_payload?.source_url);
    if (oldPage !== text(item.smartAreaPage) || oldUrl !== item.sourceUrl) {
      bookChanged = true;
    }

    const { error: updateError } = await admin
      .from("smart_area_books")
      .update(bookValues)
      .eq("id", bookId);

    if (updateError) {
      console.error("Import update book error:", updateError);
      return json({ ok: false, message: "Cannot update Smart Area book" }, 500);
    }

    if (bookChanged) message = "updated";
  }

  const { data: currentAttachments, error: currentAttachmentError } = await admin
    .from("smart_area_attachments")
    .select("id, source_url, file_url, file_name, file_order, is_active, status")
    .eq("book_id", bookId)
    .eq("attachment_type", "original");

  if (currentAttachmentError) {
    console.error("Import load attachments error:", currentAttachmentError);
    return json({ ok: false, message: "Cannot load original attachments" }, 500);
  }

  const currentByUrl = new Map(
    (currentAttachments ?? []).map((row: any) => [text(row.source_url) || text(row.file_url), row]),
  );
  const incomingUrls = new Set(item.attachmentUrls);
  let attachmentChanges = 0;
  let attachmentsAdded = 0;
  let attachmentsUpdated = 0;
  let attachmentsDeactivated = 0;

  for (let index = 0; index < item.attachmentUrls.length; index += 1) {
    const url = item.attachmentUrls[index];
    const fileName = item.attachmentNames[index] || `ไฟล์แนบ ${index + 1}`;
    const current = currentByUrl.get(url);

    if (!current) {
      const { error } = await admin.from("smart_area_attachments").insert({
        book_id: bookId,
        legacy_smart_area_id: item.smartAreaId,
        legacy_sheet_row: 0,
        legacy_attachment_key: `${item.smartAreaId}:original:${index + 1}:${url}`,
        source_url: url,
        file_url: url,
        drive_file_id: null,
        file_name: fileName,
        mime_type: null,
        file_order: index + 1,
        attachment_type: "original",
        status: "active",
        is_active: true,
        legacy_payload: {
          imported_by: "Import Area PMS",
          source_text: fileName,
          last_synced_at: new Date().toISOString(),
        },
      });

      if (error) {
        console.error("Import insert attachment error:", error);
        return json({ ok: false, message: "Cannot insert original attachment" }, 500);
      }

      attachmentChanges += 1;
      attachmentsAdded += 1;
      continue;
    }

    const attachmentChanged =
      text(current.file_name) !== fileName ||
      Number(current.file_order || 0) !== index + 1 ||
      current.is_active !== true ||
      text(current.status) !== "active";

    if (attachmentChanged) {
      const { error } = await admin
        .from("smart_area_attachments")
        .update({
          source_url: url,
          file_url: url,
          file_name: fileName,
          file_order: index + 1,
          status: "active",
          is_active: true,
          legacy_payload: {
            imported_by: "Import Area PMS",
            source_text: fileName,
            last_synced_at: new Date().toISOString(),
          },
        })
        .eq("id", current.id);

      if (error) {
        console.error("Import update attachment error:", error);
        return json({ ok: false, message: "Cannot update original attachment" }, 500);
      }

      attachmentChanges += 1;
      attachmentsUpdated += 1;
    }
  }

  for (const current of currentAttachments ?? []) {
    const url = text((current as any).source_url) || text((current as any).file_url);
    if (!url || incomingUrls.has(url) || (current as any).is_active === false) continue;

    const { error } = await admin
      .from("smart_area_attachments")
      .update({ status: "inactive", is_active: false })
      .eq("id", (current as any).id);

    if (error) {
      console.error("Import deactivate attachment error:", error);
      return json({ ok: false, message: "Cannot deactivate removed original attachment" }, 500);
    }

    attachmentChanges += 1;
    attachmentsDeactivated += 1;
  }

  if (message === "unchanged" && attachmentChanges > 0) message = "updated";

  return json({
    ok: true,
    message,
    duplicate: message === "unchanged",
    bookId,
    smartAreaId: item.smartAreaId,
    attachments: item.attachmentUrls.length,
    attachmentsAdded,
    attachmentsUpdated,
    attachmentsDeactivated,
    bookChanged,
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
      updatedCount: number(payload.updatedCount),
      unchangedCount: number(payload.unchangedCount),
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

  if (action === "extensionInfo") {
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") ||
      "https://work-attendance-system-beige.vercel.app";

    return json({
      ok: true,
      version: process.env.SMART_AREA_EXTENSION_VERSION?.trim() || "1.8.29",
      downloadUrl:
        process.env.SMART_AREA_EXTENSION_DOWNLOAD_URL?.trim() ||
        `${appUrl}/downloads/import-area-pms-1.8.29-installer.zip`,
    });
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
