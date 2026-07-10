import { NextResponse } from "next/server";
import {
  buildHelpMessage,
  buildSummaryMessage,
  getTelegramCommandDate,
  normalizeTelegramCommand,
} from "@/lib/telegram/commands";
import {
  registerTelegramUpdate,
  type TelegramRegistryUpdate,
} from "@/lib/telegram/registry";
import { sendTelegramMessage } from "@/lib/telegram/send-message";
import { handleTelegramLinkCommand } from "@/lib/telegram/linking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TelegramMessage = {
  text?: string;
  from?: { id?: number };
  chat?: {
    id?: number;
    type?: "private" | "group" | "supergroup" | "channel" | string;
  };
};

type TelegramUpdate = TelegramRegistryUpdate & {
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
};

function getAllowedChatIds() {
  const configured =
    process.env.TELEGRAM_ALLOWED_CHAT_IDS?.trim() ||
    process.env.TELEGRAM_CHAT_ID?.trim() ||
    "";

  return new Set(
    configured
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function isValidSecret(request: Request) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!expected) return true;
  return request.headers.get("x-telegram-bot-api-secret-token") === expected;
}

function commandMessage(update: TelegramUpdate) {
  return update.message || update.edited_message || update.channel_post;
}

function isActiveTelegramMemberStatus(status: unknown) {
  return ["creator", "administrator", "member", "restricted"].includes(
    String(status ?? ""),
  );
}

