import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBangkokDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getBangkokHourMinute() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { ok: false, message: "Unauthorized" },
      { status: 401 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { ok: false, message: "Missing Supabase server configuration" },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const currentTime = getBangkokHourMinute();
  const today = getBangkokDate();

  const targetRoles =
    currentTime >= "18:00"
      ? ["janitor"]
      : currentTime >= "16:30"
        ? ["admin", "director", "teacher", "staff"]
        : [];

  if (targetRoles.length === 0) {
    return NextResponse.json({
      ok: true,
      updated: 0,
      message: "ยังไม่ถึงเวลาออกอัตโนมัติ",
    });
  }

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, role")
    .in("role", targetRoles)
    .eq("account_status", "active");

  if (profileError) {
    return NextResponse.json(
      { ok: false, message: profileError.message },
      { status: 500 }
    );
  }

  const userIds = (profiles ?? []).map((profile) => profile.id);

  if (userIds.length === 0) {
    return NextResponse.json({ ok: true, updated: 0 });
  }

  const checkoutAt = new Date().toISOString();

  const { data, error } = await supabase
    .from("attendance_records")
    .update({
      check_out_at: checkoutAt,
      check_out_status: "auto",
      updated_at: checkoutAt,
    })
    .eq("work_date", today)
    .in("user_id", userIds)
    .not("check_in_at", "is", null)
    .is("check_out_at", null)
    .select("id");

  if (error) {
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    updated: data?.length ?? 0,
    roles: targetRoles,
    bangkokTime: currentTime,
  });
}
