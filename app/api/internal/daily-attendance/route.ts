import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type Profile = {
  id: string;
  full_name: string;
  position: string | null;
  role: string;
  account_status: string;
};

type AttendanceRecord = {
  id: string;
  user_id: string;
  work_date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  check_in_status: string | null;
  check_out_status: string | null;
  note: string | null;
};

function getServerConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const reportSecret = process.env.DAILY_REPORT_SECRET;

  if (!supabaseUrl || !serviceRoleKey || !reportSecret) {
    return null;
  }

  return { supabaseUrl, serviceRoleKey, reportSecret };
}

function isValidDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeTime(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})/);
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

function getSetting(
  settings: Record<string, unknown> | null,
  keys: string[],
  fallback: string
) {
  for (const key of keys) {
    const value = settings?.[key];
    if (value !== undefined && value !== null && value !== "") {
      return normalizeTime(value, fallback);
    }
  }
  return fallback;
}

function getRoleTimes(
  role: string,
  settings: Record<string, unknown> | null
) {
  const normalizedRole = role.trim().toLowerCase();

  if (["janitor", "caretaker"].includes(normalizedRole)) {
    return {
      startTime: getSetting(
        settings,
        [
          "janitor_start_time",
          "caretaker_start_time",
          "start_time_janitor",
        ],
        "06:00"
      ),
      endTime: getSetting(
        settings,
        [
          "janitor_end_time",
          "caretaker_end_time",
          "end_time_janitor",
        ],
        "18:00"
      ),
    };
  }

  if (normalizedRole === "director") {
    return {
      startTime: getSetting(
        settings,
        ["director_start_time", "start_time_director", "default_start_time"],
        "07:50"
      ),
      endTime: getSetting(
        settings,
        ["director_end_time", "end_time_director", "default_end_time"],
        "16:30"
      ),
    };
  }

  if (normalizedRole === "teacher") {
    return {
      startTime: getSetting(
        settings,
        ["teacher_start_time", "start_time_teacher", "default_start_time"],
        "07:50"
      ),
      endTime: getSetting(
        settings,
        ["teacher_end_time", "end_time_teacher", "default_end_time"],
        "16:30"
      ),
    };
  }

  return {
    startTime: getSetting(
      settings,
      [
        "staff_start_time",
        "start_time_staff",
        "default_start_time",
        "work_start_time",
      ],
      "07:50"
    ),
    endTime: getSetting(
      settings,
      [
        "staff_end_time",
        "end_time_staff",
        "default_end_time",
        "work_end_time",
      ],
      "16:30"
    ),
  };
}

function formatTimeBangkok(value: string | null) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function statusLabel(record: AttendanceRecord | undefined) {
  if (!record?.check_in_at) return "ไม่มาปฏิบัติราชการ";
  if (record.check_in_status === "late") return "มาสาย";
  return "ปกติ";
}

export async function GET(request: Request) {
  try {
    const config = getServerConfig();

    if (!config) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "ยังไม่ได้ตั้งค่า NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY หรือ DAILY_REPORT_SECRET",
        },
        { status: 500 }
      );
    }

    const suppliedSecret = request.headers.get("x-report-secret")?.trim() ?? "";

    if (!suppliedSecret || suppliedSecret !== config.reportSecret) {
      return NextResponse.json(
        { ok: false, message: "ไม่มีสิทธิ์เรียกข้อมูลรายงานประจำวัน" },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const date = url.searchParams.get("date")?.trim() ?? "";

    if (!isValidDate(date)) {
      return NextResponse.json(
        { ok: false, message: "กรุณาระบุ date เป็นรูปแบบ YYYY-MM-DD" },
        { status: 400 }
      );
    }

    const supabase = createClient(config.supabaseUrl, config.serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const [
      { data: profileData, error: profileError },
      { data: attendanceData, error: attendanceError },
      { data: settingsData, error: settingsError },
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, position, role, account_status")
        .eq("account_status", "active")
        .order("full_name", { ascending: true }),
      supabase
        .from("attendance_records")
        .select(
          "id, user_id, work_date, check_in_at, check_out_at, check_in_status, check_out_status, note"
        )
        .eq("work_date", date),
      supabase
        .from("attendance_settings")
        .select("*")
        .limit(1)
        .maybeSingle(),
    ]);

    if (profileError) {
      console.error("Daily report profiles error:", profileError);
      return NextResponse.json(
        { ok: false, message: "ไม่สามารถโหลดข้อมูลบุคลากรได้" },
        { status: 500 }
      );
    }

    if (attendanceError) {
      console.error("Daily report attendance error:", attendanceError);
      return NextResponse.json(
        { ok: false, message: "ไม่สามารถโหลดข้อมูลลงเวลาได้" },
        { status: 500 }
      );
    }

    if (settingsError) {
      console.warn("Daily report settings warning:", settingsError);
    }

    const profiles = (profileData ?? []) as Profile[];
    const attendance = (attendanceData ?? []) as AttendanceRecord[];
    const settings =
      (settingsData as Record<string, unknown> | null | undefined) ?? null;

    const attendanceByUser = new Map(
      attendance.map((record) => [record.user_id, record])
    );

    const people = profiles.map((profile) => {
      const record = attendanceByUser.get(profile.id);
      const roleTimes = getRoleTimes(profile.role, settings);

      return {
        userId: profile.id,
        fullName: profile.full_name,
        position: profile.position ?? "",
        role: profile.role,
        startTime: roleTimes.startTime,
        scheduledEndTime: roleTimes.endTime,
        checkInTime: formatTimeBangkok(record?.check_in_at ?? null),
        actualCheckOutTime: formatTimeBangkok(record?.check_out_at ?? null),
        reportCheckOutTime: record?.check_in_at ? roleTimes.endTime : "",
        status: statusLabel(record),
        note: record?.note ?? "",
        checkInStatus: record?.check_in_status ?? "",
        checkOutStatus: record?.check_out_status ?? "",
      };
    });

    const summary = {
      total: people.length,
      present: people.filter((person) => person.checkInTime).length,
      sickLeave: 0,
      personalLeave: 0,
      officialDuty: 0,
      late: people.filter((person) => person.status === "มาสาย").length,
      absent: people.filter((person) => !person.checkInTime).length,
    };

    return NextResponse.json({
      ok: true,
      date,
      generatedAt: new Date().toISOString(),
      schoolName:
        typeof settings?.school_name === "string"
          ? settings.school_name
          : "โรงเรียนวัดไผ่มุ้ง",
      people,
      summary,
    });
  } catch (error) {
    console.error("Daily attendance report API error:", error);

    return NextResponse.json(
      {
        ok: false,
        message: "เกิดข้อผิดพลาดระหว่างเตรียมข้อมูลรายงานประจำวัน",
      },
      { status: 500 }
    );
  }
}
