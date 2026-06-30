import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AttendanceSettings = {
  director_end_time?: string | null;
  teacher_end_time?: string | null;
  staff_end_time?: string | null;
  janitor_end_time?: string | null;
};

const ROLE_FALLBACK_END_TIMES: Record<string, string> = {
  admin: "16:30",
  director: "16:30",
  teacher: "16:30",
  staff: "16:30",
  janitor: "18:00",
};

function getBangkokDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getBangkokHourMinute() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

function normalizeTime(value: string | null | undefined, fallback: string) {
  const match = value?.trim().match(/^(\d{1,2}):(\d{2})/);

  if (!match) return fallback;

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return fallback;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function getRoleEndTime(role: string, settings: AttendanceSettings | null) {
  const normalizedRole = role.trim().toLowerCase();

  if (normalizedRole === "janitor") {
    return normalizeTime(
      settings?.janitor_end_time,
      ROLE_FALLBACK_END_TIMES.janitor
    );
  }

  if (normalizedRole === "director" || normalizedRole === "admin") {
    return normalizeTime(
      settings?.director_end_time,
      ROLE_FALLBACK_END_TIMES.director
    );
  }

  if (normalizedRole === "teacher") {
    return normalizeTime(
      settings?.teacher_end_time,
      ROLE_FALLBACK_END_TIMES.teacher
    );
  }

  return normalizeTime(
    settings?.staff_end_time,
    ROLE_FALLBACK_END_TIMES.staff
  );
}

function buildBangkokDateTimeIso(date: string, time: string) {
  return new Date(`${date}T${time}:00+07:00`).toISOString();
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { ok: false, message: "Unauthorized" },
      { status: 401 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { ok: false, message: "Missing Supabase server configuration" },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const currentTime = getBangkokHourMinute();
  const today = getBangkokDate();

  const { data: settingsData, error: settingsError } = await supabase
    .from("attendance_settings")
    .select(
      "director_end_time, teacher_end_time, staff_end_time, janitor_end_time"
    )
    .eq("id", 1)
    .maybeSingle();

  if (settingsError) {
    return NextResponse.json(
      { ok: false, message: settingsError.message },
      { status: 500 }
    );
  }

  const settings = (settingsData ?? null) as AttendanceSettings | null;
  const allRoles = ["admin", "director", "teacher", "staff", "janitor"];
  const dueRoles = allRoles
    .map((role) => ({
      role,
      endTime: getRoleEndTime(role, settings),
    }))
    .filter((item) => currentTime >= item.endTime);

  if (dueRoles.length === 0) {
    return NextResponse.json({
      ok: true,
      updated: 0,
      message: "ยังไม่ถึงเวลาออกอัตโนมัติ",
      bangkokTime: currentTime,
    });
  }

  let updated = 0;

  for (const item of dueRoles) {
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("role", item.role)
      .eq("account_status", "active");

    if (profileError) {
      return NextResponse.json(
        { ok: false, message: profileError.message },
        { status: 500 }
      );
    }

    const userIds = (profiles ?? []).map((profile) => profile.id);

    if (userIds.length === 0) continue;

    const checkoutAt = buildBangkokDateTimeIso(today, item.endTime);
    const nowIso = new Date().toISOString();

    const { data, error } = await supabase
      .from("attendance_records")
      .update({
        check_out_at: checkoutAt,
        check_out_status: "auto",
        updated_at: nowIso,
      })
      .eq("work_date", today)
      .in("user_id", userIds)
      .not("check_in_at", "is", null)
      .is("check_out_at", null)
      .select("id");

    if (error) {
      return NextResponse.json(
        { ok: false, message: error.message },
        { status: 500 }
      );
    }

    updated += data?.length ?? 0;
  }

  return NextResponse.json({
    ok: true,
    updated,
    roles: dueRoles,
    bangkokTime: currentTime,
  });
}
