import "server-only";

import { createClient } from "@supabase/supabase-js";
import { notifyTelegramProfiles } from "@/lib/telegram/private-notifications";

type LeaveRequest = {
  id: string;
  user_id: string;
  leave_number: string | null;
  leave_type: string;
  start_date: string;
  end_date: string;
  total_work_days: number | null;
  reason: string | null;
  review_note: string | null;
  reviewed_at: string | null;
};

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

function leaveTypeLabel(value: string) {
  return value === "sick" ? "ลาป่วย" : "ลากิจ";
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

export async function notifyLeaveSubmittedTelegram(input: {
  requestId: string;
  applicantProfileId: string;
  applicantName: string;
  leaveNumber: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
}) {
  const directorProfileIds = await loadDirectorProfileIds();

  if (directorProfileIds.length === 0) {
    return { requested: 0, sent: 0, skipped: 0, failed: 0 };
  }

  const text = [
    "📝 <b>มีคำขอลาใหม่รอพิจารณา</b>",
    "",
    `ผู้ยื่น: ${escapeHtml(input.applicantName)}`,
    `เลขที่: ${escapeHtml(input.leaveNumber)}`,
    `ประเภท: ${escapeHtml(leaveTypeLabel(input.leaveType))}`,
    `วันที่: ${escapeHtml(thaiDate(input.startDate))} - ${escapeHtml(thaiDate(input.endDate))}`,
    `จำนวน: ${escapeHtml(input.totalDays)} วัน`,
    `เหตุผล: ${escapeHtml(input.reason)}`,
    "",
    `เปิดรายการลา: ${escapeHtml(`${appUrl()}/admin/leave`)}`,
  ].join("\n");

  return notifyTelegramProfiles({
    event: "leave.submitted",
    recipientProfileIds: directorProfileIds,
    actorProfileId: input.applicantProfileId,
    entityType: "leave_request",
    entityId: input.requestId,
    text,
    metadata: {
      leaveNumber: input.leaveNumber,
      leaveType: input.leaveType,
    },
  });
}

export async function notifyLeaveReviewedTelegram(input: {
  requestId: string;
  applicantProfileId: string;
  reviewerProfileId: string;
  reviewerName: string;
  approved: boolean;
  leaveNumber: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reviewNote?: string;
  pdfFileUrl?: string;
}) {
  const heading = input.approved
    ? "✅ <b>คำขอลาของคุณได้รับการอนุมัติแล้ว</b>"
    : "❌ <b>คำขอลาของคุณไม่ได้รับการอนุมัติ</b>";

  const text = [
    heading,
    "",
    `เลขที่: ${escapeHtml(input.leaveNumber)}`,
    `ประเภท: ${escapeHtml(leaveTypeLabel(input.leaveType))}`,
    `วันที่: ${escapeHtml(thaiDate(input.startDate))} - ${escapeHtml(thaiDate(input.endDate))}`,
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
    event: input.approved ? "leave.approved" : "leave.rejected",
    recipientProfileIds: [input.applicantProfileId],
    actorProfileId: input.reviewerProfileId,
    entityType: "leave_request",
    entityId: input.requestId,
    text,
    metadata: {
      leaveNumber: input.leaveNumber,
      leaveType: input.leaveType,
      approved: input.approved,
    },
  });
}
