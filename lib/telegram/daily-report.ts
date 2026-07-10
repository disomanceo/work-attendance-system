import "server-only";

import { getLineAdminClient } from "@/lib/line/client";
import { buildSummaryMessage } from "@/lib/telegram/commands";
import { sendTelegramMessage } from "@/lib/telegram/send-message";

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

async function logDailyTelegram(
  key: string,
  result: unknown,
  sent: boolean
) {
  const admin = getLineAdminClient();
  if (!admin) return;

  await admin.from("line_notification_logs").upsert(
    {
      event_key: key,
      event_type: "attendance_daily_telegram",
      group_id: "telegram",
      status: sent ? "sent" : "failed",
      response_detail: result,
      sent_at: sent ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "event_key" }
  );
}

export async function sendDailyTelegramReport(
  requestOrigin: string,
  dateKey: string
) {
  const key = `attendance-daily-telegram:${dateKey}`;

  if (await wasSent(key)) {
    return {
      sent: true,
      skipped: true,
      sentCount: 0,
      failedCount: 0,
      totalChatIds: 0,
      message: "Telegram daily report already sent",
    };
  }

  const chatIds = getTelegramChatIds();

  if (chatIds.length === 0) {
    const result = {
      sent: false,
      sentCount: 0,
      failedCount: 0,
      totalChatIds: 0,
      message:
        "TELEGRAM_ALLOWED_CHAT_IDS à¸«à¸£à¸·à¸­ TELEGRAM_CHAT_ID à¹„à¸¡à¹ˆà¹„à¸”à¹‰à¸•à¸±à¹‰à¸‡à¸„à¹ˆà¸²",
    };

    await logDailyTelegram(key, result, false);
    return result;
  }

  const message = await buildSummaryMessage(
    requestOrigin,
    dateKey
  );

  const results = await Promise.allSettled(
    chatIds.map((chatId) =>
      sendTelegramMessage(chatId, message)
    )
  );

  const sentCount = results.filter(
    (result) => result.status === "fulfilled"
  ).length;

  const failedCount = results.length - sentCount;

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(
        `Telegram daily report failed for chat ${chatIds[index]}:`,
        result.reason
      );
    }
  });

  const result = {
    sent: sentCount > 0,
    sentCount,
    failedCount,
    totalChatIds: chatIds.length,
  };

  await logDailyTelegram(key, result, result.sent);
  return result;
}
