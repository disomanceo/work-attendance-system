import { NextResponse } from "next/server";
import { adminClient } from "../_shared";
export async function POST(request: Request) {
  const secret = request.headers.get("x-import-secret")?.trim();
  if (!process.env.SMART_AREA_IMPORT_SECRET || secret !== process.env.SMART_AREA_IMPORT_SECRET) return NextResponse.json({ ok:false }, { status:401 });
  const body = await request.json();
  const admin = adminClient();
  const values = { github_run_id:String(body.githubRunId || ""), status:String(body.status || "running"), scanned:Number(body.scanned || 0), added:Number(body.added || 0), updated:Number(body.updated || 0), duplicate:Number(body.duplicate || 0), failed:Number(body.failed || 0), errors:Array.isArray(body.errors) ? body.errors : [], finished_at:["success","partial","failed","skipped"].includes(body.status) ? new Date().toISOString() : null };
  const { data: latest } = await admin.from("smart_area_import_runs").select("id").in("status", ["queued","running"]).order("created_at", { ascending:false }).limit(1).maybeSingle();
  if (latest?.id) await admin.from("smart_area_import_runs").update(values).eq("id", latest.id); else await admin.from("smart_area_import_runs").insert(values);
  return NextResponse.json({ ok:true });
}
