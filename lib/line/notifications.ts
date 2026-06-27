import {
  getLineAdminClient,
  getLineTarget,
  pushLineMessages,
  type LineMessage,
} from "./client";
import {
  attendanceDailyFlex,
  leaveReviewedFlex,
  leaveSubmittedFlex,
} from "./flex";

function appUrl() {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (explicit) return explicit;

  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return production ? `https://${production}` : "http://localhost:3000";
}

function thaiDate(value: string, short = false) {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    ...(short ? {} : { weekday: "long" }),
    day: "numeric",
    month: short ? "short" : "long",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00+07:00`));
}

function thaiTime(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function currentBangkokDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function currentBangkokTime() {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

async function wasSent(key: string) {
  const admin = getLineAdminClient();
  if (!admin) return false;

  const { data } = await admin
    .from("line_notification_logs")
    .select("status")
    .eq("event_key", key)
    .maybeSingle();

  return data?.status === "sent";
}

async function log(
  key: string,
  type: string,
  groupId: string,
  result: unknown,
  sent: boolean
) {
  const admin = getLineAdminClient();
  if (!admin) return;

  await admin.from("line_notification_logs").upsert(
    {
      event_key: key,
      event_type: type,
      group_id: groupId,
      status: sent ? "sent" : "failed",
      response_detail: result,
      sent_at: sent ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "event_key" }
  );
}

export async function notifyLeaveSubmitted(i: {
  requestId: string;
  fullName: string;
  position: string;
  leaveType: "personal" | "sick";
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  leaveNumber: string;
}) {
  const target = await getLineTarget();
  if (!target.ok || !target.settings.notify_leave_submitted) return target;

  const key = `leave-submitted:${i.requestId}`;
  if (await wasSent(key)) return { ok: true as const, skipped: true };

  const message = leaveSubmittedFlex({
    fullName: i.fullName,
    position: i.position,
    leaveTypeLabel: i.leaveType === "sick" ? "ลาป่วย" : "ลากิจ",
    startDate: thaiDate(i.startDate, true),
    endDate: thaiDate(i.endDate, true),
    totalDays: i.totalDays,
    reason: i.reason,
    leaveNumber: i.leaveNumber,
    appUrl: appUrl(),
  });

  const result = await pushLineMessages(target.groupId, [message]);
  await log(key, "leave_submitted", target.groupId, result, result.ok);
  return result;
}

export async function notifyLeaveReviewed(i: {
  requestId: string;
  fullName: string;
  leaveType: "personal" | "sick";
  startDate: string;
  endDate: string;
  totalDays: number;
  approved: boolean;
  reviewerName: string;
  reviewNote: string;
  leaveNumber: string;
}) {
  const target = await getLineTarget();
  if (!target.ok || !target.settings.notify_leave_reviewed) return target;

  const key = `leave-reviewed:${i.requestId}:${i.approved ? "approved" : "rejected"}`;
  if (await wasSent(key)) return { ok: true as const, skipped: true };

  const message = leaveReviewedFlex({
    fullName: i.fullName,
    leaveTypeLabel: i.leaveType === "sick" ? "ลาป่วย" : "ลากิจ",
    startDate: thaiDate(i.startDate, true),
    endDate: thaiDate(i.endDate, true),
    totalDays: i.totalDays,
    approved: i.approved,
    reviewerName: i.reviewerName,
    reviewNote: i.reviewNote,
    leaveNumber: i.leaveNumber,
    appUrl: appUrl(),
  });

  const result = await pushLineMessages(target.groupId, [message]);
  await log(key, "leave_reviewed", target.groupId, result, result.ok);
  return result;
}

export async function buildAttendanceReportMessage(
  dateKey: string,
  reportTime = currentBangkokTime()
): Promise<
  | { ok: true; message: LineMessage }
  | { ok: false; message: string; detail?: unknown }
> {
  const admin = getLineAdminClient();
  if (!admin) {
    return { ok: false, message: "สร้าง Supabase Admin Client ไม่สำเร็จ" };
  }

  const [profilesResult, recordsResult, leavesResult] = await Promise.all([
    admin
      .from("profiles")
      .select("id,full_name,role,position,account_status")
      .eq("account_status", "active")
      .in("role", ["director", "teacher", "staff", "janitor"]),
    admin
      .from("attendance_records")
      .select("user_id,work_date,check_in_at,check_in_status,note")
      .eq("work_date", dateKey)
      .order("check_in_at", { ascending: true }),
    admin
      .from("leave_requests")
      .select("user_id,leave_type,start_date,end_date,status")
      .eq("status", "approved")
      .lte("start_date", dateKey)
      .gte("end_date", dateKey),
  ]);

  if (profilesResult.error || recordsResult.error || leavesResult.error) {
    return {
      ok: false,
      message: "โหลดข้อมูลรายงานไม่สำเร็จ",
      detail: {
        profiles: profilesResult.error?.message,
        records: recordsResult.error?.message,
        leaves: leavesResult.error?.message,
      },
    };
  }

  const profiles = profilesResult.data ?? [];
  const records = recordsResult.data ?? [];
  const leaves = leavesResult.data ?? [];
  const profileMap = new Map(profiles.map((item) => [item.id, item]));
  const validRecords = records.filter((item) => profileMap.has(item.user_id));

  const attendedIds = new Set(validRecords.map((item) => item.user_id));
  const leaveIds = new Set(leaves.map((item) => item.user_id));
  const missing = profiles.filter(
    (item) => !attendedIds.has(item.id) && !leaveIds.has(item.id)
  );
  const sick = leaves.filter((item) => item.leave_type === "sick");
  const personal = leaves.filter((item) => item.leave_type === "personal");

  const attendance = validRecords.map((record) => {
    const profile = profileMap.get(record.user_id);
    return {
      time: thaiTime(record.check_in_at),
      name: profile?.full_name || "ไม่พบชื่อ",
      late: record.check_in_status === "late",
    };
  });

  const noteLines = [
    ...sick.map(
      (item) => `${profileMap.get(item.user_id)?.full_name || "ไม่พบชื่อ"} — ลาป่วย`
    ),
    ...personal.map(
      (item) => `${profileMap.get(item.user_id)?.full_name || "ไม่พบชื่อ"} — ลากิจ`
    ),
    ...missing.map((item) => `${item.full_name} — ยังไม่ได้ลงเวลา`),
  ];

  return {
    ok: true,
    message: attendanceDailyFlex({
      thaiDate: thaiDate(dateKey),
      reportTime,
      attendance,
      noteLines,
      appUrl: appUrl(),
    }),
  };
}

export async function sendDailyAttendanceReport(dateKey: string) {
  const target = await getLineTarget();
  if (!target.ok || !target.settings.notify_daily_attendance) return target;

  const key = `attendance-daily:${dateKey}`;
  if (await wasSent(key)) {
    return { ok: true as const, skipped: true, message: "รายงานวันนี้ส่งแล้ว" };
  }

  const report = await buildAttendanceReportMessage(dateKey, "08:15");

  if (!report.ok) {
    await log(
      key,
      "attendance_daily",
      target.groupId,
      report.detail || report.message,
      false
    );
    return report;
  }

  const result = await pushLineMessages(target.groupId, [report.message]);
  await log(key, "attendance_daily", target.groupId, result, result.ok);
  return result;
}
