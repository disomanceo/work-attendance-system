import "server-only";

import { createClient } from "@supabase/supabase-js";
import { notifyTelegramProfiles } from "@/lib/telegram/private-notifications";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !service) {
    throw new Error("Supabase server environment variables are not configured");
  }

  return createClient(url, service, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function appUrl() {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (explicit) return explicit;

  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return production ? `https://${production}` : "http://localhost:3000";
}

function escapeHtml(value: unknown) {
  return String(value ?? "-")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function thaiDate(value: string) {
  const date = new Date(`${value}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

async function loadDirectorProfileIds() {
  const { data, error } = await adminClient()
    .from("profiles")
    .select("id")
    .in("role", ["director", "admin"])
    .eq("account_status", "active");

  if (error) {
    throw new Error(`Cannot load director profiles: ${error.message}`);
  }

  return (data ?? [])
    .map((profile) => String(profile.id || "").trim())
    .filter(Boolean);
}

export async function notifyOfficialDutySubmittedTelegram(input: {
  requestId: string;
  applicantProfileId: string;
  applicantName: string;
  officialDutyNumber?: string | null;
  dutyDate: string;
  dutyEndDate: string;
  totalDays: number;
  subject: string;
  location: string;
  note?: string;
}) {
  const directorProfileIds = await loadDirectorProfileIds();

  if (directorProfileIds.length === 0) {
    return { requested: 0, sent: 0, skipped: 0, failed: 0 };
  }

  const text = [
    "🚗 <b>มีคำขอไปราชการใหม่รอพิจารณา</b>",
    "",
    `ผู้ยื่น: ${escapeHtml(input.applicantName)}`,
    `เลขที่: ${escapeHtml(input.officialDutyNumber || "-")}`,
    `เรื่อง: ${escapeHtml(input.subject)}`,
    `สถานที่: ${escapeHtml(input.location)}`,
    `วันที่: ${escapeHtml(thaiDate(input.dutyDate))} - ${escapeHtml(thaiDate(input.dutyEndDate))}`,
    `จำนวน: ${escapeHtml(input.totalDays)} วัน`,
    ...(input.note ? [`หมายเหตุ: ${escapeHtml(input.note)}`] : []),
    "",
    `เปิดรายการไปราชการ: ${escapeHtml(`${appUrl()}/admin/official-duty`)}`,
  ].join("\n");

  return notifyTelegramProfiles({
    event: "official_duty.submitted",
    recipientProfileIds: directorProfileIds,
    actorProfileId: input.applicantProfileId,
    entityType: "official_duty_request",
    entityId: input.requestId,
    text,
    metadata: {
      officialDutyNumber: input.officialDutyNumber || null,
      dutyDate: input.dutyDate,
      dutyEndDate: input.dutyEndDate,
    },
  });
}

export async function notifyOfficialDutyReviewedTelegram(input: {
  requestId: string;
  applicantProfileId: string;
  reviewerProfileId: string;
  reviewerName: string;
  approved: boolean;
  officialDutyNumber?: string | null;
  dutyDate: string;
  dutyEndDate: string;
  totalDays: number;
  subject: string;
  location: string;
  reviewNote?: string;
  pdfFileUrl?: string | null;
}) {
  const heading = input.approved
    ? "✅ <b>คำขอไปราชการของคุณได้รับอนุญาตแล้ว</b>"
    : "❌ <b>คำขอไปราชการของคุณไม่ได้รับอนุญาต</b>";

  const text = [
    heading,
    "",
    `เลขที่: ${escapeHtml(input.officialDutyNumber || "-")}`,
    `เรื่อง: ${escapeHtml(input.subject)}`,
    `สถานที่: ${escapeHtml(input.location)}`,
    `วันที่: ${escapeHtml(thaiDate(input.dutyDate))} - ${escapeHtml(thaiDate(input.dutyEndDate))}`,
    `จำนวน: ${escapeHtml(input.totalDays)} วัน`,
    `ผู้พิจารณา: ${escapeHtml(input.reviewerName)}`,
    ...(input.reviewNote
      ? [`หมายเหตุ: ${escapeHtml(input.reviewNote)}`]
      : []),
    ...(input.pdfFileUrl
      ? ["", `เปิดเอกสาร PDF: ${escapeHtml(input.pdfFileUrl)}`]
      : []),
  ].join("\n");

  return notifyTelegramProfiles({
    event: input.approved
      ? "official_duty.approved"
      : "official_duty.rejected",
    recipientProfileIds: [input.applicantProfileId],
    actorProfileId: input.reviewerProfileId,
    entityType: "official_duty_request",
    entityId: input.requestId,
    text,
    metadata: {
      officialDutyNumber: input.officialDutyNumber || null,
      approved: input.approved,
    },
  });
}
