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

type LeaveRequest = {
  id: string;
  user_id: string;
  leave_type: "personal" | "sick" | string;
  start_date: string;
  end_date: string;
  reason: string | null;
};

type OfficialDutyRequest = {
  id: string;
  user_id: string;
  duty_date: string;
  reason: string | null;
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

function leaveLabel(leaveType: string) {
  return leaveType === "sick" ? "ลาป่วย" : "ลากิจ";
}

function getDailyStatus(
  profileId: string,
  record: AttendanceRecord | undefined,
  leaveByUser: Map<string, LeaveRequest>,
  officialDutyByUser: Map<string, OfficialDutyRequest>
) {
  if (record?.check_in_at) {
    return statusLabel(record);
  }

  const leave = leaveByUser.get(profileId);

  if (leave) {
    return leaveLabel(leave.leave_type);
  }

  if (officialDutyByUser.has(profileId)) {
    return "ไปราชการ";
  }

  return statusLabel(record);
}

function getDailyNote(
  profileId: string,
  record: AttendanceRecord | undefined,
  leaveByUser: Map<string, LeaveRequest>,
  officialDutyByUser: Map<string, OfficialDutyRequest>
) {
  if (record?.note?.trim()) {
    return record.note.trim();
  }

  const leave = leaveByUser.get(profileId);

  if (leave) {
    return leaveLabel(leave.leave_type);
  }

  if (officialDutyByUser.has(profileId)) {
    return "ไปราชการ";
  }

  return "";
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
      { data: leaveData, error: leaveError },
      { data: officialDutyData, error: officialDutyError },
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
      supabase
        .from("leave_requests")
        .select("id, user_id, leave_type, start_date, end_date, reason")
        .in("status", ["pending", "approved"])
        .lte("start_date", date)
        .gte("end_date", date),
      supabase
        .from("official_duty_requests")
        .select("id, user_id, duty_date, reason")
        .in("status", ["pending", "approved"])
        .eq("duty_date", date),
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

    if (leaveError) {
      console.error("Daily report leave error:", leaveError);
      return NextResponse.json(
        { ok: false, message: "ไม่สามารถโหลดข้อมูลการลาประจำวันที่เลือกได้" },
        { status: 500 }
      );
    }

    if (officialDutyError) {
      console.error("Daily report official duty error:", officialDutyError);
      return NextResponse.json(
        { ok: false, message: "ไม่สามารถโหลดข้อมูลไปราชการประจำวันที่เลือกได้" },
        { status: 500 }
      );
    }

    const profiles = (profileData ?? []) as Profile[];
    const attendance = (attendanceData ?? []) as AttendanceRecord[];
    const leaveRequests = (leaveData ?? []) as LeaveRequest[];
    const officialDutyRequests =
      (officialDutyData ?? []) as OfficialDutyRequest[];
    const settings =
      (settingsData as Record<string, unknown> | null | undefined) ?? null;

    const attendanceByUser = new Map(
      attendance.map((record) => [record.user_id, record])
    );
    const leaveByUser = new Map(
      leaveRequests.map((request) => [request.user_id, request])
    );
    const officialDutyByUser = new Map(
      officialDutyRequests.map((request) => [request.user_id, request])
    );


    const allPeople = profiles.map((profile) => {
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
        reportCheckOutTime: record?.check_in_at
          ? formatTimeBangkok(record?.check_out_at ?? null) || roleTimes.endTime
          : "",
        status: getDailyStatus(
          profile.id,
          record,
          leaveByUser,
          officialDutyByUser
        ),
        note: getDailyNote(
          profile.id,
          record,
          leaveByUser,
          officialDutyByUser
        ),
        checkInStatus: record?.check_in_status ?? "",
        checkOutStatus: record?.check_out_status ?? "",
      };
    });

    const people = allPeople
      .filter((person) => Boolean(person.checkInTime))
      .sort((a, b) => {
        const timeCompare = a.checkInTime.localeCompare(b.checkInTime);

        if (timeCompare !== 0) {
          return timeCompare;
        }

        return a.fullName.localeCompare(b.fullName, "th");
      });


    const summary = {
      total: allPeople.length,
      present: people.length,
      sickLeave: allPeople.filter(
        (person) => leaveByUser.get(person.userId)?.leave_type === "sick"
      ).length,
      personalLeave: allPeople.filter(
        (person) => leaveByUser.get(person.userId)?.leave_type === "personal"
      ).length,
      officialDuty: allPeople.filter((person) =>
        officialDutyByUser.has(person.userId)
      ).length,
      permittedLeave: leaveRequests.length + officialDutyRequests.length,
      late: people.filter((person) => person.status === "มาสาย").length,
      absent: allPeople.filter(
        (person) =>
          !person.checkInTime &&
          !leaveByUser.has(person.userId) &&
          !officialDutyByUser.has(person.userId)
      ).length,
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
