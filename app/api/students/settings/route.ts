import { NextResponse } from "next/server";
import {
  accessSummary,
  canManageClassAdvisers,
  canManageDutyRoster,
  canManageStudentSettings,
  forbidden,
  loadStudentAccess,
  requireStudentAuth,
  todayBangkok,
} from "@/lib/students/access";

type StudentSettingsInputRow = {
  class_level?: string;
  class_room?: string | null;
  adviser_profile_id?: string | null;
  adviser_profile_ids?: string[] | null;
  backup_adviser_profile_id?: string | null;
  teacher_profile_id?: string | null;
  profile_id?: string | null;
  permission_key?: string | null;
  class_levels?: string[] | null;
  weekday?: number | string | null;
};

type StudentSettingsBody = {
  type?: string;
  rows?: StudentSettingsInputRow[];
  profile_id?: string | null;
  permissions?: StudentSettingsInputRow[];
};

function requestedDate(request: Request) {
  const value = new URL(request.url).searchParams.get("date") || "";
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : todayBangkok();
}

export async function GET(request: Request) {
  const auth = await requireStudentAuth(request);
  if (!auth.ok) return auth.response;

  try {
    const supabase = auth.adminClient;
    const access = await loadStudentAccess(supabase, auth.user.id, auth.profile);
    const summary = accessSummary(access, requestedDate(request), auth.profile);
    const visibleClassLevels = new Set([
      ...summary.attendanceClassLevels,
      ...summary.studentDataClassLevels,
    ]);

    const [profiles, classSettings, workPermissions, dutyRoster] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, phone, role, position, account_status, profile_image_file_id")
        .eq("account_status", "active")
        .order("full_name", { ascending: true }),
      supabase
        .from("student_class_settings")
        .select("*")
        .eq("is_active", true)
        .order("class_level", { ascending: true }),
      supabase
        .from("student_work_permissions")
        .select("*"),
      supabase
        .from("student_duty_roster")
        .select("*")
        .eq("is_active", true)
        .order("weekday", { ascending: true }),
    ]);

    for (const result of [profiles, classSettings, workPermissions, dutyRoster]) {
      if (result.error) {
        throw result.error;
      }
    }

    return NextResponse.json({
      profiles: profiles.data ?? [],
      classSettings: summary.isAdmin || summary.canManageStudentSettings
        ? classSettings.data ?? []
        : (classSettings.data ?? []).filter((item) => visibleClassLevels.has(String(item.class_level || ""))),
      workPermissions: summary.canManageStudentSettings ? workPermissions.data ?? [] : [],
      dutyRoster: summary.isAdmin || summary.canManageDutyRoster ? dutyRoster.data ?? [] : [],
      access: summary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Load student settings error:", error);
    return NextResponse.json({ error: message, message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireStudentAuth(request);
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as StudentSettingsBody;
    const supabase = auth.adminClient;
    const access = await loadStudentAccess(supabase, auth.user.id, auth.profile);

    if (body.type === "class-settings") {
      if (!canManageClassAdvisers(access)) {
        return forbidden("คุณไม่มีสิทธิ์แต่งตั้งหรือแก้ไขครูประจำชั้น");
      }

      const rows: StudentSettingsInputRow[] = Array.isArray(body.rows) ? body.rows : [];
      const payload = rows.map((row: StudentSettingsInputRow) => ({
        class_level: row.class_level,
        class_room: row.class_room ?? "",
        adviser_profile_id: row.adviser_profile_id || null,
        adviser_profile_ids: Array.isArray(row.adviser_profile_ids)
          ? row.adviser_profile_ids.filter(Boolean)
          : [],
        is_active: true,
        updated_at: new Date().toISOString(),
      }));

      const result = await supabase
        .from("student_class_settings")
        .upsert(payload, { onConflict: "class_level,class_room" })
        .select();

      if (result.error) {
        throw result.error;
      }

      return NextResponse.json({ ok: true, data: result.data ?? [] });
    }

    if (body.type === "work-permissions") {
      if (!canManageStudentSettings(access)) {
        return forbidden("คุณไม่มีสิทธิ์จัดการสิทธิ์งานนักเรียน");
      }

      const profileId = body.profile_id;
      const permissions: StudentSettingsInputRow[] = Array.isArray(body.permissions) ? body.permissions : [];

      if (!profileId) {
        return NextResponse.json({ error: "profile_id is required" }, { status: 400 });
      }

      const deleteResult = await supabase
        .from("student_work_permissions")
        .delete()
        .eq("profile_id", profileId);

      if (deleteResult.error) {
        throw deleteResult.error;
      }

      const payload = permissions
        .filter((item: StudentSettingsInputRow) => item.permission_key)
        .map((item: StudentSettingsInputRow) => ({
          profile_id: profileId,
          permission_key: item.permission_key,
          class_levels: Array.isArray(item.class_levels) ? item.class_levels : [],
          updated_at: new Date().toISOString(),
        }));

      if (payload.length > 0) {
        const insertResult = await supabase
          .from("student_work_permissions")
          .insert(payload)
          .select();

        if (insertResult.error) {
          throw insertResult.error;
        }
      }

      return NextResponse.json({ ok: true });
    }

    if (body.type === "duty-roster") {
      if (!canManageDutyRoster(access)) {
        return forbidden("คุณไม่มีสิทธิ์จัดการครูเวรประจำวัน");
      }

      const rows: StudentSettingsInputRow[] = Array.isArray(body.rows) ? body.rows : [];

      const clearResult = await supabase
        .from("student_duty_roster")
        .delete()
        .gte("weekday", 1)
        .lte("weekday", 7);

      if (clearResult.error) {
        throw clearResult.error;
      }

      const payload = rows
        .filter((row: StudentSettingsInputRow) => row.weekday && row.profile_id)
        .map((row: StudentSettingsInputRow) => ({
          weekday: Number(row.weekday),
          profile_id: row.profile_id,
          is_active: true,
          updated_at: new Date().toISOString(),
        }));

      if (payload.length > 0) {
        const insertResult = await supabase
          .from("student_duty_roster")
          .insert(payload)
          .select();

        if (insertResult.error) {
          throw insertResult.error;
        }
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unsupported request type" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Save student settings error:", error);
    return NextResponse.json({ error: message, message }, { status: 500 });
  }
}
