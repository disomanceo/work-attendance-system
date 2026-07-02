import { NextResponse } from "next/server";
import {
  buildHelpMessage,
  buildSummaryMessage,
  normalizeTelegramCommand,
} from "@/lib/telegram/commands";
import { sendTelegramMessage } from "@/lib/telegram/send-message";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TelegramUpdate = {
  message?: {
    text?: string;
    chat?: {
      id?: number;
    };
  };
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
      .filter(Boolean)
  );
}

function isValidSecret(request: Request) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();

  if (!expected) return true;

  const received = request.headers.get(
    "x-telegram-bot-api-secret-token"
  );

  return received === expected;
}

export async function POST(request: Request) {
  try {
    if (!isValidSecret(request)) {
      return NextResponse.json(
        { ok: false, message: "Invalid webhook secret" },
        { status: 401 }
      );
    }

    const update = (await request.json()) as TelegramUpdate;
    const chatId = update.message?.chat?.id;
    const text = update.message?.text?.trim();

    if (!chatId || !text) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const allowedChatIds = getAllowedChatIds();

    if (!allowedChatIds.has(String(chatId))) {
      await sendTelegramMessage(
        chatId,
        "⛔ คุณไม่มีสิทธิ์ใช้งานคำสั่งนี้"
      ).catch((error) => {
        console.error("Telegram access-denied reply failed:", error);
      });

      return NextResponse.json({ ok: true, denied: true });
    }

    const command = normalizeTelegramCommand(text);
    let reply: string;

    if (command === "help") {
      reply = buildHelpMessage();
    } else if (command === "summary") {
      try {
        reply = await buildSummaryMessage(
          new URL(request.url).origin
        );
      } catch (error) {
        console.error("Telegram summary command failed:", error);
        reply = [
          "⚠️ <b>ไม่สามารถสร้างสรุปได้ในขณะนี้</b>",
          "",
          "กรุณาตรวจสอบ API รายงานประจำวันและตัวแปร CRON_SECRET",
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

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook error:", error);

    // Always acknowledge Telegram so it does not retry repeatedly.
    return NextResponse.json({ ok: true, handled: false });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "telegram-webhook",
  });
}
