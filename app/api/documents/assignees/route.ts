import { NextResponse } from "next/server";
import { requireSmartAreaUser } from "@/lib/smart-area/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSmartAreaUser(request);

  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, assignees: [], message: auth.message },
      { status: auth.status },
    );
  }

  const allowed = auth.canManageAll;

  if (!allowed) {
    return NextResponse.json(
      { ok: false, assignees: [], message: "คุณไม่มีสิทธิ์ดูรายชื่อผู้รับมอบหมาย" },
      { status: 403 },
    );
  }

  const { data, error } = await auth.admin
    .from("profiles")
    .select("id, full_name, position, role")
    .eq("account_status", "active")
    .not("phone", "like", "deleted:%")
    .order("full_name", { ascending: true });

  if (error) {
    console.error("Load Smart Area assignees error:", error);
    return NextResponse.json(
      { ok: false, assignees: [], message: "ไม่สามารถโหลดรายชื่อบุคลากรได้" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    assignees: (data ?? []).map((profile) => ({
      id: profile.id,
      fullName: profile.full_name,
      position: profile.position || "",
      role: profile.role,
    })),
  });
}
