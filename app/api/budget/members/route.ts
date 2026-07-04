import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type ActiveProfile = {
  id: string;
  full_name: string;
  position: string | null;
  role: string;
};

function getConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !publishableKey || !serviceRoleKey) {
    return null;
  }

  return { url, publishableKey, serviceRoleKey };
}

function getAccessToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";

  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

export async function GET(request: Request) {
  try {
    const config = getConfig();

    if (!config) {
      return NextResponse.json(
        {
          ok: false,
          message: "ยังตั้งค่า Supabase ฝั่ง Server ไม่ครบ",
        },
        { status: 500 }
      );
    }

    const accessToken = getAccessToken(request);

    if (!accessToken) {
      return NextResponse.json(
        {
          ok: false,
          message: "กรุณาเข้าสู่ระบบใหม่",
        },
        { status: 401 }
      );
    }

    const authClient = createClient(
      config.url,
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
    } = await authClient.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json(
        {
          ok: false,
          message: "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่",
        },
        { status: 401 }
      );
    }

    const adminClient = createClient(
      config.url,
      config.serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const { data: requester, error: requesterError } =
      await adminClient
        .from("profiles")
        .select("id, account_status")
        .eq("id", user.id)
        .maybeSingle();

    if (
      requesterError ||
      !requester ||
      requester.account_status !== "active"
    ) {
      return NextResponse.json(
        {
          ok: false,
          message: "บัญชีผู้ใช้ยังไม่พร้อมใช้งาน",
        },
        { status: 403 }
      );
    }

    const { data, error } = await adminClient
      .from("profiles")
      .select("id, full_name, position, role")
      .eq("account_status", "active")
      .not("phone", "like", "deleted:%")
      .order("full_name", { ascending: true });

    if (error) {
      console.error("Load budget members error:", error);

      return NextResponse.json(
        {
          ok: false,
          message: "ไม่สามารถโหลดรายชื่อบุคลากรได้",
        },
        { status: 500 }
      );
    }

    const members = ((data ?? []) as ActiveProfile[])
      .filter((profile) => profile.full_name?.trim())
      .map((profile) => ({
        id: profile.id,
        fullName: profile.full_name.trim(),
        position: profile.position?.trim() || "",
        role: profile.role,
      }));

    return NextResponse.json({
      ok: true,
      members,
    });
  } catch (error) {
    console.error("Budget members API error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "เกิดข้อผิดพลาดระหว่างโหลดรายชื่อบุคลากร",
      },
      { status: 500 }
    );
  }
}
