import { NextResponse } from "next/server";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import {
  STUDENT_CLASS_LEVELS,
  STUDENT_WORK_PERMISSION_KEYS,
  type StudentWorkPermissionKey,
} from "@/lib/students/settings";

type ProfileRow = {
  id: string;
  role: string | null;
  account_status: string | null;
  departments?: unknown;
};

type WorkPermissionRow = {
  permission_key: string | null;
  class_levels: string[] | null;
};

type ClassSettingRow = {
  class_level: string | null;
  class_room?: string | null;
  adviser_profile_id: string | null;
  adviser_profile_ids: string[] | null;
};

type DutyRosterRow = {
  weekday: number | null;
  profile_id: string | null;
};

type StudentAuth = {
  ok: true;
  user: User;
  profile: ProfileRow;
  adminClient: SupabaseClient<any>;
};

type StudentAuthFailure = {
  ok: false;
  response: NextResponse;
};

export type StudentAccess = {
  isAdmin: boolean;
  permissions: StudentWorkPermissionKey[];
  adviserClassLevels: string[];
  dutyWeekdays: number[];
};

const ADMIN_ROLES = new Set(["admin", "director", "staff"]);

function config() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !publishableKey || !serviceRoleKey) return null;
  return { supabaseUrl, publishableKey, serviceRoleKey };
}

function tokenOf(request: Request) {
  const value = request.headers.get("authorization");
  return value?.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

function uniqueLevels(levels: string[]) {
  return STUDENT_CLASS_LEVELS.filter((level) => levels.includes(level)) as string[];
}

function weekdayOf(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [year, month, day] = date.split("-").map(Number);
  const jsDay = new Date(year, month - 1, day).getDay();
  return jsDay === 0 ? 7 : jsDay;
}

export function todayBangkok() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function isStudentAdminRole(role: unknown) {
  return ADMIN_ROLES.has(String(role ?? "").trim().toLowerCase());
}

export function forbidden(message = "คุณไม่มีสิทธิ์ใช้งานส่วนนี้") {
  return NextResponse.json({ ok: false, message }, { status: 403 });
}

export async function requireStudentAuth(request: Request): Promise<StudentAuth | StudentAuthFailure> {
  const env = config();

  if (!env) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, message: "ระบบยังไม่ได้ตั้งค่า Supabase ฝั่ง Server" },
        { status: 500 },
      ),
    };
  }

  const token = tokenOf(request);
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, message: "กรุณาเข้าสู่ระบบใหม่" },
        { status: 401 },
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
      ok: false,
      response: NextResponse.json(
        { ok: false, message: "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่" },
        { status: 401 },
      ),
    };
  }

  const adminClient = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("id, role, account_status, departments")
    .eq("id", user.id)
    .single();

  if (profileError || !profile || profile.account_status !== "active") {
    return {
      ok: false,
      response: forbidden("คุณไม่มีสิทธิ์ใช้งานระบบนักเรียน"),
    };
  }

  return { ok: true, user, profile: profile as ProfileRow, adminClient };
}

