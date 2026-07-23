import "server-only";

import { getLineTarget, type LineMessage } from "@/lib/line/client";

const GREEN = "#1B8A5A";
const TEXT = "#0F172A";
const MUTED = "#64748B";

type DirectorLineTarget =
  | {
      ok: true;
      groupId: string;
      token: string;
      channel: "director" | "default";
    }
  | {
      ok: false;
      message: string;
    };

type DirectorAnnouncementWebhookResult =
  | {
      ok: true;
      status: number;
      groupId: string;
      detail: unknown;
    }
  | {
      ok: false;
      status?: number;
      groupId?: string;
      message: string;
      detail?: unknown;
    };

function lineText(value: string, extra: Record<string, unknown> = {}) {
  return {
    type: "text",
    text: value || "-",
    size: "sm",
    color: TEXT,
    wrap: true,
    ...extra,
  };
}

function parseJson(raw: string) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return raw;
  }
}

async function parseLineResponse(response: Response) {
  const raw = await response.text();
  const detail = parseJson(raw);

  return response.ok
    ? { ok: true as const, status: response.status }
    : {
        ok: false as const,
        status: response.status,
        message: "LINE ส่งข้อความไม่สำเร็จ",
        detail,
      };
}

function isExplicitWebhookFailure(detail: unknown) {
  if (!detail || typeof detail !== "object") return false;
  const value = detail as Record<string, unknown>;
  return value.ok === false || value.success === false || value.lineSent === false;
}

export async function postDirectorAnnouncementWebhook(input: {
  message: string;
  directorName: string;
  actorName: string;
}): Promise<DirectorAnnouncementWebhookResult> {
  const webhookUrl = process.env.DIRECTOR_LINE_WEBHOOK_URL?.trim() || "";
  const groupId = process.env.DIRECTOR_LINE_GROUP_ID?.trim() || "";

  if (!webhookUrl) {
    return {
      ok: false,
      message: "ยังไม่ได้ตั้งค่า DIRECTOR_LINE_WEBHOOK_URL สำหรับระบบประกาศจาก ผอ.",
    };
  }

  if (!groupId) {
    return {
      ok: false,
      message: "ยังไม่ได้ตั้งค่า DIRECTOR_LINE_GROUP_ID สำหรับระบบประกาศจาก ผอ.",
    };
  }

  const now = Date.now();
  const commandText = `@เลขา แจ้งให้คณะครูทุกท่านทราบ\n${input.message}`;
  const payload = {
    action: "director_announcement",
    source: "work-attendance-web",
    message: input.message,
    commandText,
    directorName: input.directorName,
    actorName: input.actorName,
    groupId,
    requestedAt: new Date(now).toISOString(),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Work-Attendance-Source": "director-announcement",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: controller.signal,
    });

    const raw = await response.text();
    const detail = parseJson(raw);

    if (!response.ok || isExplicitWebhookFailure(detail)) {
      return {
        ok: false,
        status: response.status,
        groupId,
        message: "Apps Script ส่งประกาศไม่สำเร็จ",
        detail,
      };
    }

    return {
      ok: true,
      status: response.status,
      groupId,
      detail,
    };
  } catch (error) {
    return {
      ok: false,
      groupId,
      message:
        error instanceof Error
          ? error.message
          : "ไม่สามารถติดต่อ Apps Script สำหรับประกาศจาก ผอ. ได้",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function getDirectorLineTarget(): Promise<DirectorLineTarget> {
  const directorToken =
    process.env.DIRECTOR_LINE_CHANNEL_ACCESS_TOKEN?.trim() || "";
  const directorGroupId = process.env.DIRECTOR_LINE_GROUP_ID?.trim() || "";

  if (directorToken && directorGroupId) {
    return {
      ok: true,
      groupId: directorGroupId,
      token: directorToken,
      channel: "director",
    };
  }

  const defaultToken = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim() || "";
  const configuredGroupId = process.env.LINE_GROUP_ID?.trim() || "";

  if (!defaultToken) {
    return {
      ok: false,
      message: directorToken
        ? "ยังไม่ได้ตั้งค่า DIRECTOR_LINE_GROUP_ID สำหรับบอทประกาศจาก ผอ."
        : "ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN",
    };
  }

  if (configuredGroupId) {
    return {
      ok: true,
      groupId: configuredGroupId,
      token: defaultToken,
      channel: "default",
    };
  }

  const target = await getLineTarget();
  return target.ok
    ? {
        ok: true,
        groupId: target.groupId,
        token: defaultToken,
        channel: "default",
      }
    : { ok: false, message: target.message };
}

export async function pushDirectorLineMessages(
  to: string,
  messages: LineMessage[],
  token: string,
) {
  if (!token) {
    return {
      ok: false as const,
      message: "ยังไม่ได้ตั้งค่า LINE channel access token",
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

export async function replyDirectorLineMessages(
  replyToken: string,
  messages: LineMessage[],
) {
  const token = process.env.DIRECTOR_LINE_CHANNEL_ACCESS_TOKEN?.trim() || "";
  if (!token) {
    return {
      ok: false as const,
      message: "ยังไม่ได้ตั้งค่า DIRECTOR_LINE_CHANNEL_ACCESS_TOKEN",
    };
  }

  const response = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ replyToken, messages }),
    cache: "no-store",
  });

  return parseLineResponse(response);
}

export async function getDirectorLineMemberName(input: {
  groupId: string;
  userId: string;
}) {
  const token = process.env.DIRECTOR_LINE_CHANNEL_ACCESS_TOKEN?.trim() || "";
  if (!token) return null;

  const response = await fetch(
    `https://api.line.me/v2/bot/group/${encodeURIComponent(
      input.groupId,
    )}/member/${encodeURIComponent(input.userId)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );

  if (!response.ok) return null;

  const profile = (await response.json().catch(() => null)) as {
    displayName?: string;
  } | null;

  return profile?.displayName?.trim() || null;
}

export function directorAnnouncementFlex(input: {
  announcementId?: string;
  directorName: string;
  message: string;
}) {
  const bodyContents: LineMessage[] = [
    lineText(input.message, { size: "sm" }),
  ];

  bodyContents.push(
    lineText(`โดย ${input.directorName || "ผู้อำนวยการ"}`, {
      size: "xs",
      color: MUTED,
      margin: "md",
    }),
  );

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
          lineText("@เลขาผอ.สุธน ส่งถึง", {
            color: "#ECFDF5",
            weight: "bold",
            size: "xs",
          }),
          lineText("ประกาศจาก ผอ.", {
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
        contents: bodyContents,
      },
      ...(input.announcementId
        ? {
            footer: {
              type: "box",
              layout: "vertical",
              paddingAll: "12px",
              contents: [
                {
                  type: "button",
                  style: "primary",
                  color: GREEN,
                  height: "sm",
                  action: {
                    type: "postback",
                    label: "รับทราบ",
                    data: `director_ack:${input.announcementId}`,
                  },
                },
              ],
            },
          }
        : {}),
    },
  } as LineMessage;
}
