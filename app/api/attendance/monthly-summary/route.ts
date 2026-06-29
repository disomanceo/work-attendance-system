import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type AttendanceRow = {
  work_date: string;
  check_in_status: string | null;
};

type LeaveRow = {
  leave_type: string;
  start_date: string;
  end_date: string;
};

type OfficialDutyRow = {
  duty_date: string;
  status: string;
};

function getBangkokMonthRange() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());

  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(
    lastDay
  ).padStart(2, "0")}`;

  return { year, month, start, end };
}

function addWeekdaysToSet(
  target: Set<string>,
  startDate: string,
  endDate: string,
  monthStart: string,
  monthEnd: string
) {
  const effectiveStart = startDate < monthStart ? monthStart : startDate;
  const effectiveEnd = endDate > monthEnd ? monthEnd : endDate;
  const start = new Date(`${effectiveStart}T00:00:00Z`);
  const end = new Date(`${effectiveEnd}T00:00:00Z`);

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    start > end
  ) {
    return;
  }

  for (
    const current = new Date(start);
    current <= end;
    current.setUTCDate(current.getUTCDate() + 1)
  ) {
    const day = current.getUTCDay();
    if (day === 0 || day === 6) continue;
    target.add(current.toISOString().slice(0, 10));
  }
}

function addOfficialDutyDate(target: Set<string>, dutyDate: string) {
  const date = new Date(`${dutyDate}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    return;
  }

  const day = date.getUTCDay();
  if (day === 0 || day === 6) {
    return;
  }

  target.add(dutyDate);
}

export async function GET(request: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !publishable || !service) {
      throw new Error("Environment ไม่ครบ");
    }

    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ")
      ? authorization.slice(7).trim()
      : "";

    if (!token) {
      return NextResponse.json(
        { ok: false, message: "กรุณาเข้าสู่ระบบ" },
        { status: 401 }
      );
    }

    const auth = createClient(url, publishable, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
      error: userError,
    } = await auth.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json(
        { ok: false, message: "กรุณาเข้าสู่ระบบ" },
        { status: 401 }
      );
    }

    const admin = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const range = getBangkokMonthRange();

    const [
      { data: attendanceData, error: attendanceError },
      { data: leaveData, error: leaveError },
      { data: officialDutyData, error: officialDutyError },
    ] = await Promise.all([
      admin
        .from("attendance_records")
        .select("work_date, check_in_status")
        .eq("user_id", user.id)
        .gte("work_date", range.start)
        .lte("work_date", range.end),

      admin
        .from("leave_requests")
        .select("leave_type, start_date, end_date")
        .eq("user_id", user.id)
        .in("status", ["pending", "approved"])
        .lte("start_date", range.end)
        .gte("end_date", range.start),

      admin
        .from("official_duty_requests")
        .select("duty_date, status")
        .eq("user_id", user.id)
        .in("status", ["pending", "approved"])
        .gte("duty_date", range.start)
        .lte("duty_date", range.end),
    ]);

    if (attendanceError) {
      console.error("Monthly attendance query error:", attendanceError);
      throw new Error("โหลดสรุปการลงเวลาไม่สำเร็จ");
    }

    if (leaveError) {
      console.error("Monthly leave query error:", leaveError);
      throw new Error("โหลดสรุปการลาไม่สำเร็จ");
    }

    if (officialDutyError) {
      console.error(
        "Monthly official duty query error:",
        officialDutyError
      );
      throw new Error("โหลดสรุปการไปราชการไม่สำเร็จ");
    }

    const attendance = (attendanceData ?? []) as AttendanceRow[];
    const leaveRequests = (leaveData ?? []) as LeaveRow[];
    const officialDutyRequests =
      (officialDutyData ?? []) as OfficialDutyRow[];

    const normalDates = new Set<string>();
    const lateDates = new Set<string>();
    const leaveDates = new Set<string>();
    const officialDutyDates = new Set<string>();

    for (const row of attendance) {
      if (!row.work_date) continue;

      if (row.check_in_status === "late") {
        lateDates.add(row.work_date);
      } else if (row.check_in_status === "official_duty") {
        officialDutyDates.add(row.work_date);
      } else {
        normalDates.add(row.work_date);
      }
    }

    for (const row of leaveRequests) {
      const leaveType = String(row.leave_type ?? "").trim().toLowerCase();

      if (leaveType === "official_duty") {
        addWeekdaysToSet(
          officialDutyDates,
          row.start_date,
          row.end_date,
          range.start,
          range.end
        );
      } else if (leaveType === "sick" || leaveType === "personal") {
        addWeekdaysToSet(
          leaveDates,
          row.start_date,
          row.end_date,
          range.start,
          range.end
        );
      }
    }

    for (const row of officialDutyRequests) {
      if (!row.duty_date) continue;
      addOfficialDutyDate(officialDutyDates, row.duty_date);
    }

    for (const date of officialDutyDates) {
      normalDates.delete(date);
      lateDates.delete(date);
      leaveDates.delete(date);
    }

    for (const date of leaveDates) {
      normalDates.delete(date);
      lateDates.delete(date);
    }

    return NextResponse.json({
      ok: true,
      year: range.year,
      month: range.month,
      summary: {
        normal: normalDates.size,
        late: lateDates.size,
        leave: leaveDates.size,
        officialDuty: officialDutyDates.size,
      },
    });
  } catch (error) {
    console.error("Monthly summary error:", error);

    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "เกิดข้อผิดพลาด",
      },
      { status: 500 }
    );
  }
}
