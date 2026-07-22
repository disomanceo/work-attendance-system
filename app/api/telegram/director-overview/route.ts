import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { STUDENT_CLASS_LEVELS } from "@/lib/students/settings";
import { buildSummaryMessage } from "@/lib/telegram/commands";
import { getTelegramGroupChatIds } from "@/lib/telegram/chat-ids";
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

type StudentAttendanceStatus =
  | "present"
  | "late"
  | "absent"
  | "sick"
  | "leave"
  | "personal";

type StudentClassReport = {
  classLevel: string;
  checked: boolean;
  presentCount: number;
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

function normalizeStudentStatus(value: unknown): "present" | "leave" | "absent" {
  if (value === "absent") return "absent";
  if (value === "leave" || value === "sick" || value === "personal") {
    return "leave";
  }
  return "present";
}

function formatStudentReportDate(value: string) {
  const date = new Date(`${value}T12:00:00+07:00`);
  const weekday = new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    weekday: "long",
  }).format(date);
  const day = new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
  }).format(date);
  const month = new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    month: "short",
  }).format(date);
  const year = new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
  }).format(date);

  return `${weekday}ที่ ${day} ${month} ${year}`;
}

async function loadStudentClassReports(
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
      .select("class_level, status")
      .eq("attendance_date", date),
  ]);

  if (studentsResult.error || recordsResult.error) {
    throw new Error(
      studentsResult.error?.message ||
        recordsResult.error?.message ||
        "Cannot load student attendance status",
    );
  }

  const activeTotals = new Map<string, number>();

  for (const row of studentsResult.data ?? []) {
    const classLevel = classLevelOf(row);

    if (!classLevel) continue;

    activeTotals.set(classLevel, (activeTotals.get(classLevel) ?? 0) + 1);
  }

  const recordTotals = new Map<string, number>();
  const presentTotals = new Map<string, number>();

  for (const row of recordsResult.data ?? []) {
    const classLevel = classLevelOf(row);

    if (!classLevel) continue;

    recordTotals.set(classLevel, (recordTotals.get(classLevel) ?? 0) + 1);

    if (
      normalizeStudentStatus(
        (row as { status?: StudentAttendanceStatus | string | null }).status,
      ) === "present"
    ) {
      presentTotals.set(classLevel, (presentTotals.get(classLevel) ?? 0) + 1);
    }
  }

  const configuredLevels = (STUDENT_CLASS_LEVELS as readonly string[]).filter(
    (classLevel) =>
      activeTotals.has(classLevel) || recordTotals.has(classLevel),
  );
  const extraLevels = Array.from(activeTotals.keys())
    .filter(
      (classLevel) =>
        !STUDENT_CLASS_LEVELS.some((level) => level === classLevel),
    )
    .sort((left, right) => left.localeCompare(right, "th"));

  return configuredLevels.concat(extraLevels).map((classLevel) => ({
    classLevel,
    checked: (recordTotals.get(classLevel) ?? 0) > 0,
    presentCount: presentTotals.get(classLevel) ?? 0,
  }));
}

function buildStudentReportMessage(date: string, reports: StudentClassReport[]) {
  const rows =
    reports.length > 0
      ? reports.map((report, index) => {
          const status = report.checked
            ? `${report.presentCount.toLocaleString("th-TH")} คน`
            : "ยังไม่ได้เช็คชื่อ";

          return `${index + 1}. ${escapeHtml(report.classLevel)}    ${status}`;
        })
      : ["ไม่พบข้อมูลชั้นเรียน"];

  return [
    "<b>รายงานการมาเรียนของนักเรียน</b>",
    escapeHtml(formatStudentReportDate(date)),
    ...rows,
  ].join("\n");
}

function resultCount(results: PromiseSettledResult<unknown>[]) {
  return results.filter((result) => result.status === "fulfilled").length;
}

function failedCount(results: PromiseSettledResult<unknown>[]) {
  return results.length - resultCount(results);
}

function uncheckedClassLevels(reports: StudentClassReport[]) {
  return reports
    .filter((report) => !report.checked)
    .map((report) => report.classLevel);
}

function logRejectedTelegramResults(
  label: string,
  chatIds: string[],
  results: PromiseSettledResult<unknown>[],
) {
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(
        `Director overview ${label} failed for chat ${chatIds[index]}:`,
        result.reason,
      );
    }
  });
}

async function sendDirectorOverviewMessages(input: {
  chatIds: string[];
  attendanceSummary: string;
  studentReport: string;
  reportUrl: string;
}) {
  const attendanceResults = await Promise.allSettled(
    input.chatIds.map((chatId) =>
      sendTelegramMessage(chatId, input.attendanceSummary),
    ),
  );

  logRejectedTelegramResults(
    "attendance summary",
    input.chatIds,
    attendanceResults,
  );

  const studentResults = await Promise.allSettled(
    input.chatIds.map((chatId) =>
      sendTelegramMessage(chatId, input.studentReport, {
        buttons: [
          [
            {
              text: "เปิดรายงานนักเรียน",
              url: input.reportUrl,
            },
          ],
        ],
      }),
    ),
  );

  logRejectedTelegramResults("student report", input.chatIds, studentResults);

  return {
    attendanceSentCount: resultCount(attendanceResults),
    attendanceFailedCount: failedCount(attendanceResults),
    studentSentCount: resultCount(studentResults),
    studentFailedCount: failedCount(studentResults),
  };
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

    const chatIds = getTelegramGroupChatIds();

    if (chatIds.length === 0) {
      return NextResponse.json(
        { ok: false, message: "ยังไม่ได้ตั้งค่ากลุ่ม Telegram สำหรับแจ้งเตือน" },
        { status: 500 },
      );
    }

    const date = todayBangkok();
    const requestOrigin = new URL(request.url).origin;
    const [attendanceSummary, studentReports] = await Promise.all([
      buildSummaryMessage(requestOrigin, date),
      loadStudentClassReports(auth.admin, date),
    ]);
    const studentReport = buildStudentReportMessage(date, studentReports);
    const sendResult = await sendDirectorOverviewMessages({
      chatIds,
      attendanceSummary,
      studentReport,
      reportUrl: `${requestOrigin}/students/attendance/report`,
    });
    const result = {
      sent:
        sendResult.attendanceSentCount > 0 &&
        sendResult.studentSentCount > 0,
      totalChatIds: chatIds.length,
      ...sendResult,
      uncheckedClasses: uncheckedClassLevels(studentReports),
      studentReports,
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
