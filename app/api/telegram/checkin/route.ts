import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendTelegramCheckInNotification } from "@/lib/telegram/checkin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestBody = {
  attendanceRecordId?: string;
  userId?: string;
  schoolName?: string | null;
};

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase server environment variables are not configured"
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;

    const attendanceRecordId =
      body.attendanceRecordId?.trim();

    const userId = body.userId?.trim();

    if (!attendanceRecordId || !userId) {
      return NextResponse.json(
        {
          ok: false,
          message: "ข้อมูลแจ้งเตือนไม่ครบ",
        },
        {
          status: 400,
        }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: attendanceRecord, error: recordError } =
      await supabase
        .from("attendance_records")
        .select(
          `
            id,
            user_id,
            check_in_at,
            check_in_status,
            note,
            check_in_distance_meters
          `
        )
        .eq("id", attendanceRecordId)
        .eq("user_id", userId)
        .single();

    if (recordError || !attendanceRecord) {
      console.error(
        "Telegram check-in record error:",
        recordError
      );

      return NextResponse.json({
        ok: false,
        message: "ไม่พบข้อมูลเช็กอิน",
      });
    }

    if (!attendanceRecord.check_in_at) {
      return NextResponse.json({
        ok: false,
        message: "ข้อมูลนี้ยังไม่มีเวลาเช็กอิน",
      });
    }

    const { data: profile, error: profileError } =
      await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", userId)
        .single();

    if (profileError || !profile?.full_name) {
      console.error(
        "Telegram check-in profile error:",
        profileError
      );

      return NextResponse.json({
        ok: false,
        message: "ไม่พบข้อมูลบุคลากร",
      });
    }

    await sendTelegramCheckInNotification({
      fullName: profile.full_name,
      checkInAt: attendanceRecord.check_in_at,
      checkInStatus: attendanceRecord.check_in_status,
      note: attendanceRecord.note,
      distanceMeters:
        attendanceRecord.check_in_distance_meters,
      schoolName: body.schoolName ?? null,
    });

    return NextResponse.json({
      ok: true,
      message: "ส่ง Telegram สำเร็จ",
    });
  } catch (error) {
    console.error(
      "Telegram check-in notification error:",
      error
    );

    return NextResponse.json({
      ok: false,
      message: "ส่ง Telegram ไม่สำเร็จ",
    });
  }
}