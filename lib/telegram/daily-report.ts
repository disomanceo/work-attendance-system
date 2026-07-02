import "server-only";

import { buildSummaryMessage } from "@/lib/telegram/commands";
import { sendTelegramMessage } from "@/lib/telegram/send-message";

function getTelegramChatIds() {
  const configured =
    process.env.TELEGRAM_ALLOWED_CHAT_IDS?.trim() ||
    process.env.TELEGRAM_CHAT_ID?.trim() ||
    "";

  return configured
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function sendDailyTelegramReport(
  requestOrigin: string
) {
  const chatIds = getTelegramChatIds();

  if (chatIds.length === 0) {
    return {
      sent: false,
      sentCount: 0,
      failedCount: 0,
      totalChatIds: 0,
      message:
        "TELEGRAM_ALLOWED_CHAT_IDS หรือ TELEGRAM_CHAT_ID ไม่ได้ตั้งค่า",
    };
  }

  const message = await buildSummaryMessage(requestOrigin);

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

  return {
    sent: sentCount > 0,
    sentCount,
    failedCount,
    totalChatIds: chatIds.length,
  };
}
