import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type MemberRole = "admin" | "director" | "teacher" | "staff" | "janitor";
type AccountStatus = "pending" | "active" | "suspended";
type WorkPermission =
  | "budget.procurement"
  | "budget.finance"
  | "smart_area.clerk";
type Department =
  | "academic_administration"
  | "budget_administration"
  | "personnel_administration"
  | "general_administration";

type UpdateMemberBody = {
  id?: unknown;
  role?: unknown;
  accountStatus?: unknown;
  position?: unknown;
  alternateWorkplace?: unknown;
  countAsPresentWhenNoCheckin?: unknown;
  workPermissions?: unknown;
  departments?: unknown;
};

type DeleteMemberBody = { id?: unknown };

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

const ALLOWED_WORK_PERMISSIONS: WorkPermission[] = [
  "budget.procurement",
  "budget.finance",
  "smart_area.clerk",
];

const ALLOWED_DEPARTMENTS: Department[] = [
  "academic_administration",
  "budget_administration",
  "personnel_administration",
  "general_administration",
];

const MEMBER_SELECT = `
  id,
  full_name,
  phone,
  position,
  role,
  account_status,
  alternate_workplace,
  count_as_present_when_no_checkin,
  work_permissions,
  departments,
  profile_image_file_id,
  signature_file_id,
  created_at,
  updated_at
`;

function config() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !publishableKey || !serviceRoleKey) return null;
  return { supabaseUrl, publishableKey, serviceRoleKey };
}

function accessToken(request: Request) {
  const value = request.headers.get("authorization");
  return value?.startsWith("Bearer ")
    ? value.slice("Bearer ".length).trim()
    : "";
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function errorText(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error.trim();

  if (error && typeof error === "object") {
    const data = error as Record<string, unknown>;
    for (const key of ["message", "details", "hint", "code"]) {
      const value = data[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }

  return fallback;
}

function schemaMessage(error: unknown) {
  const text = errorText(error, "").toLowerCase();
  if (
    text.includes("work_permissions") ||
    text.includes("departments") ||
    text.includes("column")
  ) {
    return "โครงสร้างฐานข้อมูลสมาชิกยังไม่ครบ กรุณารัน SQL migration สำหรับ work_permissions และ departments ใน Supabase ก่อน";
  }
  return "";
}

async function requireManager(request: Request) {
  const env = config();

  if (!env) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, message: "ยังไม่ได้ตั้งค่า Supabase ฝั่ง Server" },
        { status: 500 }
      ),
    };
  }

  const token = accessToken(request);

  if (!token) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, message: "กรุณาเข้าสู่ระบบใหม่" },
        { status: 401 }
      ),
    };
  }

  const authClient = createClient(env.supabaseUrl, env.publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(token);

  if (userError || !user) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, message: "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่" },
        { status: 401 }
      ),
    };
  }

  const adminClient = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("id, role, account_status")
    .eq("id", user.id)
    .single();

  if (
    profileError ||
    !profile ||
    !["admin", "director"].includes(profile.role) ||
    profile.account_status !== "active"
  ) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, message: "คุณไม่มีสิทธิ์จัดการสมาชิก" },
        { status: 403 }
      ),
    };
  }

  return { ok: true as const, user, adminClient };
}

