import "server-only";

import {
  getLineTarget,
  type LineMessage,
} from "@/lib/line/client";

const GREEN = "#1B8A5A";
const TEXT = "#0F172A";
const MUTED = "#64748B";

function text(value: string, extra: Record<string, unknown> = {}) {
  return {
    type: "text",
    text: value || "-",
    size: "sm",
    color: TEXT,
    wrap: true,
    ...extra,
  };
}

function appUrl() {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (explicit) return explicit;

  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return production ? `https://${production}` : "http://localhost:3000";
}

function documentUrl(bookId: string) {
  return `${appUrl()}/documents?book=${encodeURIComponent(bookId)}`;
}

async function parseLineResponse(response: Response) {
  const raw = await response.text();
  let detail: unknown = raw;

  try {
    detail = raw ? JSON.parse(raw) : null;
  } catch {}

  return response.ok
    ? { ok: true as const, status: response.status }
    : {
        ok: false as const,
        status: response.status,
        message: "LINE ส่งข้อความไม่สำเร็จ",
        detail,
      };
}

export async function getDirectorLineTarget() {
  const groupId =
    process.env.DIRECTOR_LINE_GROUP_ID?.trim() ||
    process.env.LINE_GROUP_ID?.trim();

  if (groupId) return { ok: true as const, groupId };

  const target = await getLineTarget();
  return target.ok
    ? { ok: true as const, groupId: target.groupId }
    : { ok: false as const, message: target.message };
}

export async function pushDirectorLineMessages(
  to: string,
  messages: LineMessage[],
) {
  const token =
    process.env.DIRECTOR_LINE_CHANNEL_ACCESS_TOKEN?.trim() ||
    process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();

  if (!token) {
    return {
      ok: false as const,
      message:
        "ยังไม่ได้ตั้งค่า DIRECTOR_LINE_CHANNEL_ACCESS_TOKEN หรือ LINE_CHANNEL_ACCESS_TOKEN",
    };
  }

  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to, messages }),
    cache: "no-store",
  });

  return parseLineResponse(response);
}

export function directorAnnouncementFlex(input: {
  bookId: string;
  directorName: string;
  message: string;
}) {
  const openUrl = documentUrl(input.bookId);

  return {
    type: "flex",
    altText: `ประกาศจาก ผอ.: ${input.message.slice(0, 80)}`,
    contents: {
      type: "bubble",
      size: "kilo",
      header: {
        type: "box",
        layout: "vertical",
        paddingAll: "12px",
        backgroundColor: GREEN,
        contents: [
          text("@เลขา ส่งถึง", {
            color: "#ECFDF5",
            weight: "bold",
            size: "xs",
          }),
          text("ประกาศจาก ผอ.", {
            color: "#FFFFFF",
            weight: "bold",
            size: "md",
            margin: "xs",
          }),
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "12px",
        spacing: "sm",
        contents: [
          text(input.message, { size: "sm" }),
          text(`โดย ${input.directorName || "ผู้อำนวยการ"}`, {
            size: "xs",
            color: MUTED,
            margin: "md",
          }),
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "12px",
        contents: [
          {
            type: "button",
            style: "primary",
            height: "sm",
            color: GREEN,
            action: {
              type: "uri",
              label: "เปิดประกาศ/รับทราบ",
              uri: openUrl,
            },
          },
        ],
      },
    },
  } as LineMessage;
}
