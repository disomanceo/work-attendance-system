import { NextResponse } from "next/server";
import { authorizeAnnouncementRequest } from "@/lib/announcement-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await authorizeAnnouncementRequest(request);

    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, message: auth.message },
        { status: auth.status },
      );
    }

    const [profilesResult, classSettingsResult] = await Promise.all([
      auth.admin
        .from("profiles")
        .select("id, full_name, position, role, account_status, profile_image_file_id")
        .eq("account_status", "active")
        .not("full_name", "is", null)
        .order("full_name", { ascending: true }),
      auth.admin
        .from("student_class_settings")
        .select("class_level, class_room, adviser_profile_id, adviser_profile_ids")
        .eq("is_active", true)
        .order("class_level", { ascending: true }),
    ]);

    if (profilesResult.error) throw new Error(profilesResult.error.message);
    if (classSettingsResult.error) throw new Error(classSettingsResult.error.message);

    const classLevelsByProfile = new Map<string, string[]>();
    for (const setting of classSettingsResult.data ?? []) {
      const classLevel = String(setting.class_level || "").trim();
      if (!classLevel) continue;

      const adviserIds = [
        setting.adviser_profile_id,
        ...(Array.isArray(setting.adviser_profile_ids)
          ? setting.adviser_profile_ids
          : []),
      ]
        .filter(Boolean)
        .map(String);

      for (const adviserId of adviserIds) {
        const current = classLevelsByProfile.get(adviserId) ?? [];
        if (!current.includes(classLevel)) current.push(classLevel);
        classLevelsByProfile.set(adviserId, current);
      }
    }

    const profiles = (profilesResult.data ?? []).map((profile) => ({
      ...profile,
      homeroomClassLevels: classLevelsByProfile.get(profile.id) ?? [],
    }));

    return NextResponse.json({
      ok: true,
      profiles,
      currentProfile: auth.profile,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "โหลดรายชื่อครูและบุคลากรไม่สำเร็จ",
      },
      { status: 500 },
    );
  }
}
