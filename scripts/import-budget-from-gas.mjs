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
      await loadEnvText(await fs.readFile(path.resolve(name), "utf8"));
    } catch {}
  }
}

const text = (value, fallback = "") => {
  const result = String(value ?? "").trim();
  return result || fallback;
};

const money = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? "").replace(/,/g, "").trim();
  const parsed = Number(normalized || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

function nullableDate(value) {
  const raw = text(value);
  if (!raw) return null;
  const direct = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (direct) return `${direct[1]}-${direct[2]}-${direct[3]}`;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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

function normalizeAttachments(row) {
  return parseJsonArray(row.AttachmentsJSON ?? row.Attachments)
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const url = text(item.url ?? item.webViewLink);
      const id = text(item.drive_file_id ?? item.fileId ?? item.id) || driveFileId(url);
      if (!url || !id) return null;
      return {
        drive_file_id: id,
        file_name: text(item.name ?? item.fileName, "ไฟล์แนบ"),
        file_url: url,
        mime_type: text(item.mimeType) || null,
        legacy_payload: item,
      };
    })
    .filter(Boolean);
}

async function fetchGasProjects() {
  const base =
    process.env.BUDGET_GAS_WEB_APP_URL?.trim() ||
    process.env.BUDGET_GAS_API_URL?.trim();
  const secret = process.env.BUDGET_GAS_API_SECRET?.trim();

  if (!base || !secret) {
    throw new Error(
      "ต้องตั้งค่า BUDGET_GAS_WEB_APP_URL หรือ BUDGET_GAS_API_URL และ BUDGET_GAS_API_SECRET",
    );
  }

  const url = new URL(base);
  url.searchParams.set("secret", secret);
  const response = await fetch(url, {
    method: "GET",
    redirect: "follow",
    signal: AbortSignal.timeout(180000),
  });
  const raw = await response.text();
  let result;
  try {
    result = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`GAS ตอบกลับไม่ใช่ JSON (HTTP ${response.status})`);
  }
  if (!response.ok || result.ok === false || !Array.isArray(result.projects)) {
    throw new Error(result.message || `โหลดโครงการจาก GAS ไม่สำเร็จ (${response.status})`);
  }
  return result.projects;
}

async function findProfileMap(supabase) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("account_status", "active");
  if (error) throw error;
  return new Map(
    (data ?? [])
      .filter((profile) => text(profile.full_name))
      .map((profile) => [text(profile.full_name).toLocaleLowerCase("th"), profile.id]),
  );
}

