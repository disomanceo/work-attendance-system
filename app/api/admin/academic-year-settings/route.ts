import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function configuration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !publishable || !service) return null;
  return { url, publishable, service };
}

function bearerToken(request: Request) {
  const authorization =
    request.headers.get("authorization") ?? "";

  return authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";
}

async function authorize(request: Request) {
  const config = configuration();

  if (!config) {
    return {
      ok: false as const,
      status: 500,
      message: "Supabase environment variables are incomplete",
    };
  }

  const token = bearerToken(request);

  if (!token) {
    return {
      ok: false as const,
      status: 401,
      message: "กรุณาเข้าสู่ระบบใหม่",
    };
  }

  const authClient = createClient(
    config.url,
    config.publishable,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser();

  if (userError || !user) {
    return {
      ok: false as const,
      status: 401,
      message: "กรุณาเข้าสู่ระบบใหม่",
    };
  }

  const admin = createClient(config.url, config.service, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, role, account_status")
    .eq("id", user.id)
    .maybeSingle();

  const role = String(profile?.role ?? "").toLowerCase();

  if (
    profileError ||
    !profile ||
    profile.account_status !== "active" ||
    !["admin", "director"].includes(role)
  ) {
    return {
      ok: false as const,
      status: 403,
      message: "ไม่มีสิทธิ์แก้ไขปีการศึกษา",
    };
  }

  return {
    ok: true as const,
    admin,
  };
}

function parseAcademicYear(value: unknown) {
  const year = Number(value);

  if (
    !Number.isInteger(year) ||
    year < 2500 ||
    year > 2700
  ) {
    throw new Error(
      "ปีการศึกษาต้องเป็น พ.ศ. ระหว่าง 2500 ถึง 2700",
    );
  }

  return year;
}

export async function GET(request: Request) {
  const auth = await authorize(request);

  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, message: auth.message },
      { status: auth.status },
    );
  }

  const { data, error } = await auth.admin
    .from("attendance_settings")
    .select("active_academic_year")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    console.error("Load academic year error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          "ไม่สามารถโหลดปีการศึกษา กรุณารัน migration ก่อน",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    activeAcademicYear:
      data?.active_academic_year ?? null,
  });
}

export async function PUT(request: Request) {
  const auth = await authorize(request);

  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, message: auth.message },
      { status: auth.status },
    );
  }

  try {
    const body = (await request.json()) as {
      activeAcademicYear?: unknown;
    };

    const activeAcademicYear = parseAcademicYear(
      body.activeAcademicYear,
    );

    const { error } = await auth.admin
      .from("attendance_settings")
      .update({
        active_academic_year: activeAcademicYear,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);

    if (error) {
      console.error("Save academic year error:", error);
      throw new Error(
        "ไม่สามารถบันทึกปีการศึกษา กรุณารัน migration ก่อน",
      );
    }

    return NextResponse.json({
      ok: true,
      activeAcademicYear,
      message: "บันทึกปีการศึกษาเรียบร้อยแล้ว",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "ไม่สามารถบันทึกปีการศึกษาได้",
      },
      { status: 400 },
    );
  }
}
