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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TelegramMessage = {
  text?: string;
  chat?: {
    id?: number;
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

  const received = request.headers.get(
    "x-telegram-bot-api-secret-token",
  );

  return received === expected;
}

function commandMessage(update: TelegramUpdate) {
  return (
    update.message ||
    update.edited_message ||
    update.channel_post
  );
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
      console.error(
        "Telegram registry persistence failed:",
        registryError,
      );
    }

    const message = commandMessage(update);
    const chatId = message?.chat?.id;
    const text = message?.text?.trim();

    if (!chatId || !text) {
      return NextResponse.json({
        ok: true,
        ignored: true,
        registryProcessed: true,
      });
    }

    const allowedChatIds = getAllowedChatIds();

    if (!allowedChatIds.has(String(chatId))) {
      await sendTelegramMessage(
        chatId,
        [
          "⛔ ห้องแชตนี้ยังไม่ได้รับอนุญาตให้ใช้คำสั่ง",
          "",
          "ระบบบันทึกข้อมูล Telegram สำหรับรอผู้ดูแลอนุมัติแล้ว",
        ].join("\n"),
      ).catch((error) => {
        console.error(
          "Telegram access-denied reply failed:",
          error,
        );
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
      reply = buildHelpMessage();
    } else if (command === "summary") {
      try {
        reply = await buildSummaryMessage(
          new URL(request.url).origin,
          getTelegramCommandDate(text) || undefined,
        );
      } catch (error) {
        console.error(
          "Telegram summary command failed:",
          error,
        );

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
    });
  } catch (error) {
    console.error("Telegram webhook error:", error);

    return NextResponse.json({
      ok: true,
      handled: false,
    });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "telegram-webhook",
    registry: true,
  });
}
