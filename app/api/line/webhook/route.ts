import crypto from "node:crypto";
import { NextResponse } from "next/server";
import {
  getLineAdminClient,
  getLineGroupSummary,
  replyLineMessages,
} from "@/lib/line/client";
import { helpFlex } from "@/lib/line/flex";
import {
  buildAttendanceReportMessage,
  currentBangkokDateKey,
  currentBangkokTime,
} from "@/lib/line/notifications";
import {
  parseReportDateFromText,
  removeReportDateFromText,
} from "@/lib/attendance-report-date";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type LineEvent = {
  type?: string;
  replyToken?: string;
  source?: {
    type?: string;
    groupId?: string;
  };
  message?: {
    type?: string;
    text?: string;
  };
};

const HELP_COMMANDS = new Set([
  "ช่วยเหลือ",
  "คำสั่ง",
  "เมนู",
  "help",
]);

const SUMMARY_COMMANDS = new Set([
  "สรุป",
  "สรุปวันนี้",
  "รายงาน",
  "รายงานวันนี้",
  "รายงานลงเวลา",
  "สรุปการลงเวลา",
  "ลงเวลาวันนี้",
]);

function normalizeCommand(value: string) {
  return removeReportDateFromText(value)
    .trim()
    .toLocaleLowerCase("th-TH")
    .replace(/\s+/g, " ");
}

function validSignature(body: string, signature: string) {
  const secret = process.env.LINE_CHANNEL_SECRET?.trim();
  if (!secret || !signature) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("base64");

  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  return (
    actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

async function saveGroup(groupId: string) {
  const admin = getLineAdminClient();
  if (!admin) {
    throw new Error("Supabase Environment Variables ยังไม่ครบ");
  }

  const summary = await getLineGroupSummary(groupId);

  const { error } = await admin
    .from("line_notification_settings")
    .upsert(
      {
        id: 1,
        group_id: groupId,
        group_name: summary?.groupName || null,
        is_enabled: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

  if (error) throw new Error(error.message);
}

async function handleCommand(event: LineEvent) {
  if (
    event.type !== "message" ||
    event.message?.type !== "text" ||
    !event.message.text ||
    !event.replyToken
  ) {
    return;
  }

  const command = normalizeCommand(event.message.text);

  if (HELP_COMMANDS.has(command)) {
    const result = await replyLineMessages(event.replyToken, [helpFlex()]);
    if (!result.ok) {
      console.error("LINE help command reply error:", result);
    }
    return;
  }

  if (SUMMARY_COMMANDS.has(command)) {
    const requestedDate =
      parseReportDateFromText(event.message.text) ||
      currentBangkokDateKey();
    const report = await buildAttendanceReportMessage(
      requestedDate,
      requestedDate === currentBangkokDateKey()
        ? currentBangkokTime()
        : "ย้อนหลัง"
    );

    if (!report.ok) {
      const result = await replyLineMessages(event.replyToken, [
        {
          type: "text",
          text: `ไม่สามารถสร้างรายงานได้: ${report.message}`,
        },
      ]);

      if (!result.ok) {
        console.error("LINE summary error reply failed:", result);
      }
      return;
    }

    const result = await replyLineMessages(
      event.replyToken,
      [report.message]
    );

    if (!result.ok) {
      console.error("LINE summary command reply error:", result);
    }
  }
}

export async function POST(request: Request) {
  const body = await request.text();
  const signature =
    request.headers.get("x-line-signature") ?? "";

  if (!validSignature(body, signature)) {
    return NextResponse.json(
      {
        ok: false,
        message: "LINE signature ไม่ถูกต้อง",
      },
      { status: 401 }
    );
  }

  let payload: { events?: LineEvent[] };

  try {
    payload = JSON.parse(body) as { events?: LineEvent[] };
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: "รูปแบบ Webhook ไม่ถูกต้อง",
      },
      { status: 400 }
    );
  }

  try {
    for (const event of payload.events ?? []) {
      const groupId =
        event.source?.type === "group"
          ? event.source.groupId
          : undefined;

      if (groupId) {
        await saveGroup(groupId);
      }

      await handleCommand(event);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("LINE webhook error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "ประมวลผล LINE Webhook ไม่สำเร็จ",
      },
      { status: 500 }
    );
  }
}
