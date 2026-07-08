import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function todayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function GET(request: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !publishable || !service) throw new Error("Environment ไม่ครบ");

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
    const today = todayKey();

    const { data, error } = await admin
      .from("leave_requests")
      .select("id, leave_type, start_date, end_date, status")
      .eq("user_id", user.id)
      .in("status", ["pending", "approved"])
      .lte("start_date", today)
      .gte("end_date", today)
      .limit(1)
      .maybeSingle();

    if (error) throw new Error("ตรวจสอบสถานะลาไม่สำเร็จ");

    const labels: Record<string, string> = {
      sick: "ลาป่วย",
      personal: "ลากิจ",
      official_duty: "ไปราชการ",
    };

    const leave = data
      ? {
          ...data,
          label: labels[data.leave_type] ?? data.leave_type,
          message: `วันนี้คุณได้ขออนุญาต${
            labels[data.leave_type] ?? data.leave_type
          }แล้ว ไม่ต้องลงเวลา`,
        }
      : null;

    return NextResponse.json({ ok: true, leave });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "เกิดข้อผิดพลาด",
      },
      { status: 500 }
    );
  }
}
