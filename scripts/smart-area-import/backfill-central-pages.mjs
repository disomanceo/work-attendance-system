#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs/promises";

function loadEnvText(text) {
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

for (const name of [".env.local", ".env"]) {
  try {
    loadEnvText(await fs.readFile(name, "utf8"));
  } catch {}
}

const required = [
  "SMART_AREA_BASE_URL",
  "SMART_AREA_USERNAME",
  "SMART_AREA_PASSWORD",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing ${key}`);
}

const text = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function stripTags(value) {
  return text(decodeEntities(String(value || "").replace(/<[^>]+>/g, " ")));
}

function stripLabel(value, labels) {
  let result = text(value);
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`^${escaped}\\s*[:：]?\\s*`, "i"), "");
  }
  return text(result);
}

const thaiMonths = {
  "มค": 1,
  "ม.ค.": 1,
  "มกราคม": 1,
  "กพ": 2,
  "ก.พ.": 2,
  "กุมภาพันธ์": 2,
  "มีค": 3,
  "มี.ค.": 3,
  "มีนาคม": 3,
  "เมย": 4,
  "เม.ย.": 4,
  "เมษายน": 4,
  "พค": 5,
  "พ.ค.": 5,
  "พฤษภาคม": 5,
  "มิย": 6,
  "มิ.ย.": 6,
  "มิถุนายน": 6,
  "กค": 7,
  "ก.ค.": 7,
  "กรกฎาคม": 7,
  "สค": 8,
  "ส.ค.": 8,
  "สิงหาคม": 8,
  "กย": 9,
  "ก.ย.": 9,
  "กันยายน": 9,
  "ตค": 10,
  "ต.ค.": 10,
  "ตุลาคม": 10,
  "พย": 11,
  "พ.ย.": 11,
  "พฤศจิกายน": 11,
  "ธค": 12,
  "ธ.ค.": 12,
  "ธันวาคม": 12,
};

function isoThaiDate(value) {
  const raw = text(value);
  const match = raw.match(/(\d{1,2})\s*([\u0E00-\u0E7F.]+)\s*(\d{4})/);
  if (!match) return null;
  let year = Number(match[3]);
  if (year > 2400) year -= 543;
  const monthKey = match[2].replace(/\s+/g, "");
  const month = thaiMonths[monthKey] || thaiMonths[monthKey.replace(/[.]/g, "")];
  if (!month) return null;
  return `${year}-${String(month).padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function cookieHeader(cookies) {
  return [...cookies.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
}

function absorbCookies(cookies, response) {
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) return;
  for (const part of setCookie.split(/,(?=[^;,]+=)/)) {
    const [pair] = part.split(";");
    const index = pair.indexOf("=");
    if (index > 0) cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
  }
}

async function request(cookies, url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers || {}),
      cookie: cookieHeader(cookies),
    },
  });
  absorbCookies(cookies, response);
  return response;
}

function receivePageUrl(page) {
  const url = new URL("/smartarea/index.php", process.env.SMART_AREA_BASE_URL);
  url.searchParams.set("option", "book");
  url.searchParams.set("task", "main/receive");
  url.searchParams.set("saraban_index", "");
  url.searchParams.set("search_index", "");
  url.searchParams.set("field", "");
  url.searchParams.set("search", "");
  url.searchParams.set("page", String(page));
  return url.href;
}

function detailUrl(id) {
  return new URL(
    `/smartarea/modules/book/main/bookdetail_school_saraban.php?b_id=${id}`,
    process.env.SMART_AREA_BASE_URL,
  ).href;
}