export async function GET(request: Request) {
  try {
    const auth = await requireManager(request);
    if (!auth.ok) return auth.response;

    const { data, error } = await auth.adminClient
      .from("profiles")
      .select(MEMBER_SELECT)
      .not("phone", "like", "deleted:%")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Load members error:", error);
      return NextResponse.json(
        {
          ok: false,
          message:
            schemaMessage(error) ||
            "ไม่สามารถโหลดรายชื่อสมาชิกได้: " +
              errorText(error, "ไม่ทราบสาเหตุ"),
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, members: data ?? [] });
  } catch (error) {
    console.error("Members GET API error:", error);
    return NextResponse.json(
      { ok: false, message: "เกิดข้อผิดพลาดระหว่างโหลดข้อมูลสมาชิก" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireManager(request);
    if (!auth.ok) return auth.response;

    const body = (await request.json()) as UpdateMemberBody;
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const role =
      typeof body.role === "string"
        ? (body.role.trim() as MemberRole)
        : ("" as MemberRole);
    const accountStatus =
      typeof body.accountStatus === "string"
        ? (body.accountStatus.trim() as AccountStatus)
        : ("" as AccountStatus);
    const position =
      typeof body.position === "string" ? body.position.trim() : "";
    const alternateWorkplace =
      typeof body.alternateWorkplace === "string"
        ? body.alternateWorkplace.trim()
        : "";
    const countAsPresentWhenNoCheckin =
      body.countAsPresentWhenNoCheckin === true;
    const workPermissions = stringArray(body.workPermissions);
    const departments = stringArray(body.departments);

    if (!id) {
      return NextResponse.json(
        { ok: false, message: "ไม่พบรหัสสมาชิก" },
        { status: 400 }
      );
    }

    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json(
        { ok: false, message: "บทบาทสมาชิกไม่ถูกต้อง" },
        { status: 400 }
      );
    }

    if (!ALLOWED_STATUSES.includes(accountStatus)) {
      return NextResponse.json(
        { ok: false, message: "สถานะสมาชิกไม่ถูกต้อง" },
        { status: 400 }
      );
    }

    if (
      workPermissions.some(
        (item) => !ALLOWED_WORK_PERMISSIONS.includes(item as WorkPermission)
      )
    ) {
      return NextResponse.json(
        { ok: false, message: "สิทธิ์งานของสมาชิกไม่ถูกต้อง" },
        { status: 400 }
      );
    }

    if (
      departments.some(
        (item) => !ALLOWED_DEPARTMENTS.includes(item as Department)
      )
    ) {
      return NextResponse.json(
        { ok: false, message: "ฝ่ายสังกัดของสมาชิกไม่ถูกต้อง" },
        { status: 400 }
      );
    }

    if (position.length > 150) {
      return NextResponse.json(
        { ok: false, message: "ชื่อตำแหน่งยาวเกินไป" },
        { status: 400 }
      );
    }

    if (alternateWorkplace.length > 200) {
      return NextResponse.json(
        { ok: false, message: "ชื่อสถานที่ปฏิบัติงานยาวเกินไป" },
        { status: 400 }
      );
    }

    if (countAsPresentWhenNoCheckin && !alternateWorkplace) {
      return NextResponse.json(
        { ok: false, message: "กรุณาระบุสถานที่ปฏิบัติงานเพิ่มเติม" },
        { status: 400 }
      );
    }

    if (
      id === auth.user.id &&
      (role !== "admin" || accountStatus !== "active")
    ) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "ไม่สามารถลดสิทธิ์หรือระงับบัญชีผู้ดูแลที่กำลังใช้งานอยู่",
        },
        { status: 400 }
      );
    }

    const { data, error } = await auth.adminClient
      .from("profiles")
      .update({
        role,
        account_status: accountStatus,
        position: position || null,
        alternate_workplace: countAsPresentWhenNoCheckin
          ? alternateWorkplace
          : null,
        count_as_present_when_no_checkin: countAsPresentWhenNoCheckin,
        work_permissions: workPermissions,
        departments,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(MEMBER_SELECT)
      .single();

    if (error) {
      console.error("Update member error:", error);
      return NextResponse.json(
        {
          ok: false,
          message:
            schemaMessage(error) ||
            "บันทึกข้อมูลสมาชิกไม่สำเร็จ: " +
              errorText(error, "ไม่ทราบสาเหตุ"),
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
      { ok: false, message: "เกิดข้อผิดพลาดระหว่างบันทึกข้อมูลสมาชิก" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireManager(request);
    if (!auth.ok) return auth.response;

    const body = (await request.json()) as DeleteMemberBody;
    const id = typeof body.id === "string" ? body.id.trim() : "";

    if (!id) {
      return NextResponse.json(
        { ok: false, message: "ไม่พบรหัสสมาชิกที่ต้องการลบ" },
        { status: 400 }
      );
    }

    if (id === auth.user.id) {
      return NextResponse.json(
        { ok: false, message: "ไม่สามารถลบบัญชีที่กำลังใช้งานอยู่" },
        { status: 400 }
      );
    }

    const { data: member, error: findError } = await auth.adminClient
      .from("profiles")
      .select("id, full_name, phone")
      .eq("id", id)
      .maybeSingle();

    if (findError) {
      return NextResponse.json(
        { ok: false, message: "ตรวจสอบสมาชิกก่อนลบไม่สำเร็จ" },
        { status: 500 }
      );
    }

    if (!member) {
      return NextResponse.json(
        { ok: false, message: "ไม่พบสมาชิกที่ต้องการลบ" },
        { status: 404 }
      );
    }

    const { error: deleteAuthError } =
      await auth.adminClient.auth.admin.deleteUser(id, true);

    if (deleteAuthError) {
      console.error("Delete auth user warning:", deleteAuthError);
    }

    const { error: archiveError } = await auth.adminClient
      .from("profiles")
      .update({
        account_status: "suspended",
        phone: member.phone?.startsWith("deleted:")
          ? member.phone
          : `deleted:${id}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (archiveError) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "ปิดบัญชีเข้าสู่ระบบแล้ว แต่ซ่อนข้อมูลสมาชิกไม่สำเร็จ: " +
            errorText(archiveError, "ไม่ทราบสาเหตุ"),
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      deletedId: id,
      message: `ลบสมาชิก ${member.full_name || ""} เรียบร้อยแล้ว`,
    });
  } catch (error) {
    console.error("Members DELETE API error:", error);
    return NextResponse.json(
      { ok: false, message: "เกิดข้อผิดพลาดระหว่างลบสมาชิก" },
      { status: 500 }
    );
  }
}