export async function loadStudentAccess(
  adminClient: SupabaseClient<any>,
  profileId: string,
  role: unknown,
): Promise<StudentAccess> {
  const [{ data: permissions }, { data: classSettings }, { data: dutyRoster }] =
    await Promise.all([
      adminClient
        .from("student_work_permissions")
        .select("permission_key, class_levels")
        .eq("profile_id", profileId),
      adminClient
        .from("student_class_settings")
        .select("class_level, class_room, adviser_profile_id, adviser_profile_ids")
        .eq("is_active", true),
      adminClient
        .from("student_duty_roster")
        .select("weekday, profile_id")
        .eq("profile_id", profileId)
        .eq("is_active", true),
    ]);

  const permissionRows = (permissions ?? []) as WorkPermissionRow[];
  const permissionKeys = permissionRows
    .map((item) => String(item.permission_key || ""))
    .filter((key): key is StudentWorkPermissionKey =>
      Object.values(STUDENT_WORK_PERMISSION_KEYS).includes(key as StudentWorkPermissionKey),
    );

  const adviserClassLevels = ((classSettings ?? []) as ClassSettingRow[])
    .filter((item) => {
      const adviserIds = [
        item.adviser_profile_id,
        ...(Array.isArray(item.adviser_profile_ids) ? item.adviser_profile_ids : []),
      ].filter(Boolean);
      return adviserIds.includes(profileId);
    })
    .map((item) => String(item.class_level || ""))
    .filter(Boolean);

  return {
    isAdmin: isStudentAdminRole(role),
    permissions: Array.from(new Set(permissionKeys)),
    adviserClassLevels: uniqueLevels(Array.from(new Set(adviserClassLevels))),
    dutyWeekdays: Array.from(
      new Set(
        ((dutyRoster ?? []) as DutyRosterRow[])
          .map((item) => Number(item.weekday))
          .filter((weekday) => Number.isInteger(weekday) && weekday >= 1 && weekday <= 7),
      ),
    ),
  };
}

export function hasStudentPermission(
  access: StudentAccess,
  permission: StudentWorkPermissionKey,
) {
  return access.permissions.includes(permission);
}

export function isDutyTeacherOnDate(access: StudentAccess, date: string) {
  const weekday = weekdayOf(date);
  return Boolean(weekday && access.dutyWeekdays.includes(weekday));
}

export function attendanceClassLevelsForDate(access: StudentAccess, date: string) {
  if (
    access.isAdmin ||
    hasStudentPermission(access, STUDENT_WORK_PERMISSION_KEYS.allClassRecorder) ||
    isDutyTeacherOnDate(access, date)
  ) {
    return [...STUDENT_CLASS_LEVELS] as string[];
  }

  return uniqueLevels(access.adviserClassLevels);
}

export function studentDataClassLevels(access: StudentAccess) {
  if (access.isAdmin) return [...STUDENT_CLASS_LEVELS] as string[];
  return uniqueLevels(access.adviserClassLevels);
}

export function canRecordAttendance(access: StudentAccess, classLevel: string, date: string) {
  return attendanceClassLevelsForDate(access, date).includes(classLevel);
}

export function canManageStudentData(access: StudentAccess, classLevel: string) {
  return studentDataClassLevels(access).includes(classLevel);
}

export function canManageStudentSettings(access: StudentAccess) {
  return (
    access.isAdmin ||
    hasStudentPermission(access, STUDENT_WORK_PERMISSION_KEYS.studentSettingsManager)
  );
}

export function canManageClassAdvisers(access: StudentAccess) {
  return (
    access.isAdmin ||
    canManageStudentSettings(access) ||
    hasStudentPermission(access, STUDENT_WORK_PERMISSION_KEYS.classAdviser)
  );
}

export function canManageDutyRoster(access: StudentAccess) {
  return (
    access.isAdmin ||
    canManageStudentSettings(access) ||
    hasStudentPermission(access, STUDENT_WORK_PERMISSION_KEYS.dutyRosterManager)
  );
}

export function accessSummary(access: StudentAccess, date = todayBangkok()) {
  return {
    isAdmin: access.isAdmin,
    canManageStudentSettings: canManageStudentSettings(access),
    canManageClassAdvisers: canManageClassAdvisers(access),
    canManageDutyRoster: canManageDutyRoster(access),
    canManageStudentData: studentDataClassLevels(access).length > 0,
    canRecordAllClasses: attendanceClassLevelsForDate(access, date).length === STUDENT_CLASS_LEVELS.length,
    adviserClassLevels: access.adviserClassLevels,
    attendanceClassLevels: attendanceClassLevelsForDate(access, date),
    studentDataClassLevels: studentDataClassLevels(access),
    dutyWeekdays: access.dutyWeekdays,
  };
}
