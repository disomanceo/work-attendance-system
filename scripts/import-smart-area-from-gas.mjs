#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs/promises";
import path from "node:path";

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

async function loadLocalEnv() {
  for (const name of [".env.local", ".env"]) {
    try {
      loadEnvText(await fs.readFile(path.resolve(name), "utf8"));
    } catch {}
  }
}

const text = (value, fallback = "") => {
  const result = String(value ?? "").trim();
  return result || fallback;
};

const ignoredLegacyTaskKeys = new Set([
  "47448:2",
  "46645:17",
]);

function isEmptyLegacyRow(row) {
  return Object.entries(row).every(([key, value]) => {
    if (key === "legacySheetRow") return true;
    return String(value ?? "").trim() === "";
  });
}
function valueFrom(row, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      const value = row[key];
      if (value !== null && value !== undefined && String(value).trim() !== "") {
        return value;
      }
    }
  }
  return "";
}

function normalizedName(value) {
  return text(value)
    .replace(/\s+/g, " ")
    .replace(/^(นาย|นาง|นางสาว|น\.ส\.|ดร\.|ว่าที่ร้อยตรี)\s*/u, "")
    .trim()
    .toLocaleLowerCase("th");
}

function nullableInteger(value) {
  const parsed = Number.parseInt(text(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function nullableDate(value) {
  const raw = text(value);
  if (!raw) return null;
  const direct = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (direct) return `${direct[1]}-${direct[2]}-${direct[3]}`;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function nullableTimestamp(value) {
  const raw = text(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function driveFileId(value) {
  const raw = text(value);
  if (!raw) return "";
  const patterns = [
    /\/d\/([a-zA-Z0-9_-]{10,})/,
    /[?&]id=([a-zA-Z0-9_-]{10,})/,
    /^([a-zA-Z0-9_-]{20,})$/,
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match) return match[1];
  }
  return "";
}

function mapBookStatus(value) {
  const raw = text(value);
  const map = new Map([
    ["รอธุรการตรวจ", "clerk_review"],
    ["รอ ผอ. พิจารณา", "director_review"],
    ["มอบหมายแล้ว", "assigned"],
    ["กำลังดำเนินการ", "in_progress"],
    ["เสร็จแล้ว", "done"],
    ["clerk_review", "clerk_review"],
    ["director_review", "director_review"],
    ["assigned", "assigned"],
    ["in_progress", "in_progress"],
    ["done", "done"],
  ]);
  return map.get(raw) || "clerk_review";
}

function mapTaskStatus(value) {
  const raw = text(value);
  const map = new Map([
    ["มอบหมายแล้ว", "assigned"],
    ["กำลังดำเนินการ", "in_progress"],
    ["เสร็จแล้ว", "done"],
    ["assigned", "assigned"],
    ["in_progress", "in_progress"],
    ["done", "done"],
  ]);
  return map.get(raw) || "assigned";
}

async function fetchMigrationData() {
  const url = process.env.SMART_AREA_GAS_API_URL?.trim();
  const secret = process.env.SMART_AREA_GAS_API_SECRET?.trim();

  if (!url || !secret) {
    throw new Error(
      "SMART_AREA_GAS_API_URL and SMART_AREA_GAS_API_SECRET are required.",
    );
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "exportMigrationData",
      secret,
    }),
    redirect: "follow",
    signal: AbortSignal.timeout(180000),
  });

  const raw = await response.text();
  let result;
  try {
    result = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`GAS returned invalid JSON. HTTP ${response.status}`);
  }

  if (
    !response.ok ||
    result.ok !== true ||
    !Array.isArray(result.books) ||
    !Array.isArray(result.tasks) ||
    !Array.isArray(result.attachments)
  ) {
    throw new Error(result.message || `GAS export failed. HTTP ${response.status}`);
  }

  return result;
}

async function loadProfiles(supabase) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, account_status");
  if (error) throw error;

  const profileMap = new Map();
  for (const profile of data ?? []) {
    const key = normalizedName(profile.full_name);
    if (!key) continue;
    const list = profileMap.get(key) ?? [];
    list.push(profile);
    profileMap.set(key, list);
  }
  return profileMap;
}

function matchProfile(profileMap, name) {
  const raw = text(name);
  if (!raw) return { status: "empty", id: null, candidates: [] };
  const candidates = profileMap.get(normalizedName(raw)) ?? [];
  if (candidates.length === 1) {
    return { status: "matched", id: candidates[0].id, candidates };
  }
  if (candidates.length > 1) {
    return { status: "ambiguous", id: null, candidates };
  }
  return { status: "unmatched", id: null, candidates: [] };
}

