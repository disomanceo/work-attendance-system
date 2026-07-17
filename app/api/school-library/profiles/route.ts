import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getAccessToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return "";
  return authorization.slice("Bearer ".length).trim();
}

export async function GET(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
      return NextResponse.json(
        { ok: false, message: "Supabase config is missing" },
        { status: 500 },
      );
    }

    const accessToken = getAccessToken(request);
    if (!accessToken) {
      return NextResponse.json(
        { ok: false, message: "กรุณาเข้าสู่ระบบใหม่" },
        { status: 401 },
      );
    }

    const authClient = createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json(
        { ok: false, message: "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่" },
        { status: 401 },
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("id, role, account_status")
      .eq("id", user.id)
      .single();

    if (profileError || !profile || profile.account_status !== "active") {
      return NextResponse.json(
        { ok: false, message: "คุณไม่มีสิทธิ์ใช้งานส่วนนี้" },
        { status: 403 },
      );
    }

    const { data, error } = await adminClient
      .from("profiles")
      .select("id, full_name, position, role, account_status, phone")
      .not("full_name", "is", null)
      .order("full_name", { ascending: true });

    if (error) throw new Error(error.message);

    const profiles = (data ?? [])
      .filter(
        (item) =>
          String(item.full_name || "").trim() &&
          !String(item.phone || "").startsWith("deleted:"),
      )
      .map((item) => ({
        id: item.id,
        full_name: item.full_name,
        position: item.position,
        role: item.role,
        account_status: item.account_status,
      }));

    return NextResponse.json({ ok: true, profiles });
  } catch (error) {
    console.error("School library profiles error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "โหลดรายชื่อครูและบุคลากรไม่สำเร็จ",
      },
      { status: 500 },
    );
  }
}
