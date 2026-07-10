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
              "⛔ ยังไม่สามารถยืนยันว่าเป็นสมาชิกกลุ่มโรงเรียนได้",
              "",
              "กรุณาเข้าร่วมกลุ่ม Telegram ของโรงเรียนก่อน",
              "จากนั้นกลับมาพิมพ์ /start อีกครั้ง",
              "",
              "หมายเหตุ: Bot ต้องเป็นผู้ดูแลกลุ่มเพื่อยืนยันสมาชิกอัตโนมัติ",
            ].join("\n")
          : [
              "⛔ ห้องแชตนี้ยังไม่ได้รับอนุญาตให้ใช้คำสั่ง",
              "",
              "ระบบบันทึกข้อมูล Telegram สำหรับรอผู้ดูแลอนุมัติแล้ว",
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

    const command = normalizeTelegramCommand(text);
    let reply: string;

    if (command === "help") {
      reply = [
        "✅ ยืนยันสมาชิกกลุ่มโรงเรียนอัตโนมัติแล้ว",
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
          "⚠️ <b>ไม่สามารถสร้างสรุปได้ในขณะนี้</b>",
          "",
          "กรุณาตรวจสอบ API รายงานประจำวันและตัวแปร DAILY_REPORT_SECRET",
        ].join("\n");
      }
    } else {
      reply = [
        "ไม่รู้จักคำสั่งนี้",
        "",
        "พิมพ์ <b>ช่วยเหลือ</b> เพื่อดูรายการคำสั่ง",
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
    accountLinkBeforeAuthorization: true,
  });
}