async function main() {
  await loadLocalEnv();
  const execute = process.argv.includes("--execute");
  const dryRun = !execute;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRole) {
    throw new Error("ยังตั้งค่า NEXT_PUBLIC_SUPABASE_URL หรือ SUPABASE_SERVICE_ROLE_KEY ไม่ครบ");
  }

  const supabase = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const projects = await fetchGasProjects();
  const profiles = await findProfileMap(supabase);

  const report = {
    mode: dryRun ? "dry-run" : "execute",
    sourceProjects: projects.length,
    sourceActivities: 0,
    sourceAttachments: 0,
    projectsUpserted: 0,
    activitiesUpserted: 0,
    attachmentsUpserted: 0,
    missingProjectIds: [],
    unmatchedOwners: [],
    attachmentsWithoutDriveId: [],
    errors: [],
  };

  for (let projectIndex = 0; projectIndex < projects.length; projectIndex += 1) {
    const row = projects[projectIndex] ?? {};
    console.log(
      `[${projectIndex + 1}/${projects.length}] ${text(
        row.ProjectName,
        text(row.ID, "Unnamed project"),
      )}`,
    );
    const legacyId = text(row.ID ?? row.ProjectID ?? row.id);
    if (!legacyId) {
      report.missingProjectIds.push({ index: projectIndex, name: text(row.ProjectName) });
      continue;
    }

    const ownerName = text(row.OwnerName);
    const ownerId = ownerName
      ? profiles.get(ownerName.toLocaleLowerCase("th")) ?? null
      : null;
    if (ownerName && !ownerId && !report.unmatchedOwners.includes(ownerName)) {
      report.unmatchedOwners.push(ownerName);
    }

    const activities = Array.isArray(row.ActivitiesList) ? row.ActivitiesList : [];
    const attachments = normalizeAttachments(row);
    report.sourceActivities += activities.length;
    report.sourceAttachments += attachments.length;

    const projectPayload = {
      legacy_project_id: legacyId,
      project_code: text(row.ProjectCode) || null,
      fiscal_year: Number.parseInt(text(row.FiscalYear), 10) || null,
      name: text(row.ProjectName, "ยังไม่ระบุชื่อโครงการ"),
      plan_name: text(row.PlanName) || null,
      department: text(row.Department ?? row.PlanName) || null,
      owner_id: ownerId,
      owner_name_snapshot: ownerName || null,
      status: text(row.Status, "ยังไม่เริ่ม"),
      approved_budget: money(row.ApprovedBudget),
      legacy_actual_amount: money(row.SpentBudget),
      start_date: nullableDate(row.StartDate),
      end_date: nullableDate(row.EndDate),
      funding_sources: parseJsonArray(row.FundingSources ?? row.BudgetSources),
      custom_funding_source: text(row.CustomFundingSource) || null,
      source_system: "google_sheets_import",
      legacy_payload: row,
    };

    if (dryRun) continue;

    const { data: savedProject, error: projectError } = await supabase
      .from("budget_projects")
      .upsert(projectPayload, { onConflict: "legacy_project_id" })
      .select("id")
      .single();

    if (projectError) {
      report.errors.push({ type: "project", legacyId, message: projectError.message });
      continue;
    }
    report.projectsUpserted += 1;

    for (let activityIndex = 0; activityIndex < activities.length; activityIndex += 1) {
      const activity = activities[activityIndex] ?? {};
      const legacyActivityId =
        text(activity.ID ?? activity.ActivityID ?? activity.id) ||
        `${legacyId}-A${activityIndex + 1}`;
      const activityOwner = text(activity.OwnerName);
      const activityOwnerId = activityOwner
        ? profiles.get(activityOwner.toLocaleLowerCase("th")) ?? null
        : null;
      if (
        activityOwner &&
        !activityOwnerId &&
        !report.unmatchedOwners.includes(activityOwner)
      ) {
        report.unmatchedOwners.push(activityOwner);
      }

      const { error: activityError } = await supabase
        .from("budget_activities")
        .upsert(
          {
            project_id: savedProject.id,
            legacy_activity_id: legacyActivityId,
            name: text(activity.ActivityName, "ยังไม่ระบุชื่อกิจกรรม"),
            owner_id: activityOwnerId,
            owner_name_snapshot: activityOwner || null,
            status: text(activity.Status, "ยังไม่เริ่ม"),
            funding_source: text(activity.BudgetSource) || null,
            approved_budget: money(activity.ApprovedBudget),
            legacy_actual_amount: money(activity.SpentBudget),
            start_date: nullableDate(activity.StartDate),
            end_date: nullableDate(activity.EndDate),
            sort_order: activityIndex,
            legacy_payload: activity,
          },
          { onConflict: "project_id,legacy_activity_id" },
        );
      if (activityError) {
        report.errors.push({
          type: "activity",
          legacyId,
          legacyActivityId,
          message: activityError.message,
        });
      } else {
        report.activitiesUpserted += 1;
      }
    }

    for (const attachment of attachments) {
      const { error: attachmentError } = await supabase
        .from("budget_project_attachments")
        .upsert(
          {
            project_id: savedProject.id,
            activity_id: null,
            ...attachment,
            is_active: true,
          },
          { onConflict: "drive_file_id", ignoreDuplicates: false },
        );
      if (attachmentError) {
        report.errors.push({
          type: "attachment",
          legacyId,
          driveFileId: attachment.drive_file_id,
          message: attachmentError.message,
        });
      } else {
        report.attachmentsUpserted += 1;
      }
    }
  }

  report.unmatchedOwners.sort((a, b) => a.localeCompare(b, "th"));
  const outputDir = path.resolve("migration-reports");
  await fs.mkdir(outputDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const output = path.join(outputDir, `budget-import-${stamp}.json`);
  await fs.writeFile(output, JSON.stringify(report, null, 2), "utf8");

  console.log(JSON.stringify(report, null, 2));
  console.log(`\nรายงาน: ${output}`);
  if (dryRun) {
    console.log("\nยังไม่ได้เขียนข้อมูล ใช้ --execute เมื่อตรวจรายงานเรียบร้อย");
  }
  if (report.errors.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
