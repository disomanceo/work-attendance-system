import { NextResponse } from "next/server";
import { authorizeOfficialDuty } from "@/lib/official-duty-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await authorizeOfficialDuty(request);
    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, message: auth.message },
        { status: auth.status }
      );
    }

    if (!["director", "admin"].includes(auth.profile.role)) {
      return NextResponse.json(
        { ok: false, message: "ไม่มีสิทธิ์พิจารณาคำขอ" },
        { status: 403 }
      );
    }

    const { data, error } = await auth.admin
      .from("official_duty_requests")
      .select(
        `
        *,
        profiles!official_duty_requests_user_id_fkey (
          full_name,
          position,
          role,
          profile_image_file_id
        )
      `
      )
      .order("created_at", { ascending: false });

    if (error) throw new Error("โหลดคำขอไปราชการไม่สำเร็จ");

    return NextResponse.json({
      ok: true,
      requests: data ?? [],
      pendingCount: (data ?? []).filter((item) => item.status === "pending").length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "เกิดข้อผิดพลาด",
      },
      { status: 500 }
    );
  }
}
