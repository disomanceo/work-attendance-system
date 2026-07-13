import "server-only";

import { isTelegramNotificationEnabled } from "@/lib/telegram/notification-settings";

type TelegramCheckInInput = {
  fullName: string;
  checkInAt: string;
  checkInStatus: string | null;
  note: string | null;
  distanceMeters: number | null;
  schoolName: string | null;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function formatBangkokDate(isoDate: string) {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(isoDate));
}

function formatBangkokTime(isoDate: string) {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(isoDate));
}

function getStatusLabel(checkInStatus: string | null, note: string | null) {
  if (note === "ปฏิบัติราชการก่อนเข้าโรงเรียน") {
    return {
      icon: "🚗",
      label: "ไปราชการก่อนเข้าโรงเรียน",
    };
  }

  if (checkInStatus === "late") {
    return {
      icon: "⏰",
      label: "มาสาย",
    };
  }

  return {
    icon: "✅",
    label: "ปกติ",
  };
}

export async function sendTelegramCheckInNotification(
  input: TelegramCheckInInput,
) {
  const environmentEnabled =
    process.env.TELEGRAM_CHECKIN_ENABLED?.trim().toLowerCase() === "true";

  if (!environmentEnabled) {
    return {
      sent: false,
      skipped: true,
      reason: "telegram_checkin_environment_disabled",
    };
  }

  const settingEnabled = await isTelegramNotificationEnabled(
    "attendance.check_in_group",
  );

  if (!settingEnabled) {
    return {
      sent: false,
      skipped: true,
      reason: "notification_disabled",
    };
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId =
    process.env.TELEGRAM_ATTENDANCE_CHAT_ID?.trim() ||
    process.env.TELEGRAM_ALLOWED_CHAT_IDS?.split(",")
      .map((value) => value.trim())
      .find((value) => value.startsWith("-")) ||
    "";

  if (!botToken || !chatId) {
    throw new Error("Telegram environment variables are not configured");
  }

  const status = getStatusLabel(input.checkInStatus, input.note);
  const distanceText =
    typeof input.distanceMeters === "number"
      ? `${Math.round(input.distanceMeters).toLocaleString("th-TH")} เมตร`
      : "-";
  const schoolName =
    input.schoolName?.trim() || "โรงเรียนวัดไผ่มุ้ง";

  const message = [
    `${status.icon} <b>มีผู้เช็กอินเข้าปฏิบัติงาน</b>`,
    "",
    `<b>ชื่อ:</b> ${escapeHtml(input.fullName)}`,
    `<b>วันที่:</b> ${escapeHtml(formatBangkokDate(input.checkInAt))}`,
    `<b>เวลา:</b> ${escapeHtml(formatBangkokTime(input.checkInAt))} น.`,
    `<b>สถานะ:</b> ${escapeHtml(status.label)}`,
    `<b>สถานที่:</b> ${escapeHtml(schoolName)}`,
    `<b>ระยะห่าง:</b> ${escapeHtml(distanceText)}`,
  ].join("\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
        signal: controller.signal,
        cache: "no-store",
      },
    );

    const result = (await response.json()) as {
      ok?: boolean;
      description?: string;
    };

    if (!response.ok || !result.ok) {
      throw new Error(
        result.description || `Telegram API returned HTTP ${response.status}`,
      );
    }

    return {
      sent: true,
    };
  } finally {
    clearTimeout(timeout);
  }
}
