import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { STUDENT_CLASS_LEVELS } from "@/lib/students/settings";
import { buildSummaryMessage } from "@/lib/telegram/commands";
import { isTelegramNotificationEnabled } from "@/lib/telegram/notification-settings";
import { sendTelegramMessage } from "@/lib/telegram/send-message";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOLDOWN_MS = 10 * 60 * 1000;

type ProfileRow = {
  id: string;
  full_name: string | null;
  role: string | null;
  account_status: string | null;
};

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !service) {
    throw new Error("Supabase server environment variables are not configured");
  }

  return createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

function todayBangkok() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function getTelegramChatIds() {
  const attendanceChatId = process.env.TELEGRAM_ATTENDANCE_CHAT_ID?.trim();

  if (attendanceChatId) {
    return attendanceChatId.startsWith("-") ? [attendanceChatId] : [];
  }

  const groupChatId = (process.env.TELEGRAM_ALLOWED_CHAT_IDS?.trim() || "")
    .split(",")
    .map((value) => value.trim())
    .find((value) => value.startsWith("-"));

  return groupChatId ? [groupChatId] : [];
}

async function requireDirector(request: Request) {
  const token = bearerToken(request);

  if (!token) {
    return { ok: false as const, message: "Missing access token", status: 401 };
  }

  const admin = adminClient();
  const {
    data: { user },
    error,
  } = await admin.auth.getUser(token);

  if (error || !user) {
    return { ok: false as const, message: "Invalid session", status: 401 };
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, full_name, role, account_status")
    .eq("id", user.id)
    .maybeSingle();

  const row = profile as ProfileRow | null;

  if (
    profileError ||
    !row ||
    row.account_status !== "active" ||
    !["admin", "director"].includes(String(row.role || ""))
  ) {
    return { ok: false as const, message: "Forbidden", status: 403 };
  }

  return { ok: true as const, admin, profile: row };
}

function classLevelOf(row: { class_level?: unknown }) {
  return String(row.class_level ?? "").trim();
}

async function loadUncheckedClassLabels(
  admin: ReturnType<typeof adminClient>,
  date: string,
) {
  const [studentsResult, recordsResult] = await Promise.all([
    admin
      .from("students")
      .select("class_level")
      .eq("status", "active"),
    admin
      .from("student_attendance")
      .select("class_level")
      .eq("attendance_date", date),
  ]);

  if (studentsResult.error || recordsResult.error) {
    throw new Error(
      studentsResult.error?.message ||
        recordsResult.error?.message ||
        "Cannot load student attendance status",
    );
  }

  const activeClassLevels = new Set(
    (studentsResult.data ?? [])
      .map((row) => classLevelOf(row))
      .filter(Boolean),
  );
  const checkedClassLevels = new Set(
    (recordsResult.data ?? [])
      .map((row) => classLevelOf(row))
      .filter(Boolean),
  );

  const configuredMissing = (STUDENT_CLASS_LEVELS as readonly string[]).filter(
    (classLevel) =>
      activeClassLevels.has(classLevel) && !checkedClassLevels.has(classLevel),
  );
  const extraMissing = Array.from(activeClassLevels)
    .filter(
      (classLevel) =>
        !STUDENT_CLASS_LEVELS.some((level) => level === classLevel) &&
        !checkedClassLevels.has(classLevel),
    )
    .sort((left, right) => left.localeCompare(right, "th"));

  return configuredMissing
    .concat(extraMissing)
    .sort((left, right) => {
      const leftIndex = STUDENT_CLASS_LEVELS.findIndex(
        (level) => level === left,
      );
      const rightIndex = STUDENT_CLASS_LEVELS.findIndex(
        (level) => level === right,
      );
      return (
        (leftIndex === -1 ? 999 : leftIndex) -
          (rightIndex === -1 ? 999 : rightIndex) ||
        left.localeCompare(right, "th")
      );
    })
    .filter(Boolean);
}

function buildStudentSection(labels: string[]) {
  if (labels.length === 0) {
    return [
      "<b>ห้องที่ยังไม่ได้เช็คชื่อนักเรียน</b>",
      "เช็คชื่อครบทุกห้องแล้ว",
    ].join("\n");
  }

  return [
    "<b>ห้องที่ยังไม่ได้เช็คชื่อนักเรียน</b>",
    ...labels.map((label, index) => `${index + 1}. ${escapeHtml(label)}`),
  ].join("\n");
}

async function getLastSent(admin: ReturnType<typeof adminClient>) {
  const { data, error } = await admin
    .from("line_notification_logs")
    .select("sent_at, updated_at")
    .eq("event_type", "director_overview_manual_telegram")
    .eq("status", "sent")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Cannot load director overview Telegram cooldown:", error);
    return null;
  }

  return String(data?.sent_at || data?.updated_at || "").trim() || null;
}

