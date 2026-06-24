import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type MemberRole =
  | "admin"
  | "director"
  | "teacher"
  | "staff"
  | "janitor";

type AccountStatus = "pending" | "active" | "suspended";

type UpdateMemberBody = {
  id?: unknown;
  role?: unknown;
  accountStatus?: unknown;
  position?: unknown;
};

const ALLOWED_ROLES: MemberRole[] = [
  "admin",
  "director",
  "teacher",
  "staff",
  "janitor",
];

const ALLOWED_STATUSES: AccountStatus[] = [
  "pending",
  "active",
  "suspended",
];

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
    profile.role !== "admin" ||
    profile.account_status !== "active"
  ) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          message: "คุณไม่มีสิทธิ์จัดการสมาชิก",
        },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true as const,
    user,
    adminClient,
  };
}

export async function GET(request: Request) {
  try {
    const authResult = await requireAdmin(request);

    if (!authResult.ok) {
      return authResult.response;
    }

    const { data, error } = await authResult.adminClient
      .from("profiles")
      .select(
        `
          id,
          full_name,
          phone,
          position,
          role,
          account_status,
          created_at,
          updated_at
        `
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Load members error:", error);

      return NextResponse.json(
        {
          ok: false,
          message: "ไม่สามารถโหลดรายชื่อสมาชิกได้",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      members: data ?? [],
    });
  } catch (error) {
    console.error("Members GET API error:", error);

    return NextResponse.json(
      {
        ok: false,
        message: "เกิดข้อผิดพลาดระหว่างโหลดข้อมูลสมาชิก",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const authResult = await requireAdmin(request);

    if (!authResult.ok) {
      return authResult.response;
    }

    const body = (await request.json()) as UpdateMemberBody;

    const id = typeof body.id === "string" ? body.id.trim() : "";

    const role =
      typeof body.role === "string"
        ? (body.role.trim() as MemberRole)
        : "";

    const accountStatus =
      typeof body.accountStatus === "string"
        ? (body.accountStatus.trim() as AccountStatus)
        : "";

    const position =
      typeof body.position === "string"
        ? body.position.trim()
        : "";

    if (!id) {
      return NextResponse.json(
        {
          ok: false,
          message: "ไม่พบรหัสสมาชิก",
        },
        { status: 400 }
      );
    }

    if (!ALLOWED_ROLES.includes(role as MemberRole)) {
      return NextResponse.json(
        {
          ok: false,
          message: "บทบาทสมาชิกไม่ถูกต้อง",
        },
        { status: 400 }
      );
    }

    if (!ALLOWED_STATUSES.includes(accountStatus as AccountStatus)) {
      return NextResponse.json(
        {
          ok: false,
          message: "สถานะสมาชิกไม่ถูกต้อง",
        },
        { status: 400 }
      );
    }

    if (position.length > 150) {
      return NextResponse.json(
        {
          ok: false,
          message: "ชื่อตำแหน่งยาวเกินไป",
        },
        { status: 400 }
      );
    }

    if (id === authResult.user.id) {
      if (role !== "admin" || accountStatus !== "active") {
        return NextResponse.json(
          {
            ok: false,
            message:
              "ไม่สามารถลดสิทธิ์หรือระงับบัญชีผู้ดูแลที่กำลังใช้งานอยู่",
          },
          { status: 400 }
        );
      }
    }

    const { data, error } = await authResult.adminClient
      .from("profiles")
      .update({
        role,
        account_status: accountStatus,
        position: position || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(
        `
          id,
          full_name,
          phone,
          position,
          role,
          account_status,
          created_at,
          updated_at
        `
      )
      .single();

    if (error) {
      console.error("Update member error:", error);

      return NextResponse.json(
        {
          ok: false,
          message: "ไม่สามารถบันทึกข้อมูลสมาชิกได้",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      member: data,
      message: "บันทึกข้อมูลสมาชิกเรียบร้อยแล้ว",
    });
  } catch (error) {
    console.error("Members PATCH API error:", error);

    return NextResponse.json(
      {
        ok: false,
        message: "เกิดข้อผิดพลาดระหว่างบันทึกข้อมูลสมาชิก",
      },
      { status: 500 }
    );
  }
}