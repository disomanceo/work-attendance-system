import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type ChangePinBody = {
  currentPin?: unknown;
  newPin?: unknown;
};

function getAccessToken(request: Request) {
  const authorization = request.headers.get("authorization");
  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

export async function POST(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !publishableKey) {
      return NextResponse.json(
        { ok: false, message: "ระบบยังไม่ได้ตั้งค่า Supabase" },
        { status: 500 }
      );
    }

    const token = getAccessToken(request);
    if (!token) {
      return NextResponse.json(
        { ok: false, message: "กรุณาเข้าสู่ระบบใหม่" },
        { status: 401 }
      );
    }

    const body = (await request.json()) as ChangePinBody;
    const currentPin =
      typeof body.currentPin === "string" ? body.currentPin.trim() : "";
    const newPin =
      typeof body.newPin === "string" ? body.newPin.trim() : "";

    if (!/^\d{6}$/.test(currentPin) || !/^\d{6}$/.test(newPin)) {
      return NextResponse.json(
        { ok: false, message: "PIN ต้องเป็นตัวเลข 6 หลัก" },
        { status: 400 }
      );
    }

    if (currentPin === newPin) {
      return NextResponse.json(
        { ok: false, message: "PIN ใหม่ต้องไม่ซ้ำกับ PIN ปัจจุบัน" },
        { status: 400 }
      );
    }

    const authClient = createClient(supabaseUrl, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser(token);

    if (userError || !user?.email) {
      return NextResponse.json(
        { ok: false, message: "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่" },
        { status: 401 }
      );
    }

    const { error: signInError } = await authClient.auth.signInWithPassword({
      email: user.email,
      password: currentPin,
    });

    if (signInError) {
      return NextResponse.json(
        { ok: false, message: "PIN ปัจจุบันไม่ถูกต้อง" },
        { status: 400 }
      );
    }

    const { error: updateError } = await authClient.auth.updateUser({
      password: newPin,
    });

    if (updateError) {
      return NextResponse.json(
        { ok: false, message: `เปลี่ยน PIN ไม่สำเร็จ: ${updateError.message}` },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "เปลี่ยน PIN เรียบร้อยแล้ว",
    });
  } catch (error) {
    console.error("Change PIN error:", error);
    return NextResponse.json(
      { ok: false, message: "เกิดข้อผิดพลาดระหว่างเปลี่ยน PIN" },
      { status: 500 }
    );
  }
}
