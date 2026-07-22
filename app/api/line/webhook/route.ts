import crypto from "node:crypto";
import { NextResponse } from "next/server";
import {
  getLineAdminClient,
  getLineGroupSummary,
  replyLineMessages,
} from "@/lib/line/client";
import {
  directorAnnouncementFlex,
  getDirectorLineMemberName,
  replyDirectorLineMessages,
} from "@/lib/line/director-announcements";
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
    userId?: string;
  };
  message?: {
    type?: string;
    text?: string;
  };
  postback?: {
    data?: string;
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

type LineChannel = "default" | "director";

function signatureMatches(body: string, signature: string, secret: string) {
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

function validSignature(body: string, signature: string): LineChannel | null {
  if (!signature) return null;

  const defaultSecret = process.env.LINE_CHANNEL_SECRET?.trim();
  if (
    defaultSecret &&
    signatureMatches(body, signature, defaultSecret)
  ) {
    return "default";
  }

  const directorSecret = process.env.DIRECTOR_LINE_CHANNEL_SECRET?.trim();
  if (
    directorSecret &&
    signatureMatches(body, signature, directorSecret)
  ) {
    return "director";
  }

  return null;
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

function acknowledgementText(input: {
  name: string;
}) {
  return `${input.name} รับทราบแล้ว`;
}

function teacherAckName(value: string) {
  const cleaned = value
    .replace(/[^\p{L}\p{N}\s.]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const withoutTitle = cleaned.replace(
    /^(นาย|นางสาว|นาง|คุณครู|ครู)\s*/u,
    "",
  );
  const firstName = withoutTitle.split(/\s+/)[0] || cleaned;

  return firstName.startsWith("ครู") ? firstName : `ครู${firstName}`;
}

async function handleDirectorPostback(event: LineEvent) {
  const data = event.postback?.data || "";
  if (
    event.type !== "postback" ||
    !data.startsWith("director_ack:") ||
    !event.replyToken
  ) {
    return false;
  }

  const announcementId = data.slice("director_ack:".length).trim();
  const groupId = event.source?.groupId || "";
  const lineUserId = event.source?.userId || "";
  const admin = getLineAdminClient();

  if (!admin) {
    await replyDirectorLineMessages(event.replyToken, [
      { type: "text", text: "ระบบยังไม่พร้อมบันทึกรับทราบ" },
    ]);
    return true;
  }

  const { data: log, error } = await admin
    .from("line_notification_logs")
    .select("id, group_id, response_detail")
    .eq("event_key", `director-announcement-line:${announcementId}`)
    .maybeSingle();

  if (error || !log) {
    await replyDirectorLineMessages(event.replyToken, [
      { type: "text", text: "ไม่พบรายการประกาศนี้" },
    ]);
    return true;
  }

  const { data: profile } = lineUserId
    ? await admin
        .from("profiles")
        .select("full_name")
        .eq("line_user_id", lineUserId)
        .maybeSingle()
    : { data: null };

  const rawName =
    String(profile?.full_name || "").trim() ||
    (lineUserId && groupId
      ? await getDirectorLineMemberName({ groupId, userId: lineUserId })
      : null) ||
    "ผู้ใช้งาน LINE";
  const name = teacherAckName(rawName);

  const detail =
    log.response_detail && typeof log.response_detail === "object"
      ? (log.response_detail as Record<string, unknown>)
      : {};
  const acknowledgements = Array.isArray(detail.acknowledgements)
    ? [...detail.acknowledgements]
    : [];
  const existingIndex = acknowledgements.findIndex((item) => {
    if (!item || typeof item !== "object") return false;
    return (item as Record<string, unknown>).lineUserId === lineUserId;
  });
  const duplicate = existingIndex >= 0;

  if (!duplicate) {
    acknowledgements.push({
      lineUserId,
      name,
      acknowledgedAt: new Date().toISOString(),
    });
  }

  const nextDetail = {
    ...detail,
    acknowledgements,
  };

  if (!duplicate) {
    await admin
      .from("line_notification_logs")
      .update({
        response_detail: nextDetail,
        updated_at: new Date().toISOString(),
      })
      .eq("id", log.id);
  }

  await replyDirectorLineMessages(event.replyToken, [
    {
      type: "text",
      text: acknowledgementText({ name }),
    },
  ]);

  return true;
}

function directorAnnouncementMessage(value: string) {
  const text = value.trim();
  const command = "แจ้งให้คณะครูทุกท่านทราบ";
  const index = text.indexOf(command);
  if (!text.includes("@เลขา") || index < 0) return "";

  return text.slice(index + command.length).trim();
}

async function handleDirectorCommand(event: LineEvent) {
  if (
    event.type !== "message" ||
    event.message?.type !== "text" ||
    !event.message.text ||
    !event.replyToken
  ) {
    return false;
  }

  const message = directorAnnouncementMessage(event.message.text);
  if (!message) return false;

  const groupId = event.source?.groupId || "";
  const userId = event.source?.userId || "";
  const admin = getLineAdminClient();

  const directorName =
    (userId && groupId
      ? await getDirectorLineMemberName({ groupId, userId })
      : null) || "ผู้อำนวยการ";
  const announcementId = crypto.randomUUID();
  const eventKey = `director-announcement-line:${announcementId}`;
  const replyResult = await replyDirectorLineMessages(event.replyToken, [
    directorAnnouncementFlex({
      announcementId,
      directorName,
      message,
    }),
  ]);

  if (admin) {
    await admin.from("line_notification_logs").insert({
      event_key: eventKey,
      event_type: "director_announcement_line",
      group_id: groupId || "director-line",
      status: replyResult.ok ? "sent" : "failed",
      response_detail: {
        result: replyResult,
        channel: "director",
        actorName: directorName,
        announcementId,
        message,
        acknowledgements: [],
        source: "line-command",
      },
      sent_at: replyResult.ok ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    });
  }

  return true;
}

export async function POST(request: Request) {
  const body = await request.text();
  const signature =
    request.headers.get("x-line-signature") ?? "";

  const channel = validSignature(body, signature);

  if (!channel) {
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

      if (channel === "default" && groupId) {
        await saveGroup(groupId);
      }

      if (channel === "director") {
        const handled = await handleDirectorPostback(event);
        if (handled) continue;

        const commandHandled = await handleDirectorCommand(event);
        if (commandHandled) continue;
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
