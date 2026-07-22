import "server-only";

function splitChatIds(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getTelegramGroupChatIds() {
  const attendanceChatId = process.env.TELEGRAM_ATTENDANCE_CHAT_ID?.trim();

  if (attendanceChatId) {
    return attendanceChatId.startsWith("-") ? [attendanceChatId] : [];
  }

  return splitChatIds(
    process.env.TELEGRAM_ALLOWED_CHAT_IDS?.trim() ||
      process.env.TELEGRAM_CHAT_ID?.trim() ||
      "",
  ).filter((value) => value.startsWith("-"));
}