async function logResult(
  admin: ReturnType<typeof adminClient>,
  input: {
    eventKey: string;
    status: "sent" | "failed";
    actorName: string;
    result: unknown;
  },
) {
  await admin.from("line_notification_logs").upsert(
    {
      event_key: input.eventKey,
      event_type: "director_overview_manual_telegram",
      group_id: "telegram",
      status: input.status,
      response_detail: {
        actorName: input.actorName,
        result: input.result,
      },
      sent_at: input.status === "sent" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "event_key" },
  );
}

export async function POST(request: Request) {
  try {
    const auth = await requireDirector(request);

    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, message: auth.message },
        { status: auth.status },
      );
    }

    const enabled = await isTelegramNotificationEnabled(
      "attendance.daily_summary",
    );

    if (!enabled) {
      return NextResponse.json(
        { ok: false, message: "ปิดการแจ้งเตือนสรุปเวลาผ่าน Telegram อยู่" },
        { status: 400 },
      );
    }

    const lastSent = await getLastSent(auth.admin);
    const lastSentTime = lastSent ? new Date(lastSent).getTime() : 0;
    const now = Date.now();

    if (lastSentTime && now - lastSentTime < COOLDOWN_MS) {
      const waitSeconds = Math.ceil((COOLDOWN_MS - (now - lastSentTime)) / 1000);
      return NextResponse.json(
        {
          ok: false,
          cooldown: true,
          waitSeconds,
          message: `เพิ่งส่งสรุปไปแล้ว กรุณารออีก ${Math.ceil(
            waitSeconds / 60,
          )} นาที`,
        },
        { status: 429 },
      );
    }

    const chatIds = getTelegramChatIds();

    if (chatIds.length === 0) {
      return NextResponse.json(
        { ok: false, message: "ยังไม่ได้ตั้งค่ากลุ่ม Telegram สำหรับแจ้งเตือน" },
        { status: 500 },
      );
    }

    const date = todayBangkok();
    const requestOrigin = new URL(request.url).origin;
    const [attendanceSummary, uncheckedClasses] = await Promise.all([
      buildSummaryMessage(requestOrigin, date),
      loadUncheckedClassLabels(auth.admin, date),
    ]);
    const message = [
      attendanceSummary,
      "",
      buildStudentSection(uncheckedClasses),
    ].join("\n");
    const results = await Promise.allSettled(
      chatIds.map((chatId) =>
        sendTelegramMessage(chatId, message, {
          buttons: [
            [
              {
                text: "เปิดรายงานนักเรียน",
                url: `${requestOrigin}/students/attendance/report`,
              },
            ],
          ],
        }),
      ),
    );
    const sentCount = results.filter((result) => result.status === "fulfilled")
      .length;
    const failedCount = results.length - sentCount;
    const result = {
      sent: sentCount > 0,
      sentCount,
      failedCount,
      totalChatIds: chatIds.length,
      uncheckedClasses,
    };
    const bucket = Math.floor(now / COOLDOWN_MS);

    await logResult(auth.admin, {
      eventKey: `director-overview-manual-telegram:${date}:${bucket}`,
      status: result.sent ? "sent" : "failed",
      actorName: auth.profile.full_name || "director",
      result,
    });

    if (!result.sent) {
      return NextResponse.json(
        { ok: false, message: "ส่ง Telegram ไม่สำเร็จ", result },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: "ส่งสรุปไปยัง Telegram แล้ว",
      result,
    });
  } catch (error) {
    console.error("Director overview Telegram error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "ไม่สามารถส่งสรุป Telegram ได้",
      },
      { status: 500 },
    );
  }
}
