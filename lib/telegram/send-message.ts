import "server-only";

export type TelegramInlineButton = {
  text: string;
  url: string;
};

type TelegramApiResult = {
  ok?: boolean;
  description?: string;
};

export async function sendTelegramMessage(
  chatId: string | number,
  text: string,
  options?: {
    buttons?: TelegramInlineButton[][];
  }
) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();

  if (!botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

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
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
          ...(options?.buttons?.length
            ? {
                reply_markup: {
                  inline_keyboard: options.buttons,
                },
              }
            : {}),
        }),
        signal: controller.signal,
        cache: "no-store",
      }
    );

    const result = (await response.json()) as TelegramApiResult;

    if (!response.ok || !result.ok) {
      throw new Error(
        result.description ||
          `Telegram API returned HTTP ${response.status}`
      );
    }

    return { sent: true };
  } finally {
    clearTimeout(timeout);
  }
}
