import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type AttendanceRecord = {
  id: string;
  check_in_at: string | null;
  check_out_at: string | null;
  check_in_status: string | null;
  check_out_status: string | null;
};

function getAccessToken(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return "";
  }

  return authorization.slice("Bearer ".length).trim();
}

function getBangkokDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getBangkokTime() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
}

function normalizeTime(value: string) {
  return value.slice(0, 8);
}

function getRoleEndTime(
  role: string,
  settings: {
    director_end_time: string;
    teacher_end_time: string;
    staff_end_time: string;
    janitor_end_time: string;
  }
) {
  const roleEndTimeMap: Record<string, string> = {
    director: settings.director_end_time,
    teacher: settings.teacher_end_time,
    staff: settings.staff_end_time,
    janitor: settings.janitor_end_time,
    admin: settings.director_end_time,
  };

  return roleEndTimeMap[role] ?? settings.teacher_end_time;
}

export async function POST(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
      return NextResponse.json(
        { ok: false, message: "ระบบยังไม่ได้ตั้งค่า Supabase ฝั่ง Server" },
        { status: 500 }
      );
    }

    const accessToken = getAccessToken(request);

    if (!accessToken) {
      return NextResponse.json(
        { ok: false, message: "กรุณาเข้าสู่ระบบใหม่" },
        { status: 401 }
      );
    }

    const authClient = createClient(supabaseUrl, publishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json(
        { ok: false, message: "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่" },
        { status: 401 }
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("id, role, account_status")
      .eq("id", user.id)
      .single();

    if (
      profileError ||
      !profile ||
      profile.account_status !== "active"
    ) {
      return NextResponse.json(
        { ok: false, message: "บัญชีนี้ไม่มีสิทธิ์ลงเวลา" },
        { status: 403 }
      );
    }

    const { data: settings, error: settingsError } = await adminClient
      .from("attendance_settings")
      .select(
        "director_end_time, teacher_end_time, staff_end_time, janitor_end_time"
      )
      .eq("id", 1)
      .single();

    if (settingsError || !settings) {
      return NextResponse.json(
        { ok: false, message: "ไม่พบการตั้งค่าเวลาเลิกงาน" },
        { status: 500 }
      );
    }

    const roleEndTime = getRoleEndTime(profile.role, settings);

    if (getBangkokTime() < normalizeTime(roleEndTime)) {
      return NextResponse.json(
        {
          ok: false,
          message: `ยังไม่ถึงเวลาเลิกงาน ${roleEndTime.slice(0, 5)} น.`,
        },
        { status: 400 }
      );
    }

    const workDate = getBangkokDate();

    const { data: currentRecord, error: recordError } = await adminClient
      .from("attendance_records")
      .select(
        "id, check_in_at, check_out_at, check_in_status, check_out_status"
      )
      .eq("user_id", user.id)
      .eq("work_date", workDate)
      .maybeSingle();

    if (recordError) {
      console.error("Load checkout record error:", recordError);

      return NextResponse.json(
        { ok: false, message: "ไม่สามารถตรวจสอบข้อมูลลงเวลาวันนี้ได้" },
        { status: 500 }
      );
    }

    if (!currentRecord?.id || !currentRecord.check_in_at) {
      return NextResponse.json(
        { ok: false, message: "ยังไม่มีข้อมูลเช็กอินของวันนี้" },
        { status: 400 }
      );
    }

    if (currentRecord.check_out_at) {
      return NextResponse.json({
        ok: true,
        record: currentRecord as AttendanceRecord,
        message: "วันนี้คุณลงเวลาเลิกงานแล้ว",
      });
    }

    const checkOutAt = new Date().toISOString();

    const { data: updatedRecord, error: updateError } = await adminClient
      .from("attendance_records")
      .update({
        check_out_at: checkOutAt,
        check_out_status: "normal",
        updated_at: checkOutAt,
      })
      .eq("id", currentRecord.id)
      .eq("user_id", user.id)
      .is("check_out_at", null)
      .select(
        "id, check_in_at, check_out_at, check_in_status, check_out_status"
      )
      .maybeSingle();

    if (updateError) {
      console.error("Checkout update error:", updateError);

      return NextResponse.json(
        {
          ok: false,
          message: `บันทึกเวลาเลิกงานไม่สำเร็จ: ${updateError.message}`,
        },
        { status: 500 }
      );
    }

    if (!updatedRecord) {
      return NextResponse.json(
        {
          ok: false,
          message: "ไม่พบรายการที่สามารถบันทึกเวลาเลิกงานได้ กรุณาโหลดหน้าใหม่",
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      ok: true,
      record: updatedRecord as AttendanceRecord,
      message: "บันทึกเวลาเลิกงานเรียบร้อยแล้ว",
    });
  } catch (error) {
    console.error("Checkout API error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "เกิดข้อผิดพลาดระหว่างบันทึกเวลาเลิกงาน",
      },
      { status: 500 }
    );
  }
}
