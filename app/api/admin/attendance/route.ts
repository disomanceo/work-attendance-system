import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type AttendanceRecord = {
  id: string;
  user_id: string;
  work_date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  check_in_distance_meters: number | null;
  check_out_distance_meters: number | null;
  check_in_status: string;
  check_out_status: string | null;
  note: string | null;
};

type Profile = {
  id: string;
  full_name: string;
  phone: string;
  position: string | null;
  role: string;
  account_status: string;
};

function getServerConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    return null;
  }

  return {
    supabaseUrl,
    publishableKey,
    serviceRoleKey,
  };
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

async function requireAdmin(request: Request) {
  const config = getServerConfig();

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

  const accessToken = getAccessToken(request);

  if (!accessToken) {
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
  } = await authClient.auth.getUser(accessToken);

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
    !["admin", "director", "staff"].includes(profile.role) ||
    profile.account_status !== "active"
  ) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          message: "คุณไม่มีสิทธิ์ดูรายงานการลงเวลา",
        },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true as const,
    adminClient,
  };
}

export async function GET(request: Request) {
  try {
    const authResult = await requireAdmin(request);

    if (!authResult.ok) {
      return authResult.response;
    }

    const url = new URL(request.url);

    const startDate = url.searchParams.get("startDate")?.trim() ?? "";
    const endDate = url.searchParams.get("endDate")?.trim() ?? "";

    if (!isValidDate(startDate) || !isValidDate(endDate)) {
      return NextResponse.json(
        {
          ok: false,
          message: "รูปแบบวันที่ไม่ถูกต้อง",
        },
        { status: 400 }
      );
    }

    if (startDate > endDate) {
      return NextResponse.json(
        {
          ok: false,
          message: "วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด",
        },
        { status: 400 }
      );
    }

    const { data: attendanceData, error: attendanceError } =
      await authResult.adminClient
        .from("attendance_records")
        .select(
          `
            id,
            user_id,
            work_date,
            check_in_at,
            check_out_at,
            check_in_distance_meters,
            check_out_distance_meters,
            check_in_status,
            check_out_status,
            note
          `
        )
        .gte("work_date", startDate)
        .lte("work_date", endDate)
        .order("work_date", { ascending: false })
        .order("check_in_at", { ascending: true });

    if (attendanceError) {
      console.error(
        "Load admin attendance records error:",
        attendanceError
      );

      return NextResponse.json(
        {
          ok: false,
          message: "ไม่สามารถโหลดข้อมูลการลงเวลาได้",
        },
        { status: 500 }
      );
    }

    const records = (attendanceData ?? []) as AttendanceRecord[];

    const userIds = Array.from(
      new Set(records.map((record) => record.user_id))
    );

    let profiles: Profile[] = [];

    if (userIds.length > 0) {
      const { data: profileData, error: profilesError } =
        await authResult.adminClient
          .from("profiles")
          .select(
            `
              id,
              full_name,
              phone,
              position,
              role,
              account_status
            `
          )
          .in("id", userIds);

      if (profilesError) {
        console.error(
          "Load attendance profiles error:",
          profilesError
        );

        return NextResponse.json(
          {
            ok: false,
            message: "ไม่สามารถโหลดข้อมูลบุคลากรได้",
          },
          { status: 500 }
        );
      }

      profiles = (profileData ?? []) as Profile[];
    }

    const profileMap = new Map(
      profiles.map((profile) => [profile.id, profile])
    );

    const report = records.map((record) => {
      const profile = profileMap.get(record.user_id);

      return {
        ...record,
        full_name: profile?.full_name ?? "ไม่พบชื่อสมาชิก",
        phone: profile?.phone ?? "",
        position: profile?.position ?? null,
        role: profile?.role ?? "",
        account_status: profile?.account_status ?? "",
      };
    });

    const summary = {
      total: report.length,
      complete: report.filter(
        (record) => record.check_in_at && record.check_out_at
      ).length,
      late: report.filter(
        (record) => record.check_in_status === "late"
      ).length,
      early: report.filter(
        (record) => record.check_out_status === "early"
      ).length,
      incomplete: report.filter(
        (record) => record.check_in_at && !record.check_out_at
      ).length,
    };

    return NextResponse.json({
      ok: true,
      startDate,
      endDate,
      summary,
      records: report,
    });
  } catch (error) {
    console.error("Admin attendance API error:", error);

    return NextResponse.json(
      {
        ok: false,
        message: "เกิดข้อผิดพลาดระหว่างสร้างรายงานการลงเวลา",
      },
      { status: 500 }
    );
  }
}
