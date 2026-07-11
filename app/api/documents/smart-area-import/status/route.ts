import { NextResponse } from "next/server";
import { adminClient, requireUser } from "../_shared";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ ok:false, message:"Unauthorized" }, { status:401 });
  const { data, error } = await adminClient().from("smart_area_import_runs").select("*").order("created_at", { ascending:false }).limit(1).maybeSingle();
  if (error) return NextResponse.json({ ok:false, message:error.message }, { status:500 });
  return NextResponse.json({ ok:true, run:data || null });
}
