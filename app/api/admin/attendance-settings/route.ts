import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type SettingsPayload = {
  gps_enabled: boolean;
  latitude: number | null;
  longitude: number | null;
  allowed_radius_meters: number;
  director_start_time: string;
  director_end_time: string;
  teacher_start_time: string;
  teacher_end_time: string;
  staff_start_time: string;
  staff_end_time: string;
  janitor_start_time: string;
  janitor_end_time: string;
};

function getConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    return null;
  }

  return { supabaseUrl, publishableKey, serviceRoleKey };
}

function getToken(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return "";
  }

  return authorization.slice("Bearer ".length).trim();
}

function normalizeTime(value: unknown) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();

  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    return "";
  }

  return trimmed.slice(0, 5);
}

function normalizeCoordinate(
  value: unknown,
  minimum: number,
  maximum: number
) {
  if (value === null || value === "") return null;

  const numberValue = Number(value);

  if (
    !Number.isFinite(numberValue) ||
    numberValue < minimum ||
    numberValue > maximum
  ) {
    return undefined;
  }

  return numberValue;
}

async function requireDirector(request: Request) {
  const config = getConfig();

  if (!config) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          message: "ระบบยังไม่ได้ตั้งค่า Supabase ฝั่ง Server",
        },
        { status: 500 }
      ),
    };
  }

  const token = getToken(request);

  if (!token) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, message: "กรุณาเข้าสู่ระบบใหม่" },
        { status: 401 }
      ),
    };
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
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          message: "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่",
        },
        { status: 401 }
      ),
    };
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

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("id, role, account_status")
    .eq("id", user.id)
    .single();

  if (
    profileError ||
    !profile ||
    !["director", "admin"].includes(profile.role) ||
    profile.account_status !== "active"
  ) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          message: "เฉพาะผู้อำนวยการหรือผู้ดูแลระบบเท่านั้น",
        },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true as const,
    adminClient,
    userId: user.id,
  };
}

export async function GET(request: Request) {
  const auth = await requireDirector(request);

  if (!auth.ok) {
    return auth.response;
  }

  const { data, error } = await auth.adminClient
    .from("attendance_settings")
    .select(
      `
        id,
        school_name,
        latitude,
        longitude,
        allowed_radius_meters,
        gps_enabled,
        director_start_time,
        director_end_time,
        teacher_start_time,
        teacher_end_time,
        staff_start_time,
        staff_end_time,
        janitor_start_time,
        janitor_end_time,
        updated_at
      `
    )
    .eq("id", 1)
    .single();

  if (error || !data) {
    console.error("Load attendance settings error:", error);

    return NextResponse.json(
      {
        ok: false,
        message: "ไม่สามารถโหลดการตั้งค่าการลงเวลาได้",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, settings: data });
}

export async function PUT(request: Request) {
  const auth = await requireDirector(request);

  if (!auth.ok) {
    return auth.response;
  }

  let body: Partial<SettingsPayload>;

  try {
    body = (await request.json()) as Partial<SettingsPayload>;
  } catch {
    return NextResponse.json(
      { ok: false, message: "ข้อมูลที่ส่งมาไม่ถูกต้อง" },
      { status: 400 }
    );
  }

  const allowedRadius = Number(body.allowed_radius_meters);
  const latitude = normalizeCoordinate(body.latitude, -90, 90);
  const longitude = normalizeCoordinate(body.longitude, -180, 180);

  if (!Number.isFinite(allowedRadius) || allowedRadius < 0) {
    return NextResponse.json(
      {
        ok: false,
        message: "ระยะ GPS ต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป",
      },
      { status: 400 }
    );
  }

  if (latitude === undefined || longitude === undefined) {
    return NextResponse.json(
      {
        ok: false,
        message: "ค่าละติจูดหรือลองจิจูดไม่ถูกต้อง",
      },
      { status: 400 }
    );
  }

  if (
    body.gps_enabled &&
    (latitude === null || longitude === null)
  ) {
    return NextResponse.json(
      {
        ok: false,
        message: "กรุณาระบุพิกัดโรงเรียนก่อนเปิดใช้งาน GPS",
      },
      { status: 400 }
    );
  }

  const timeFields = {
    director_start_time: normalizeTime(body.director_start_time),
    director_end_time: normalizeTime(body.director_end_time),
    teacher_start_time: normalizeTime(body.teacher_start_time),
    teacher_end_time: normalizeTime(body.teacher_end_time),
    staff_start_time: normalizeTime(body.staff_start_time),
    staff_end_time: normalizeTime(body.staff_end_time),
    janitor_start_time: normalizeTime(body.janitor_start_time),
    janitor_end_time: normalizeTime(body.janitor_end_time),
  };

  if (Object.values(timeFields).some((value) => !value)) {
    return NextResponse.json(
      {
        ok: false,
        message: "กรุณากำหนดเวลาให้ครบทุกตำแหน่ง",
      },
      { status: 400 }
    );
  }

  const payload = {
    gps_enabled: Boolean(body.gps_enabled),
    latitude,
    longitude,
    allowed_radius_meters: Math.round(allowedRadius),
    ...timeFields,
    updated_by: auth.userId,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await auth.adminClient
    .from("attendance_settings")
    .update(payload)
    .eq("id", 1)
    .select()
    .single();

  if (error || !data) {
    console.error("Update attendance settings error:", error);

    return NextResponse.json(
      {
        ok: false,
        message: "ไม่สามารถบันทึกการตั้งค่าการลงเวลาได้",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "บันทึกการตั้งค่าเรียบร้อยแล้ว",
    settings: data,
  });
}
