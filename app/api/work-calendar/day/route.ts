import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type DayType =
  | "PUBLIC_HOLIDAY"
  | "SCHOOL_HOLIDAY"
  | "SPECIAL_WORKDAY";

function tokenOf(request: Request) {
  const value = request.headers.get("authorization");
  return value?.startsWith("Bearer ")
    ? value.slice(7).trim()
    : "";
}

function isValidDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isWeekend(value: string) {
  const date = new Date(`${value}T12:00:00+07:00`);
  const day = date.getDay();
  return day === 0 || day === 6;
}

export async function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    return NextResponse.json(
      {
        ok: false,
        message: "ระบบยังไม่ได้ตั้งค่า Supabase ฝั่ง Server",
      },
      { status: 500 },
    );
  }

  const token = tokenOf(request);

  if (!token) {
    return NextResponse.json(
      { ok: false, message: "กรุณาเข้าสู่ระบบใหม่" },
      { status: 401 },
    );
  }

  const authClient = createClient(
    supabaseUrl,
    publishableKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  const {
    data: { user },
  } = await authClient.auth.getUser(token);

  if (!user) {
    return NextResponse.json(
      {
        ok: false,
        message: "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่",
      },
      { status: 401 },
    );
  }

  const adminClient = createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  const { data: profile } = await adminClient
    .from("profiles")
    .select("account_status")
    .eq("id", user.id)
    .single();

  if (!profile || profile.account_status !== "active") {
    return NextResponse.json(
      { ok: false, message: "บัญชีนี้ไม่มีสิทธิ์ใช้งาน" },
      { status: 403 },
    );
  }

  const date =
    new URL(request.url).searchParams.get("date") || "";

  if (!isValidDate(date)) {
    return NextResponse.json(
      { ok: false, message: "วันที่ไม่ถูกต้อง" },
      { status: 400 },
    );
  }

  const { data, error } = await adminClient
    .from("work_calendar_days")
    .select(
      "work_date, day_type, title, report_text, note",
    )
    .eq("work_date", date)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        message: "ไม่สามารถตรวจสอบปฏิทินปฏิบัติงานได้",
      },
      { status: 500 },
    );
  }

  const dayType = (data?.day_type || null) as DayType | null;
  const weekend = isWeekend(date);

  const isWorkingDay =
    dayType === "SPECIAL_WORKDAY"
      ? true
      : dayType === "PUBLIC_HOLIDAY" ||
          dayType === "SCHOOL_HOLIDAY"
        ? false
        : !weekend;

  return NextResponse.json({
    ok: true,
    date,
    isWorkingDay,
    dayType,
    title:
      data?.title ||
      (weekend
        ? "วันหยุดประจำสัปดาห์"
        : "วันปฏิบัติงาน"),
    reportText: data?.report_text || "",
    note: data?.note || "",
  });
}
