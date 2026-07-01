import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type AttendanceRecord = {
  id: string;
  user_id: string;
  work_date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  check_in_distance_meters: number | null;
  check_out_distance_meters: number | null;
  check_in_status: string;
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
  duty_end_date: string | null;
  subject: string | null;
  reason: string | null;
};

type DailyStatus = "present" | "sick" | "personal" | "official_duty" | "absent";

type Profile = {
  id: string;
  full_name: string;
  phone: string;
  position: string | null;
  role: string;
  account_status: string;
};

function getServerConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    return null;
  }

  return {
    supabaseUrl,
    publishableKey,
    serviceRoleKey,
  };
}

function getAccessToken(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return "";
  }

  return authorization.slice("Bearer ".length).trim();
}

function isValidDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function leaveLabel(leaveType: string) {
  return leaveType === "sick" ? "ลาป่วย" : "ลากิจ";
}

function addIsoDay(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const next = new Date(year, month - 1, day + 1);

  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(next.getDate()).padStart(2, "0")}`;
}

function getDateRange(startDate: string, endDate: string) {
  const dates: string[] = [];

  for (let date = startDate; date <= endDate; date = addIsoDay(date)) {
    dates.push(date);
  }

  return dates;
}

async function requireAdmin(request: Request) {
  const config = getServerConfig();

  if (!config) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          message: "ระบบยังไม่ได้ตั้งค่า Supabase ฝั่ง Server",
        },
        { status: 500 }
      ),
    };
  }

  const accessToken = getAccessToken(request);

  if (!accessToken) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          message: "กรุณาเข้าสู่ระบบใหม่",
        },
        { status: 401 }
      ),
    };
  }

  const authClient = createClient(
    config.supabaseUrl,
    config.publishableKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(accessToken);

  if (userError || !user) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          message: "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่",
        },
        { status: 401 }
      ),
    };
  }

  const adminClient = createClient(
    config.supabaseUrl,
    config.serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("id, role, account_status")
    .eq("id", user.id)
    .single();

  if (
    profileError ||
    !profile ||
    !["admin", "director", "staff"].includes(profile.role) ||
    profile.account_status !== "active"
  ) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          message: "คุณไม่มีสิทธิ์ดูรายงานการลงเวลา",
        },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true as const,
    adminClient,
  };
}

export async function GET(request: Request) {
  try {
    const authResult = await requireAdmin(request);

    if (!authResult.ok) {
      return authResult.response;
    }

    const url = new URL(request.url);

    const startDate = url.searchParams.get("startDate")?.trim() ?? "";
    const endDate = url.searchParams.get("endDate")?.trim() ?? "";

    if (!isValidDate(startDate) || !isValidDate(endDate)) {
      return NextResponse.json(
        {
          ok: false,
          message: "รูปแบบวันที่ไม่ถูกต้อง",
        },
        { status: 400 }
      );
    }

    if (startDate > endDate) {
      return NextResponse.json(
        {
          ok: false,
          message: "วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด",
        },
        { status: 400 }
      );
    }

    const [
      { data: attendanceData, error: attendanceError },
      { data: leaveData, error: leaveError },
      { data: officialDutyData, error: officialDutyError },
    ] = await Promise.all([
      authResult.adminClient
        .from("attendance_records")
        .select(
          `
            id,
            user_id,
            work_date,
            check_in_at,
            check_out_at,
            check_in_distance_meters,
            check_out_distance_meters,
            check_in_status,
            check_out_status,
            note
          `
        )
        .gte("work_date", startDate)
        .lte("work_date", endDate)
        .order("work_date", { ascending: false })
        .order("check_in_at", { ascending: true }),
      authResult.adminClient
        .from("leave_requests")
        .select("id, user_id, leave_type, start_date, end_date, reason")
        .in("status", ["pending", "approved"])
        .lte("start_date", endDate)
        .gte("end_date", startDate),
      authResult.adminClient
        .from("official_duty_requests")
        .select("id, user_id, duty_date, duty_end_date, subject, reason")
        .in("status", ["pending", "approved"])
        .lte("duty_date", endDate)
        .gte("duty_end_date", startDate),
    ]);

    if (attendanceError) {
      console.error(
        "Load admin attendance records error:",
        attendanceError
      );

      return NextResponse.json(
        {
          ok: false,
          message: "ไม่สามารถโหลดข้อมูลการลงเวลาได้",
        },
        { status: 500 }
      );
    }

    if (leaveError) {
      console.error("Load admin attendance leave error:", leaveError);

      return NextResponse.json(
        {
          ok: false,
          message: "ไม่สามารถโหลดข้อมูลการลาได้",
        },
        { status: 500 }
      );
    }

    if (officialDutyError) {
      console.error(
        "Load admin attendance official duty error:",
        officialDutyError
      );

      return NextResponse.json(
        {
          ok: false,
          message: "ไม่สามารถโหลดข้อมูลไปราชการได้",
        },
        { status: 500 }
      );
    }

    const records = (attendanceData ?? []) as AttendanceRecord[];
    const leaveRequests = (leaveData ?? []) as LeaveRequest[];
    const officialDutyRequests =
      (officialDutyData ?? []) as OfficialDutyRequest[];

    const { data: profileData, error: profilesError } =
      await authResult.adminClient
        .from("profiles")
        .select(
          `
            id,
            full_name,
            phone,
            position,
            role,
            account_status
          `
        )
        .eq("account_status", "active")
        .order("full_name", { ascending: true });

    if (profilesError) {
      console.error("Load attendance profiles error:", profilesError);

      return NextResponse.json(
        {
          ok: false,
          message: "ไม่สามารถโหลดข้อมูลบุคลากรได้",
        },
        { status: 500 }
      );
    }

    const profiles = (profileData ?? []) as Profile[];

    const attendanceByKey = new Map(
      records.map((record) => [`${record.user_id}:${record.work_date}`, record])
    );
    const leaveByKey = new Map<string, LeaveRequest>();
    const officialDutyByKey = new Map<string, OfficialDutyRequest>();

    for (const request of leaveRequests) {
      for (
        let date = request.start_date;
        date <= request.end_date;
        date = addIsoDay(date)
      ) {
        if (date < startDate || date > endDate) {
          continue;
        }

        const key = `${request.user_id}:${date}`;
        if (!leaveByKey.has(key)) {
          leaveByKey.set(key, request);
        }
      }
    }

    for (const request of officialDutyRequests) {
      const dutyEndDate = request.duty_end_date || request.duty_date;

      for (
        let date = request.duty_date;
        date <= dutyEndDate;
        date = addIsoDay(date)
      ) {
        if (date < startDate || date > endDate) {
          continue;
        }

        const key = `${request.user_id}:${date}`;
        if (!officialDutyByKey.has(key)) {
          officialDutyByKey.set(key, request);
        }
      }
    }

    const report = profiles.flatMap((profile) =>
      getDateRange(startDate, endDate).map((date) => {
        const key = `${profile.id}:${date}`;
        const officialDuty = officialDutyByKey.get(key);
        const leave = leaveByKey.get(key);
        const record = attendanceByKey.get(key);

        if (officialDuty) {
          return {
            id: `official-duty-${officialDuty.id}`,
            user_id: profile.id,
            work_date: date,
            check_in_at: null,
            check_out_at: null,
            check_in_distance_meters: null,
            check_out_distance_meters: null,
            check_in_status: "official_duty",
            check_out_status: null,
            note: "ไปราชการ",
            full_name: profile.full_name,
            phone: profile.phone,
            position: profile.position,
            role: profile.role,
            account_status: profile.account_status,
            daily_status: "official_duty" as DailyStatus,
          };
        }

        if (leave) {
          const status =
            leave.leave_type === "sick" ? "sick" : "personal";
          const label = leaveLabel(leave.leave_type);

          return {
            id: `leave-${leave.id}-${date}`,
            user_id: profile.id,
            work_date: date,
            check_in_at: null,
            check_out_at: null,
            check_in_distance_meters: null,
            check_out_distance_meters: null,
            check_in_status: status,
            check_out_status: null,
            note: label,
            full_name: profile.full_name,
            phone: profile.phone,
            position: profile.position,
            role: profile.role,
            account_status: profile.account_status,
            daily_status: status as DailyStatus,
          };
        }

        if (record?.check_in_at) {
          return {
            ...record,
            full_name: profile.full_name,
            phone: profile.phone,
            position: profile.position,
            role: profile.role,
            account_status: profile.account_status,
            daily_status: "present" as DailyStatus,
          };
        }

        return {
          id: `absent-${profile.id}-${date}`,
          user_id: profile.id,
          work_date: date,
          check_in_at: null,
          check_out_at: null,
          check_in_distance_meters: null,
          check_out_distance_meters: null,
          check_in_status: "absent",
          check_out_status: null,
          note: "ไม่มาปฏิบัติราชการ",
          full_name: profile.full_name,
          phone: profile.phone,
          position: profile.position,
          role: profile.role,
          account_status: profile.account_status,
          daily_status: "absent" as DailyStatus,
        };
      })
    );

    report.sort((left, right) => {
      if (left.work_date !== right.work_date) {
        return right.work_date.localeCompare(left.work_date);
      }

      const leftTime = left.check_in_at ?? "9999";
      const rightTime = right.check_in_at ?? "9999";

      if (leftTime !== rightTime) {
        return leftTime.localeCompare(rightTime);
      }

      return left.full_name.localeCompare(right.full_name, "th");
    });

    const summary = {
      total: report.length,
      totalPersonnel: profiles.length,
      present: report.filter((record) => Boolean(record.check_in_at))
        .length,
      sickLeave: report.filter((record) => record.daily_status === "sick")
        .length,
      personalLeave: report.filter(
        (record) => record.daily_status === "personal"
      ).length,
      officialDuty: report.filter(
        (record) => record.daily_status === "official_duty"
      ).length,
      absent: report.filter((record) => record.daily_status === "absent")
        .length,
      complete: report.filter(
        (record) => record.check_in_at && record.check_out_at
      ).length,
      late: report.filter(
        (record) => record.check_in_status === "late"
      ).length,
      early: report.filter(
        (record) => record.check_out_status === "early"
      ).length,
      incomplete: report.filter(
        (record) => record.check_in_at && !record.check_out_at
      ).length,
    };

    return NextResponse.json({
      ok: true,
      startDate,
      endDate,
      summary,
      records: report,
    });
  } catch (error) {
    console.error("Admin attendance API error:", error);

    return NextResponse.json(
      {
        ok: false,
        message: "เกิดข้อผิดพลาดระหว่างสร้างรายงานการลงเวลา",
      },
      { status: 500 }
    );
  }
}
