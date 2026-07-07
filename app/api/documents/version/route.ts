import { NextResponse } from "next/server";
import { requireSmartAreaUser } from "@/lib/smart-area/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSmartAreaUser(request);

  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, message: auth.message },
      { status: auth.status },
    );
  }

  const { data, error } = await auth.admin
    .from("smart_area_sync_state")
    .select("version, last_change_at")
    .eq("id", "documents")
    .maybeSingle();

  if (error) {
    console.error("Load Smart Area version error:", error);
    return NextResponse.json(
      { ok: false, message: "ไม่สามารถตรวจสอบเวอร์ชันข้อมูลได้" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    version: Number(data?.version || 0),
    lastChangeAt: data?.last_change_at || null,
  });
}
