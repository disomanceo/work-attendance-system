import { NextResponse } from "next/server";
import { authorizeAnnouncementRequest } from "@/lib/announcement-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await authorizeAnnouncementRequest(request);

    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, message: auth.message },
        { status: auth.status }
      );
    }

    const { data, error } = await auth.admin
      .from("profiles")
      .select("id, full_name, position, role")
      .eq("account_status", "active")
      .order("full_name");

    if (error) throw new Error(error.message);

    return NextResponse.json({
      ok: true,
      profiles: data ?? [],
      currentProfile: auth.profile,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "โหลดรายชื่อบุคลากรไม่สำเร็จ",
      },
      { status: 500 }
    );
  }
}
