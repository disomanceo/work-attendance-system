import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type DayType = "PUBLIC_HOLIDAY" | "SCHOOL_HOLIDAY" | "SPECIAL_WORKDAY";
type CalendarDay = { work_date: string; day_type: DayType; title?: string; report_text?: string; note?: string };
const ALLOWED = new Set<DayType>(["PUBLIC_HOLIDAY", "SCHOOL_HOLIDAY", "SPECIAL_WORKDAY"]);

function config() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return supabaseUrl && publishableKey && serviceRoleKey ? { supabaseUrl, publishableKey, serviceRoleKey } : null;
}
function tokenOf(request: Request) {
  const value = request.headers.get("authorization");
  return value?.startsWith("Bearer ") ? value.slice(7).trim() : "";
}
async function requireDirector(request: Request) {
  const c = config();
  if (!c) return { ok: false as const, response: NextResponse.json({ ok: false, message: "ระบบยังไม่ได้ตั้งค่า Supabase ฝั่ง Server" }, { status: 500 }) };
  const token = tokenOf(request);
  if (!token) return { ok: false as const, response: NextResponse.json({ ok: false, message: "กรุณาเข้าสู่ระบบใหม่" }, { status: 401 }) };
  const auth = createClient(c.supabaseUrl, c.publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: { user } } = await auth.auth.getUser(token);
  if (!user) return { ok: false as const, response: NextResponse.json({ ok: false, message: "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่" }, { status: 401 }) };
  const admin = createClient(c.supabaseUrl, c.serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: profile } = await admin.from("profiles").select("role, account_status").eq("id", user.id).single();
  if (!profile || !["director", "admin"].includes(profile.role) || profile.account_status !== "active") {
    return { ok: false as const, response: NextResponse.json({ ok: false, message: "เฉพาะผู้อำนวยการหรือผู้ดูแลระบบเท่านั้น" }, { status: 403 }) };
  }
  return { ok: true as const, admin, userId: user.id };
}
function range(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [y, m] = month.split("-").map(Number);
  if (m < 1 || m > 12) return null;
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const end = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  return { start, end };
}
export async function GET(request: Request) {
  const auth = await requireDirector(request); if (!auth.ok) return auth.response;
  const month = new URL(request.url).searchParams.get("month") || "";
  const r = range(month); if (!r) return NextResponse.json({ ok: false, message: "เดือนที่ระบุไม่ถูกต้อง" }, { status: 400 });
  const { data, error } = await auth.admin.from("work_calendar_days").select("work_date, day_type, title, report_text, note").gte("work_date", r.start).lt("work_date", r.end).order("work_date");
  if (error) return NextResponse.json({ ok: false, message: "ไม่สามารถโหลดปฏิทินปฏิบัติงานได้" }, { status: 500 });
  return NextResponse.json({ ok: true, days: data ?? [] });
}
export async function PUT(request: Request) {
  const auth = await requireDirector(request); if (!auth.ok) return auth.response;
  let body: { month?: string; days?: CalendarDay[] };
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, message: "ข้อมูลที่ส่งมาไม่ถูกต้อง" }, { status: 400 }); }
  const month = String(body.month || ""); const r = range(month);
  if (!r || !Array.isArray(body.days)) return NextResponse.json({ ok: false, message: "ข้อมูลเดือนหรือรายการวันที่ไม่ถูกต้อง" }, { status: 400 });
  const rows = body.days.map((item) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.work_date) || !item.work_date.startsWith(`${month}-`) || !ALLOWED.has(item.day_type)) throw new Error("ข้อมูลวันที่ไม่ถูกต้อง");
    const title = String(item.title || "").trim().slice(0, 160);
    if (item.day_type !== "SPECIAL_WORKDAY" && !title) throw new Error("กรุณาระบุชื่อวันหยุด");
    return { work_date: item.work_date, day_type: item.day_type, title, report_text: String(item.report_text || "").trim().slice(0, 240), note: String(item.note || "").trim().slice(0, 400), created_by: auth.userId, updated_by: auth.userId, updated_at: new Date().toISOString() };
  });
  const { error: deleteError } = await auth.admin.from("work_calendar_days").delete().gte("work_date", r.start).lt("work_date", r.end);
  if (deleteError) return NextResponse.json({ ok: false, message: "ไม่สามารถเตรียมบันทึกปฏิทินได้" }, { status: 500 });
  if (rows.length) {
    const { error } = await auth.admin.from("work_calendar_days").insert(rows);
    if (error) return NextResponse.json({ ok: false, message: "ไม่สามารถบันทึกปฏิทินปฏิบัติงานได้" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, message: "บันทึกตั้งค่าปฏิทินปฏิบัติงานเรียบร้อยแล้ว" });
}
