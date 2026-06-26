import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type RoleKey = "director" | "teacher" | "staff" | "janitor";

type PolicyInput = {
  role_key: RoleKey;
  fiscal_year: number;
  sick_leave_days: number;
  personal_leave_days: number;
  late_limit_count: number;
  grace_minutes: number;
  is_active: boolean;
};

const ROLE_KEYS: RoleKey[] = [
  "director",
  "teacher",
  "staff",
  "janitor",
];

function getConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    return null;
  }

  return {
    supabaseUrl,
    publishableKey,
    serviceRoleKey,
  };
}

function getToken(request: Request) {
  const authorization =
    request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return "";
  }

  return authorization
    .slice("Bearer ".length)
    .trim();
}

async function requireDirector(request: Request) {
  const config = getConfig();

  if (!config) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          message:
            "ระบบยังไม่ได้ตั้งค่า Supabase ฝั่ง Server",
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
        {
          ok: false,
          message: "กรุณาเข้าสู่ระบบใหม่",
        },
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
          message:
            "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่",
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

  const { data: profile } = await adminClient
    .from("profiles")
    .select("role, account_status")
    .eq("id", user.id)
    .single();

  if (
    !profile ||
    !["director", "admin"].includes(profile.role) ||
    profile.account_status !== "active"
  ) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          message:
            "เฉพาะผู้อำนวยการหรือผู้ดูแลระบบเท่านั้น",
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

function validInteger(
  value: unknown,
  minimum: number,
  maximum: number
) {
  const result = Number(value);

  if (
    !Number.isInteger(result) ||
    result < minimum ||
    result > maximum
  ) {
    return null;
  }

  return result;
}

export async function GET(request: Request) {
  const auth = await requireDirector(request);

  if (!auth.ok) {
    return auth.response;
  }

  const url = new URL(request.url);
  const fiscalYear = validInteger(
    url.searchParams.get("fiscalYear"),
    2500,
    2700
  );

  let activeFiscalYear = fiscalYear;

  if (!activeFiscalYear) {
    const { data: settings } =
      await auth.adminClient
        .from("attendance_settings")
        .select("active_fiscal_year")
        .eq("id", 1)
        .single();

    activeFiscalYear = Number(
      settings?.active_fiscal_year
    );
  }

  if (
    !Number.isInteger(activeFiscalYear) ||
    activeFiscalYear < 2500
  ) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "ยังไม่ได้กำหนดปีงบประมาณ",
      },
      { status: 400 }
    );
  }

  const { data, error } = await auth.adminClient
    .from("position_policies")
    .select(
      `
        id,
        role_key,
        fiscal_year,
        sick_leave_days,
        personal_leave_days,
        late_limit_count,
        grace_minutes,
        is_active
      `
    )
    .eq("fiscal_year", activeFiscalYear)
    .order("role_key");

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "ไม่สามารถโหลดสิทธิ์ตามตำแหน่งได้",
        detail: error.message,
      },
      { status: 500 }
    );
  }

  const byRole = new Map(
    (data ?? []).map((item) => [
      item.role_key,
      item,
    ])
  );

  const policies = ROLE_KEYS.map((roleKey) => {
    const existing = byRole.get(roleKey);

    return (
      existing ?? {
        role_key: roleKey,
        fiscal_year: activeFiscalYear,
        sick_leave_days: 30,
        personal_leave_days: 15,
        late_limit_count: 5,
        grace_minutes: 0,
        is_active: true,
      }
    );
  });

  return NextResponse.json({
    ok: true,
    fiscalYear: activeFiscalYear,
    policies,
  });
}

export async function PUT(request: Request) {
  const auth = await requireDirector(request);

  if (!auth.ok) {
    return auth.response;
  }

  let body: {
    fiscalYear?: unknown;
    policies?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: "ข้อมูลที่ส่งมาไม่ถูกต้อง",
      },
      { status: 400 }
    );
  }

  const fiscalYear = validInteger(
    body.fiscalYear,
    2500,
    2700
  );

  if (!fiscalYear || !Array.isArray(body.policies)) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "กรุณาระบุปีงบประมาณและรายการสิทธิ์ให้ครบ",
      },
      { status: 400 }
    );
  }

  const normalized: PolicyInput[] = [];

  for (const item of body.policies) {
    const roleKey = item?.role_key as RoleKey;
    const sickLeaveDays = validInteger(
      item?.sick_leave_days,
      0,
      365
    );
    const personalLeaveDays = validInteger(
      item?.personal_leave_days,
      0,
      365
    );
    const lateLimitCount = validInteger(
      item?.late_limit_count,
      0,
      999
    );
    const graceMinutes = validInteger(
      item?.grace_minutes,
      0,
      180
    );

    if (
      !ROLE_KEYS.includes(roleKey) ||
      sickLeaveDays === null ||
      personalLeaveDays === null ||
      lateLimitCount === null ||
      graceMinutes === null
    ) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "ค่าการลาและมาสายไม่ถูกต้อง",
        },
        { status: 400 }
      );
    }

    normalized.push({
      role_key: roleKey,
      fiscal_year: fiscalYear,
      sick_leave_days: sickLeaveDays,
      personal_leave_days:
        personalLeaveDays,
      late_limit_count: lateLimitCount,
      grace_minutes: graceMinutes,
      is_active: Boolean(item?.is_active),
    });
  }

  const payload = normalized.map((item) => ({
    ...item,
    updated_by: auth.userId,
    updated_at: new Date().toISOString(),
  }));

  const { data, error } = await auth.adminClient
    .from("position_policies")
    .upsert(payload, {
      onConflict: "role_key,fiscal_year",
    })
    .select();

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "ไม่สามารถบันทึกสิทธิ์ตามตำแหน่งได้",
        detail: error.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message:
      "บันทึกสิทธิ์การลาและเกณฑ์มาสายเรียบร้อยแล้ว",
    policies: data,
  });
}
