import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getConfig() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    !supabaseUrl ||
    !publishableKey ||
    !serviceRoleKey
  ) {
    return null;
  }

  return {
    supabaseUrl,
    publishableKey,
    serviceRoleKey,
  };
}

function getToken(request: Request) {
  const authorization =
    request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return "";
  }

  return authorization
    .slice("Bearer ".length)
    .trim();
}

export async function GET(request: Request) {
  const config = getConfig();

  if (!config) {
    return NextResponse.json(
      {
        success: false,
        message:
          "ระบบยังไม่ได้ตั้งค่า Supabase ฝั่ง Server",
      },
      { status: 500 }
    );
  }

  const token = getToken(request);

  if (!token) {
    return NextResponse.json(
      {
        success: false,
        message: "กรุณาเข้าสู่ระบบใหม่",
      },
      { status: 401 }
    );
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
  } = await authClient.auth.getUser(token);

  if (userError || !user) {
    return NextResponse.json(
      {
        success: false,
        message:
          "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่",
      },
      { status: 401 }
    );
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

  const [
    profileResult,
    settingsResult,
  ] = await Promise.all([
    adminClient
      .from("profiles")
      .select("role, account_status")
      .eq("id", user.id)
      .single(),

    adminClient
      .from("attendance_settings")
      .select(
        `
          active_fiscal_year,
          director_start_time,
          teacher_start_time,
          staff_start_time,
          janitor_start_time
        `
      )
      .eq("id", 1)
      .single(),
  ]);

  const profile = profileResult.data;
  const settings = settingsResult.data;

  if (
    !profile ||
    profile.account_status !== "active"
  ) {
    return NextResponse.json(
      {
        success: false,
        message:
          "ไม่พบบัญชีที่เปิดใช้งาน",
      },
      { status: 403 }
    );
  }

  const roleKey =
    profile.role === "admin"
      ? "director"
      : profile.role;

  if (
    ![
      "director",
      "teacher",
      "staff",
      "janitor",
    ].includes(roleKey)
  ) {
    return NextResponse.json(
      {
        success: false,
        message:
          "ตำแหน่งของผู้ใช้ยังไม่รองรับการกำหนดสิทธิ์",
      },
      { status: 400 }
    );
  }

  const fiscalYear = Number(
    settings?.active_fiscal_year
  );

  if (
    !Number.isInteger(fiscalYear) ||
    fiscalYear < 2500
  ) {
    return NextResponse.json(
      {
        success: false,
        message:
          "ยังไม่ได้กำหนดปีงบประมาณ",
      },
      { status: 400 }
    );
  }

  const { data: policy, error } =
    await adminClient
      .from("position_policies")
      .select(
        `
          sick_leave_days,
          personal_leave_days,
          
          combined_leave_times_limit,
          combined_leave_days_limit,late_limit_count,
          grace_minutes
        `
      )
      .eq("role_key", roleKey)
      .eq("fiscal_year", fiscalYear)
      .eq("is_active", true)
      .maybeSingle();

  if (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          "ไม่สามารถโหลดสิทธิ์ตามตำแหน่งได้",
        detail: error.message,
      },
      { status: 500 }
    );
  }

  if (!policy) {
    return NextResponse.json(
      {
        success: false,
        message:
          "ยังไม่ได้กำหนดสิทธิ์สำหรับตำแหน่งนี้",
      },
      { status: 404 }
    );
  }

  const startTimeKey =
    `${roleKey}_start_time` as
      | "director_start_time"
      | "teacher_start_time"
      | "staff_start_time"
      | "janitor_start_time";

  return NextResponse.json({
    success: true,
    settings: {
      fiscalYear,
      roleKey,
      sickLeaveDays:
        policy.sick_leave_days,
      personalLeaveDays:
        policy.personal_leave_days,
      combinedLeaveTimesLimit:
        policy.combined_leave_times_limit,
      combinedLeaveDaysLimit:
        policy.combined_leave_days_limit,
      lateLimitCount:
        policy.late_limit_count,
      graceMinutes:
        policy.grace_minutes,
      startTime:
        settings?.[startTimeKey] ?? null,
    },
  });
}
