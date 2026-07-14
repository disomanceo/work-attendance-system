import "server-only";

import { getLineAdminClient } from "@/lib/line/client";
import { STUDENT_CLASS_LEVELS } from "@/lib/students/settings";
import { isTelegramNotificationEnabled } from "@/lib/telegram/notification-settings";
import { sendTelegramMessage } from "@/lib/telegram/send-message";

type CalendarDayType = "PUBLIC_HOLIDAY" | "SCHOOL_HOLIDAY" | "SPECIAL_WORKDAY";

function getTelegramChatIds() {
  const attendanceChatId =
    process.env.TELEGRAM_ATTENDANCE_CHAT_ID?.trim();

  if (attendanceChatId) {
    return attendanceChatId.startsWith("-")
      ? [attendanceChatId]
      : [];
  }

  const groupChatId = (
    process.env.TELEGRAM_ALLOWED_CHAT_IDS?.trim() || ""
  )
    .split(",")
    .map((value) => value.trim())
    .find((value) => value.startsWith("-"));

  return groupChatId ? [groupChatId] : [];
}

function thaiDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00+07:00`));
}

function isWeekend(value: string) {
  const day = new Date(`${value}T00:00:00+07:00`).getDay();
  return day === 0 || day === 6;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function isWorkingDay(dateKey: string) {
  const admin = getLineAdminClient();
  if (!admin) return true;

  const { data, error } = await admin
    .from("work_calendar_days")
    .select("day_type")
    .eq("work_date", dateKey)
    .maybeSingle();

  if (error) {
    console.error("Cannot load work calendar for student attendance reminder:", error);
    return true;
  }

  const dayType = (data?.day_type || null) as CalendarDayType | null;

  if (dayType === "SPECIAL_WORKDAY") return true;
  if (dayType === "PUBLIC_HOLIDAY" || dayType === "SCHOOL_HOLIDAY") return false;
  return !isWeekend(dateKey);
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

async function logReminder(
  key: string,
  result: unknown,
  sent: boolean
) {
  const admin = getLineAdminClient();
  if (!admin) return;

  await admin.from("line_notification_logs").upsert(
    {
      event_key: key,
      event_type: "student_attendance_missing_telegram",
      group_id: "telegram",
      status: sent ? "sent" : "failed",
      response_detail: result,
      sent_at: sent ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "event_key" }
  );
}

async function loadUncheckedClassLevels(dateKey: string) {
  const admin = getLineAdminClient();
  if (!admin) {
    throw new Error("Supabase server environment variables are not configured");
  }

  const [studentsResult, recordsResult] = await Promise.all([
    admin
      .from("students")
      .select("class_level")
      .eq("status", "active"),
    admin
      .from("student_attendance")
      .select("class_level")
      .eq("attendance_date", dateKey),
  ]);

  if (studentsResult.error || recordsResult.error) {
    throw new Error(
      studentsResult.error?.message ||
        recordsResult.error?.message ||
        "Cannot load student attendance status"
    );
  }

  const activeClassLevels = new Set(
    (studentsResult.data ?? [])
      .map((item) => String(item.class_level || "").trim())
      .filter(Boolean)
  );

  const checkedClassLevels = new Set(
    (recordsResult.data ?? [])
      .map((item) => String(item.class_level || "").trim())
      .filter(Boolean)
  );

  return STUDENT_CLASS_LEVELS.filter(
    (classLevel) =>
      activeClassLevels.has(classLevel) &&
      !checkedClassLevels.has(classLevel)
  );
}

function buildReminderMessage(dateKey: string, classLevels: readonly string[]) {
  const rows = classLevels
    .map((classLevel, index) => `${index + 1}. ${escapeHtml(classLevel)}`)
    .join("\n");

  return [
    "🔔 <b>แจ้งเตือนชั้นเรียนที่ยังไม่ได้เช็คชื่อ</b>",
    `<b>วันที่:</b> ${escapeHtml(thaiDate(dateKey))}`,
    "",
    rows,
  ].join("\n");
}

export async function sendStudentAttendanceReminder(
  requestOrigin: string,
  dateKey: string
) {
  const enabled = await isTelegramNotificationEnabled(
    "student_attendance.missing_reminder"
  );

  if (!enabled) {
    return {
      sent: false,
      skipped: true,
      message: "Telegram student attendance reminder is disabled",
    };
  }

  if (!(await isWorkingDay(dateKey))) {
    return {
      sent: false,
      skipped: true,
      message: "Skipped on non-working day",
    };
  }

  const key = `student-attendance-missing-telegram:${dateKey}:0830`;

  if (await wasSent(key)) {
    return {
      sent: true,
      skipped: true,
      message: "Student attendance reminder already sent",
    };
  }

  const missingClassLevels = await loadUncheckedClassLevels(dateKey);

  if (missingClassLevels.length === 0) {
    return {
      sent: false,
      skipped: true,
      missingClassLevels,
      message: "All class levels already checked",
    };
  }

  const chatIds = getTelegramChatIds();

  if (chatIds.length === 0) {
    const result = {
      sent: false,
      sentCount: 0,
      failedCount: 0,
      totalChatIds: 0,
      missingClassLevels,
      message: "TELEGRAM_ATTENDANCE_CHAT_ID หรือ TELEGRAM_ALLOWED_CHAT_IDS ไม่ได้ตั้งค่าเป็นกลุ่ม",
    };

    await logReminder(key, result, false);
    return result;
  }

  const message = buildReminderMessage(dateKey, missingClassLevels);
  const results = await Promise.allSettled(
    chatIds.map((chatId) =>
      sendTelegramMessage(chatId, message, {
        buttons: [[{ text: "เปิดรายงานการมาเรียน", url: `${requestOrigin}/students/attendance/report` }]],
      })
    )
  );

  const sentCount = results.filter((result) => result.status === "fulfilled").length;
  const failedCount = results.length - sentCount;

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(
        `Telegram student attendance reminder failed for chat ${chatIds[index]}:`,
        result.reason
      );
    }
  });

  const result = {
    sent: sentCount > 0,
    sentCount,
    failedCount,
    totalChatIds: chatIds.length,
    missingClassLevels,
  };

  await logReminder(key, result, result.sent);
  return result;
}
