import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type LeaveRow = {
  start_date: string;
  end_date: string;
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
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  return { year, month, start, end };
}

function countWeekdaysInRange(
  startDate: string,
  endDate: string,
  monthStart: string,
  monthEnd: string
) {
  const start = new Date(`${startDate < monthStart ? monthStart : startDate}T00:00:00Z`);
  const end = new Date(`${endDate > monthEnd ? monthEnd : endDate}T00:00:00Z`);
  let count = 0;

  for (
    const current = new Date(start);
    current <= end;
    current.setUTCDate(current.getUTCDate() + 1)
  ) {
    const day = current.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
  }

  return count;
}

export async function GET(request: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !publishable || !service) {
      throw new Error("Environment ไม่ครบ");
    }

    const header = request.headers.get("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

    const auth = createClient(url, publishable, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
    } = await auth.auth.getUser(token);

    if (!user) {
      return NextResponse.json(
        { ok: false, message: "กรุณาเข้าสู่ระบบ" },
        { status: 401 }
      );
    }

    const admin = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const range = getBangkokMonthRange();

    const [{ data: attendance, error: attendanceError }, { data: leaves, error: leaveError }] =
      await Promise.all([
        admin
          .from("attendance_records")
          .select("work_date, check_in_status")
          .eq("user_id", user.id)
          .gte("work_date", range.start)
          .lte("work_date", range.end),
        admin
          .from("leave_requests")
          .select("start_date, end_date")
          .eq("user_id", user.id)
          .eq("status", "approved")
          .lte("start_date", range.end)
          .gte("end_date", range.start),
      ]);

    if (attendanceError) throw new Error("โหลดสรุปการลงเวลาไม่สำเร็จ");
    if (leaveError) throw new Error("โหลดสรุปการลาไม่สำเร็จ");

    const normal = (attendance ?? []).filter(
      (row) =>
        row.check_in_status !== "late" &&
        row.check_in_status !== "official_duty"
    ).length;

    const late = (attendance ?? []).filter(
      (row) => row.check_in_status === "late"
    ).length;

    const leave = ((leaves ?? []) as LeaveRow[]).reduce(
      (total, row) =>
        total +
        countWeekdaysInRange(
          row.start_date,
          row.end_date,
          range.start,
          range.end
        ),
      0
    );

    return NextResponse.json({
      ok: true,
      year: range.year,
      month: range.month,
      summary: { normal, late, leave },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error ? error.message : "เกิดข้อผิดพลาด",
      },
      { status: 500 }
    );
  }
}