function parseRows(html, pageNumber) {
  const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  const items = [];
  for (const row of rows) {
    const id =
      (row.match(/check\s*\(\s*['"][^'"]+['"]\s*,\s*['"]?(\d+)['"]?/i) || [])[1] ||
      (row.match(/[?&]b_id=(\d+)/i) || [])[1];
    if (!id) continue;
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) =>
      stripTags(match[1]),
    );
    if (cells.length < 7) continue;
    items.push({
      smartAreaId: id,
      sourceUrl: detailUrl(id),
      sourcePageUrl: receivePageUrl(pageNumber),
      smartAreaPage: String(pageNumber),
      rowOrder: String(items.length + 1),
      documentNo: stripLabel(cells[1], ["เลขหนังสือ"]),
      subject: cells[2],
      documentDate: cells[4],
      sender: cells[5],
      sentAt: cells[6],
    });
  }
  return items;
}

function pick(textValue, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = textValue.match(new RegExp(`${escaped}\\s*[:：]?\\s*([^\\n\\r]+)`, "i"));
  return text(match?.[1]);
}

function parseDetail(html, fallback) {
  const body = stripTags(html).replace(/\s*(รายละเอียดหนังสือ|เรื่อง|เลขทะเบียนหนังสือรับ|หนังสือลงวันที่|ส่งโดย|วันเวลาที่ส่ง|เนื้อหาโดยสรุป|ไฟล์แนบ|ส่งถึง)/g, "\n$1");
  const titleNo = text((body.match(/รายละเอียดหนังสือ\s*(ที่\s*[^\n\r]+)/) || [])[1]);
  const subjectMatch = body.match(/เรื่อง\s*[:：]?\s*([\s\S]*?)\s*\[\s*([^\]]+)\s*\]/);
  return {
    ...fallback,
    documentNo: titleNo || fallback.documentNo,
    subject: text(subjectMatch?.[1]) || fallback.subject,
    priority: text(subjectMatch?.[2]),
    receiveNo: pick(body, "เลขทะเบียนหนังสือรับ"),
    documentDate: pick(body, "หนังสือลงวันที่") || fallback.documentDate,
    sender: pick(body, "ส่งโดย") || fallback.sender,
    sentAt: pick(body, "วันเวลาที่ส่ง") || fallback.sentAt,
    summary: pick(body, "เนื้อหาโดยสรุป"),
  };
}

const cookies = new Map();
const loginUrl = new URL("/smartarea/index.php", process.env.SMART_AREA_BASE_URL).href;
await request(cookies, loginUrl);
const loginBody = new URLSearchParams({
  username: process.env.SMART_AREA_USERNAME,
  pass: process.env.SMART_AREA_PASSWORD,
  "remember-me": "on",
  user_os: "",
  p: "",
  login_submit: "login",
});
await request(cookies, loginUrl, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: loginBody,
});

const pages = (process.argv[2] || "165")
  .split(",")
  .flatMap((part) => {
    const range = part.split("-").map((value) => Number(value.trim()));
    if (range.length === 2 && range[0] && range[1]) {
      const list = [];
      for (let page = range[0]; page <= range[1]; page += 1) list.push(page);
      return list;
    }
    return range[0] ? [range[0]] : [];
  });

const allItems = [];
const latestPage = Math.max(...pages);

for (const page of pages) {
  const response = await request(cookies, receivePageUrl(page));
  const html = await response.text();
  const rows = parseRows(html, page);
  for (const row of rows) {
    const detailResponse = await request(cookies, row.sourceUrl);
    const detailHtml = await detailResponse.text();
    allItems.push(parseDetail(detailHtml, row));
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

let inserted = 0;
let updated = 0;

for (const item of allItems) {
  const { data: existing, error: existingError } = await supabase
    .from("smart_area_books")
    .select("id, legacy_payload")
    .eq("legacy_smart_area_id", item.smartAreaId)
    .maybeSingle();
  if (existingError) throw existingError;

  const legacyPayload = {
    ...(existing?.legacy_payload && typeof existing.legacy_payload === "object"
      ? existing.legacy_payload
      : {}),
    imported_by: "Smart Area central page backfill",
    source_url: item.sourceUrl,
    source_page_url: item.sourcePageUrl,
    smart_area_page: item.smartAreaPage,
    central_latest_page: String(latestPage),
    row_order: item.rowOrder,
    last_synced_at: new Date().toISOString(),
    raw: {
      action: "upsertDocument",
      sourceUrl: item.sourceUrl,
      sourcePageUrl: item.sourcePageUrl,
      smartAreaId: item.smartAreaId,
      smartAreaPage: Number(item.smartAreaPage),
      centralLatestPage: latestPage,
      rowOrder: Number(item.rowOrder),
      documentNo: item.documentNo,
      subject: item.subject,
      receiveNo: item.receiveNo,
      documentDate: item.documentDate,
      sender: item.sender,
      sentAt: item.sentAt,
      priority: item.priority,
      summary: item.summary,
    },
  };

  const values = {
    registration_number: item.receiveNo || null,
    received_date: isoThaiDate(item.sentAt),
    source_agency: stripLabel(item.sender, ["ส่งโดย"]) || null,
    subject: item.subject || `Smart Area ID ${item.smartAreaId}`,
    document_number: item.documentNo || null,
    document_date: isoThaiDate(item.documentDate),
    urgency: item.priority || null,
    source_system: "smart-area-central",
    is_active: true,
    legacy_payload: legacyPayload,
  };

  if (existing?.id) {
    const { error } = await supabase.from("smart_area_books").update(values).eq("id", existing.id);
    if (error) throw error;
    updated += 1;
  } else {
    const { error } = await supabase.from("smart_area_books").insert({
      legacy_smart_area_id: item.smartAreaId,
      ...values,
      document_type: null,
      status: "clerk_review",
      note: item.summary || null,
      director_note: null,
    });
    if (error) throw error;
    inserted += 1;
  }
}

console.log(JSON.stringify({
  ok: true,
  pages,
  found: allItems.length,
  inserted,
  updated,
}, null, 2));
