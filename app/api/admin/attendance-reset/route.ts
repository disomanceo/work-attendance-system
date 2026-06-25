import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

function getAccessToken(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return "";
  }

  return authorization.slice("Bearer ".length).trim();
}

function isValidDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
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

  const token = getAccessToken(request);

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

  const url = new URL(request.url);
  const workDate = url.searchParams.get("date")?.trim() ?? "";

  if (!isValidDate(workDate)) {
    return NextResponse.json(
      { ok: false, message: "รูปแบบวันที่ไม่ถูกต้อง" },
      { status: 400 }
    );
  }

  const { count, error } = await auth.adminClient
    .from("attendance_records")
    .select("id", { count: "exact", head: true })
    .eq("work_date", workDate);

  if (error) {
    console.error("Count attendance reset records error:", error);

    return NextResponse.json(
      {
        ok: false,
        message: "ไม่สามารถตรวจสอบจำนวนข้อมูลได้",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    date: workDate,
    count: count ?? 0,
  });
}

export async function DELETE(request: Request) {
  const auth = await requireDirector(request);

  if (!auth.ok) {
    return auth.response;
  }

  let body: {
    date?: string;
    confirmation?: string;
  };

  try {
    body = (await request.json()) as {
      date?: string;
      confirmation?: string;
    };
  } catch {
    return NextResponse.json(
      { ok: false, message: "ข้อมูลที่ส่งมาไม่ถูกต้อง" },
      { status: 400 }
    );
  }

  const workDate = body.date?.trim() ?? "";
  const confirmation = body.confirmation?.trim() ?? "";

  if (!isValidDate(workDate)) {
    return NextResponse.json(
      { ok: false, message: "รูปแบบวันที่ไม่ถูกต้อง" },
      { status: 400 }
    );
  }

  if (confirmation !== workDate) {
    return NextResponse.json(
      {
        ok: false,
        message: "การยืนยันวันที่ไม่ตรงกับวันที่ที่ต้องการรีเซ็ต",
      },
      { status: 400 }
    );
  }

  const { count, error: countError } = await auth.adminClient
    .from("attendance_records")
    .select("id", { count: "exact", head: true })
    .eq("work_date", workDate);

  if (countError) {
    console.error("Count reset records error:", countError);

    return NextResponse.json(
      {
        ok: false,
        message: "ไม่สามารถตรวจสอบข้อมูลก่อนรีเซ็ตได้",
      },
      { status: 500 }
    );
  }

  const total = count ?? 0;

  if (total === 0) {
    return NextResponse.json({
      ok: true,
      deletedCount: 0,
      message: "ไม่พบข้อมูลการลงเวลาในวันที่เลือก",
    });
  }

  const { error: deleteError } = await auth.adminClient
    .from("attendance_records")
    .delete()
    .eq("work_date", workDate);

  if (deleteError) {
    console.error("Reset attendance history error:", deleteError);

    return NextResponse.json(
      {
        ok: false,
        message: "ไม่สามารถรีเซ็ตประวัติการลงเวลาได้",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    deletedCount: total,
    message: `รีเซ็ตประวัติการลงเวลา ${total} รายการเรียบร้อยแล้ว`,
  });
}
