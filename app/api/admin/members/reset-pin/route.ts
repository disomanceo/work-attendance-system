import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type ResetPinBody = {
  userId?: unknown;
};

const DEFAULT_PIN = "123456";

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
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
      return NextResponse.json(
        { ok: false, message: "ระบบยังไม่ได้ตั้งค่า Supabase ฝั่ง Server" },
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

    const authClient = createClient(supabaseUrl, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json(
        { ok: false, message: "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่" },
        { status: 401 }
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("role, account_status")
      .eq("id", user.id)
      .single();

    if (
      profileError ||
      !profile ||
      !["admin", "director"].includes(profile.role) ||
      profile.account_status !== "active"
    ) {
      return NextResponse.json(
        { ok: false, message: "คุณไม่มีสิทธิ์รีเซ็ต PIN" },
        { status: 403 }
      );
    }

    const body = (await request.json()) as ResetPinBody;
    const userId =
      typeof body.userId === "string" ? body.userId.trim() : "";

    if (!userId) {
      return NextResponse.json(
        { ok: false, message: "ไม่พบรหัสสมาชิก" },
        { status: 400 }
      );
    }

    const { error: updateError } =
      await adminClient.auth.admin.updateUserById(userId, {
        password: DEFAULT_PIN,
      });

    if (updateError) {
      return NextResponse.json(
        { ok: false, message: `รีเซ็ต PIN ไม่สำเร็จ: ${updateError.message}` },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      defaultPin: DEFAULT_PIN,
      message: `รีเซ็ต PIN เป็น ${DEFAULT_PIN} เรียบร้อยแล้ว`,
    });
  } catch (error) {
    console.error("Admin reset PIN error:", error);
    return NextResponse.json(
      { ok: false, message: "เกิดข้อผิดพลาดระหว่างรีเซ็ต PIN" },
      { status: 500 }
    );
  }
}