async function writeReport(report) {
  const outputDir = path.resolve("migration-reports");
  await fs.mkdir(outputDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const output = path.join(outputDir, `smart-area-import-${stamp}.json`);
  await fs.writeFile(output, JSON.stringify(report, null, 2), "utf8");
  return output;
}

async function main() {
  await loadLocalEnv();

  const execute = process.argv.includes("--execute");
  const dryRun = !execute;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRole) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.",
    );
  }

  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const source = await fetchMigrationData();
  const profileMap = await loadProfiles(supabase);

  const report = {
    mode: dryRun ? "dry-run" : "execute",
    exportedAt: source.exportedAt ?? null,
    sourceSummary: source.summary ?? null,
    books: { source: source.books.length, upserted: 0, missingLegacyId: [] },
    tasks: {
      source: source.tasks.length,
      upserted: 0,
      missingLegacyId: [],
      missingBook: [],
      matched: [],
      unmatched: [],
      ambiguous: [],
    },
    attachments: {
      source: source.attachments.length,
      upserted: 0,
      missingLegacyId: [],
      missingBook: [],
      withoutFileReference: [],
    },
    errors: [],
  };

  const booksByLegacyId = new Map();

  for (let index = 0; index < source.books.length; index += 1) {
    const row = source.books[index] ?? {};
    const legacyId = text(
      valueFrom(row, [
        "smartAreaId",
        "SmartAreaId",
        "SmartAreaID",
        "legacy_smart_area_id",
        "legacySmartAreaId",
        "Smart Area ID",
        "เลขต้นเรื่อง Smart Area",
        "เลขต้นเรื่องSmart Area"
      ]),
    );

    if (!legacyId) {
      report.books.missingLegacyId.push({ index: index + 2, row });
      continue;
    }

    const payload = {
      legacy_smart_area_id: legacyId,
      registration_number:
        text(valueFrom(row, [
          "เลขทะเบียนรับ",
          "เลขรับ",
          "RegistrationNumber",
          "registrationNumber",
          "registration_number"
        ])) || null,
      received_date: nullableDate(
        valueFrom(row, ["วันที่รับ", "ReceivedDate", "receivedDate"]),
      ),
      source_agency:
        text(valueFrom(row, ["จากหน่วยงาน", "SourceAgency", "sourceAgency"])) || null,
      subject:
        text(valueFrom(row, ["เรื่อง", "Subject", "subject"]), "ยังไม่ระบุเรื่อง"),
      document_number:
        text(valueFrom(row, ["เลขที่หนังสือ", "DocumentNumber", "documentNumber"])) || null,
      document_date: nullableDate(
        valueFrom(row, ["วันที่หนังสือ", "DocumentDate", "documentDate"]),
      ),
      document_type:
        text(valueFrom(row, ["ประเภท", "DocumentType", "documentType"])) || null,
      urgency: text(valueFrom(row, ["ชั้นความเร็ว", "Urgency", "urgency"])) || null,
      status: mapBookStatus(valueFrom(row, ["สถานะ", "Status", "status"])),
      note: text(valueFrom(row, ["หมายเหตุ", "Note", "note"])) || null,
      source_system: "smart-area-legacy",
      is_active: true,
      legacy_payload: row,
    };

    if (dryRun) {
      booksByLegacyId.set(legacyId, { id: null });
      continue;
    }

    const { data, error } = await supabase
      .from("smart_area_books")
      .upsert(payload, { onConflict: "legacy_smart_area_id" })
      .select("id")
      .single();

    if (error) {
      report.errors.push({ type: "book", legacyId, message: error.message });
      continue;
    }

    report.books.upserted += 1;
    booksByLegacyId.set(legacyId, { id: data.id });
  }

  if (!dryRun) {
    const { data, error } = await supabase
      .from("smart_area_books")
      .select("id, legacy_smart_area_id");
    if (error) throw error;
    for (const row of data ?? []) {
      booksByLegacyId.set(row.legacy_smart_area_id, { id: row.id });
    }
  }

  for (let index = 0; index < source.tasks.length; index += 1) {
    const row = source.tasks[index] ?? {};
    const legacyId = text(
      valueFrom(row, [
        "smartAreaId",
        "SmartAreaId",
        "SmartAreaID",
        "legacy_smart_area_id",
        "legacySmartAreaId",
        "Smart Area ID",
        "เลขต้นเรื่อง Smart Area",
        "เลขต้นเรื่องSmart Area"
      ]),
    );
    const sheetRow =
      nullableInteger(valueFrom(row, ["legacySheetRow", "sheetRow", "row", "_sheetRow"])) ??
      index + 2;

    const legacyTaskKey = `${legacyId}:${sheetRow}`;

    if (ignoredLegacyTaskKeys.has(legacyTaskKey)) {
      continue;
    }

    if (!legacyId) {
      report.tasks.missingLegacyId.push({ index: sheetRow, row });
      continue;
    }

    const book = booksByLegacyId.get(legacyId);
    if (!book) {
      report.tasks.missingBook.push({ legacyId, sheetRow });
      continue;
    }

    const assigneeName = text(
      valueFrom(row, [
        "ผู้รับผิดชอบ",
        "ผู้รับมอบหมาย",
        "AssigneeName",
        "assigneeName",
        "OwnerName",
      ]),
    );
    const match = matchProfile(profileMap, assigneeName);
    const matchEntry = { legacyId, sheetRow, assigneeName };

    if (match.status === "matched") report.tasks.matched.push(matchEntry);
    if (match.status === "unmatched") report.tasks.unmatched.push(matchEntry);
    if (match.status === "ambiguous") {
      report.tasks.ambiguous.push({
        ...matchEntry,
        candidateIds: match.candidates.map((candidate) => candidate.id),
      });
    }

    const payload = {
      book_id: book.id,
      legacy_smart_area_id: legacyId,
      legacy_sheet_row: sheetRow,
      legacy_task_key: legacyTaskKey,
      assignee_id: match.id,
      assignee_name_snapshot: assigneeName || "ไม่ระบุผู้รับมอบหมาย",
      assignment_note:
        text(valueFrom(row, ["หมายเหตุ", "คำสั่ง", "AssignmentNote", "assignmentNote"])) ||
        null,
      status: mapTaskStatus(valueFrom(row, ["สถานะ", "Status", "status"])),
      started_at: nullableTimestamp(
        valueFrom(row, ["StartedAt", "startedAt", "วันที่เริ่มดำเนินการ"]),
      ),
      completed_at: nullableTimestamp(
        valueFrom(row, ["CompletedAt", "completedAt", "วันที่เสร็จ"]),
      ),
      is_active: true,
      legacy_payload: row,
    };

    if (dryRun) continue;

    const { error } = await supabase
      .from("smart_area_tasks")
      .upsert(payload, { onConflict: "legacy_task_key" });

    if (error) {
      report.errors.push({
        type: "task",
        legacyId,
        sheetRow,
        message: error.message,
      });
    } else {
      report.tasks.upserted += 1;
    }
  }

  for (let index = 0; index < source.attachments.length; index += 1) {
    const row = source.attachments[index] ?? {};

    if (isEmptyLegacyRow(row)) {
      continue;
    }
    const legacyId = text(
      valueFrom(row, [
        "smartAreaId",
        "SmartAreaId",
        "SmartAreaID",
        "legacy_smart_area_id",
        "legacySmartAreaId",
        "Smart Area ID",
        "เลขต้นเรื่อง Smart Area",
        "เลขต้นเรื่องSmart Area"
      ]),
    );
    const sheetRow =
      nullableInteger(valueFrom(row, ["legacySheetRow", "sheetRow", "row", "_sheetRow"])) ??
      index + 2;

    if (!legacyId) {
      report.attachments.missingLegacyId.push({ index: sheetRow, row });
      continue;
    }

    const book = booksByLegacyId.get(legacyId);
    if (!book) {
      report.attachments.missingBook.push({ legacyId, sheetRow });
      continue;
    }

    const legacyStatus = text(valueFrom(row, ["สถานะ", "Status", "status"]));
    const sourceUrl = text(
      valueFrom(row, ["SourceURL", "sourceUrl", "source_url", "URLต้นทาง", "ลิงก์ต้นทาง"]),
    );
    const fileUrl = text(
      valueFrom(row, [
        "DriveURL",
        "FileURL",
        "fileUrl",
        "file_url",
        "URL",
        "ไฟล์แนบ",
        "ลิงก์ไฟล์",
      ]),
    );
    const explicitDriveId = text(
      valueFrom(row, ["DriveFileId", "driveFileId", "drive_file_id", "FileId", "fileId"]),
    );
    const resolvedDriveId = explicitDriveId || driveFileId(fileUrl);

    if (!resolvedDriveId && !fileUrl && !sourceUrl) {
      report.attachments.withoutFileReference.push({ legacyId, sheetRow });
    }

    const payload = {
      book_id: book.id,
      legacy_smart_area_id: legacyId,
      legacy_sheet_row: sheetRow,
      legacy_attachment_key: `${legacyId}:${sheetRow}`,
      source_url: sourceUrl || null,
      file_url: fileUrl || sourceUrl || null,
      drive_file_id: resolvedDriveId || null,
      file_name:
        text(valueFrom(row, ["FileName", "fileName", "file_name", "ชื่อไฟล์"])) || null,
      mime_type:
        text(valueFrom(row, ["MimeType", "mimeType", "mime_type", "ชนิดไฟล์"])) || null,
      file_order:
        nullableInteger(valueFrom(row, ["FileOrder", "fileOrder", "file_order", "ลำดับ"])) ??
        0,
      attachment_type: legacyStatus === "ฉบับลงนาม" ? "signed" : "original",
      status: legacyStatus === "ยกเลิก" ? "cancelled" : "active",
      is_active: legacyStatus !== "ยกเลิก",
      legacy_payload: row,
    };

    if (dryRun) continue;

    const { error } = await supabase
      .from("smart_area_attachments")
      .upsert(payload, { onConflict: "legacy_attachment_key" });

    if (error) {
      report.errors.push({
        type: "attachment",
        legacyId,
        sheetRow,
        message: error.message,
      });
    } else {
      report.attachments.upserted += 1;
    }
  }

  const output = await writeReport(report);
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nReport: ${output}`);

  if (dryRun) {
    console.log("\nNo database records were written. Use --execute after review.");
  }

  if (report.errors.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
