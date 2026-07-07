type PayloadRecord = Record<string, unknown>;

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

export const SMART_AREA_DOCUMENT_DATE_KEYS = [
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
];

export const SMART_AREA_RECEIVED_DATE_KEYS = [
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
];

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalizedKey(value: string) {
  return value
    .toLocaleLowerCase("th")
    .replace(/[\s._\-:/()[\]{}]+/g, "");
}

export function smartAreaFirstText(payload: unknown, keys: string[]) {
  if (!payload || typeof payload !== "object") return "";

  const record = payload as PayloadRecord;
  const normalizedEntries = Object.entries(record).map(([key, value]) => [
    normalizedKey(key),
    value,
  ] as const);

  for (const key of keys) {
    const value = text(record[key]);
    if (value) return value;
  }

  for (const key of keys) {
    const matchKey = normalizedKey(key);
    const entry = normalizedEntries.find(([candidate]) => candidate === matchKey);
    const value = text(entry?.[1]);
    if (value) return value;
  }

  for (const key of keys) {
    const matchKey = normalizedKey(key);
    const entry = normalizedEntries.find(
      ([candidate, value]) => text(value) && candidate.includes(matchKey),
    );
    const value = text(entry?.[1]);
    if (value) return value;
  }

  const detailText = Object.values(record)
    .map(text)
    .filter(Boolean)
    .join("\n");

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

export function smartAreaIsoDate(value: unknown) {
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

function rawPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;

  const record = payload as PayloadRecord;
  return record.raw && typeof record.raw === "object" ? record.raw : record;
}

export function smartAreaPayloadDocumentDate(payload: unknown) {
  return smartAreaIsoDate(
    smartAreaFirstText(rawPayload(payload), SMART_AREA_DOCUMENT_DATE_KEYS),
  );
}

export function smartAreaPayloadReceivedDate(payload: unknown) {
  return smartAreaIsoDate(
    smartAreaFirstText(rawPayload(payload), SMART_AREA_RECEIVED_DATE_KEYS),
  );
}
