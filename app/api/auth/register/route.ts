import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type RegisterBody = {
  fullName?: unknown;
  phone?: unknown;
  pin?: unknown;
};

function normalizeThaiPhone(value: string) {
  const digits = value.replace(/\D/g, "");

  if (digits.startsWith("66") && digits.length === 11) {
    return digits;
  }

  if (digits.startsWith("0") && digits.length === 10) {
    return `66${digits.slice(1)}`;
  }

  return "";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RegisterBody;

    const fullName =
      typeof body.fullName === "string" ? body.fullName.trim() : "";
    const rawPhone = typeof body.phone === "string" ? body.phone : "";
    const pin = typeof body.pin === "string" ? body.pin : "";

    if (!fullName || fullName.length > 120) {
      return NextResponse.json(
        { ok: false, message: "กรุณากรอกชื่อ–นามสกุลให้ถูกต้อง" },
        { status: 400 }
      );
    }

    const phone = normalizeThaiPhone(rawPhone);

    if (!phone) {
      return NextResponse.json(
        { ok: false, message: "เบอร์โทรศัพท์ไม่ถูกต้อง" },
        { status: 400 }
      );
    }

    if (!/^\d{6}$/.test(pin)) {
      return NextResponse.json(
        { ok: false, message: "PIN ต้องเป็นตัวเลข 6 หลัก" },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("Missing Supabase server environment variables");

      return NextResponse.json(
        { ok: false, message: "ระบบยังไม่ได้ตั้งค่าการสมัครสมาชิก" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const email = `${phone}@attendance.local`;

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: pin,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        phone,
        role: "staff",
        account_status: "active",
      },
    });

    if (error) {
      const duplicate =
        error.message.toLowerCase().includes("already") ||
        error.message.toLowerCase().includes("registered") ||
        error.message.toLowerCase().includes("exists");

      return NextResponse.json(
        {
          ok: false,
          message: duplicate
            ? "เบอร์โทรศัพท์นี้มีบัญชีอยู่แล้ว"
            : `สมัครสมาชิกไม่สำเร็จ: ${error.message}`,
        },
        { status: duplicate ? 409 : 400 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        userId: data.user.id,
        message: "สมัครสมาชิกสำเร็จ",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Register API error:", error);

    return NextResponse.json(
      { ok: false, message: "เกิดข้อผิดพลาดในการสมัครสมาชิก" },
      { status: 500 }
    );
  }
}