async function isMemberOfAllowedGroup(
  telegramUserId: number,
  allowedChatIds: Set<string>,
) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return false;

  const groupChatIds = [...allowedChatIds].filter((chatId) =>
    chatId.startsWith("-"),
  );

  for (const groupChatId of groupChatIds) {
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${token}/getChatMember` +
          `?chat_id=${encodeURIComponent(groupChatId)}` +
          `&user_id=${encodeURIComponent(String(telegramUserId))}`,
        { method: "GET", cache: "no-store" },
      );

      if (!response.ok) continue;

      const payload = (await response.json()) as {
        ok?: boolean;
        result?: { status?: string; is_member?: boolean };
      };

      if (
        payload.ok &&
        payload.result &&
        (isActiveTelegramMemberStatus(payload.result.status) ||
          payload.result.is_member === true)
      ) {
        return true;
      }
    } catch (error) {
      console.error("Telegram private membership verification failed:", error);
    }
  }

  return false;
}

export async function POST(request: Request) {
  try {
    if (!isValidSecret(request)) {
      return NextResponse.json(
        { ok: false, message: "Invalid webhook secret" },
        { status: 401 },
      );
    }

    const update = (await request.json()) as TelegramUpdate;

    try {
      await registerTelegramUpdate(update);
    } catch (registryError) {
      console.error("Telegram registry persistence failed:", registryError);
    }

    const message = commandMessage(update);
    const chatId = message?.chat?.id;
    const chatType = message?.chat?.type;
    const telegramUserId = message?.from?.id;
    const text = message?.text?.trim();

    if (!chatId || !text) {
      return NextResponse.json({
        ok: true,
        ignored: true,
        registryProcessed: true,
      });
    }

    const allowedChatIds = getAllowedChatIds();
    const isPrivateChat = chatType === "private";
    let isAuthorized = allowedChatIds.has(String(chatId));

    if (!isAuthorized && isPrivateChat && telegramUserId) {
      isAuthorized = await isMemberOfAllowedGroup(
        telegramUserId,
        allowedChatIds,
      );
    }

    if (!isAuthorized) {
      await sendTelegramMessage(
        chatId,
        isPrivateChat
          ? [
              "โ” เธขเธฑเธเนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธขเธทเธเธขเธฑเธเธงเนเธฒเน€เธเนเธเธชเธกเธฒเธเธดเธเธเธฅเธธเนเธกเนเธฃเธเน€เธฃเธตเธขเธเนเธ”เน",
              "",
              "เธเธฃเธธเธ“เธฒเน€เธเนเธฒเธฃเนเธงเธกเธเธฅเธธเนเธก Telegram เธเธญเธเนเธฃเธเน€เธฃเธตเธขเธเธเนเธญเธ",
              "เธเธฒเธเธเธฑเนเธเธเธฅเธฑเธเธกเธฒเธเธดเธกเธเน /start เธญเธตเธเธเธฃเธฑเนเธ",
              "",
              "เธซเธกเธฒเธขเน€เธซเธ•เธธ: Bot เธ•เนเธญเธเน€เธเนเธเธเธนเนเธ”เธนเนเธฅเธเธฅเธธเนเธกเน€เธเธทเนเธญเธขเธทเธเธขเธฑเธเธชเธกเธฒเธเธดเธเธญเธฑเธ•เนเธเธกเธฑเธ•เธด",
            ].join("\n")
          : [
              "โ” เธซเนเธญเธเนเธเธ•เธเธตเนเธขเธฑเธเนเธกเนเนเธ”เนเธฃเธฑเธเธญเธเธธเธเธฒเธ•เนเธซเนเนเธเนเธเธณเธชเธฑเนเธ",
              "",
              "เธฃเธฐเธเธเธเธฑเธเธ—เธถเธเธเนเธญเธกเธนเธฅ Telegram เธชเธณเธซเธฃเธฑเธเธฃเธญเธเธนเนเธ”เธนเนเธฅเธญเธเธธเธกเธฑเธ•เธดเนเธฅเนเธง",
            ].join("\n"),
      ).catch((error) => {
        console.error("Telegram access-denied reply failed:", error);
      });

      return NextResponse.json({
        ok: true,
        denied: true,
        registryProcessed: true,
      });
    }

    const linkReply = await handleTelegramLinkCommand({
      text,
      telegramUserId,
      chatId,
      chatType,
    });

    if (linkReply) {
      await sendTelegramMessage(chatId, linkReply);

      return NextResponse.json({
        ok: true,
        registryProcessed: true,
        accountLinkProcessed: true,
      });
    }
    const command = normalizeTelegramCommand(text);
    let reply: string;

    if (command === "help") {
      reply = [
        "โ… เธขเธทเธเธขเธฑเธเธชเธกเธฒเธเธดเธเธเธฅเธธเนเธกเนเธฃเธเน€เธฃเธตเธขเธเธญเธฑเธ•เนเธเธกเธฑเธ•เธดเนเธฅเนเธง",
        "",
        buildHelpMessage(),
      ].join("\n");
    } else if (command === "summary") {
      try {
        reply = await buildSummaryMessage(
          new URL(request.url).origin,
          getTelegramCommandDate(text) || undefined,
        );
      } catch (error) {
        console.error("Telegram summary command failed:", error);
        reply = [
          "โ ๏ธ <b>เนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธชเธฃเนเธฒเธเธชเธฃเธธเธเนเธ”เนเนเธเธเธ“เธฐเธเธตเน</b>",
          "",
          "เธเธฃเธธเธ“เธฒเธ•เธฃเธงเธเธชเธญเธ API เธฃเธฒเธขเธเธฒเธเธเธฃเธฐเธเธณเธงเธฑเธเนเธฅเธฐเธ•เธฑเธงเนเธเธฃ DAILY_REPORT_SECRET",
        ].join("\n");
      }
    } else {
      reply = [
        "เนเธกเนเธฃเธนเนเธเธฑเธเธเธณเธชเธฑเนเธเธเธตเน",
        "",
        "เธเธดเธกเธเน <b>เธเนเธงเธขเน€เธซเธฅเธทเธญ</b> เน€เธเธทเนเธญเธ”เธนเธฃเธฒเธขเธเธฒเธฃเธเธณเธชเธฑเนเธ",
      ].join("\n");
    }

    await sendTelegramMessage(chatId, reply);

    return NextResponse.json({
      ok: true,
      registryProcessed: true,
      privateAutoAuthorized: isPrivateChat,
    });
  } catch (error) {
    console.error("Telegram webhook error:", error);
    return NextResponse.json({ ok: true, handled: false });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "telegram-webhook",
    registry: true,
    privateAutoAuthorization: true,
  });
}
