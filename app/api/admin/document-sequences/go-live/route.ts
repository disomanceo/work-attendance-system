import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const GO_LIVE_CONFIRMATION = "เริ่มใช้งานจริง";

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && publishable && service ? { url, publishable, service } : null;
}

async function authorize(request: Request) {
  const cfg = config();
  if (!cfg) {
    return { ok: false as const, status: 500, message: "ตั้งค่า Supabase ไม่ครบ" };
  }

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const auth = createClient(cfg.url, cfg.publishable, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
  } = await auth.auth.getUser(token);

  if (!user) {
    return { ok: false as const, status: 401, message: "กรุณาเข้าสู่ระบบ" };
  }

  const admin = createClient(cfg.url, cfg.service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: profile } = await admin
    .from("profiles")
    .select("id, role, account_status")
    .eq("id", user.id)
    .maybeSingle();

  if (
    !profile ||
    profile.account_status !== "active" ||
    !["director", "admin"].includes(String(profile.role))
  ) {
    return {
      ok: false as const,
      status: 403,
      message: "ไม่มีสิทธิ์เริ่มใช้งานจริง",
    };
  }

  return { ok: true as const, admin, profile };
}

export async function POST(request: Request) {
  try {
    const auth = await authorize(request);
    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, message: auth.message },
        { status: auth.status }
      );
    }

    const body = await request.json();
    const seriesId = String(body.seriesId ?? "");
    const prefix = String(body.prefix ?? "").trim();
    const buddhistYear = Number(body.buddhistYear);
    const startNumber = Number(body.startNumber ?? 1);
    const reason = String(body.reason ?? "").trim();
    const confirmation = String(body.confirmation ?? "").trim();

    if (confirmation !== GO_LIVE_CONFIRMATION) {
      return NextResponse.json(
        {
          ok: false,
          message: `กรุณาพิมพ์คำว่า "${GO_LIVE_CONFIRMATION}" ให้ตรง`,
        },
        { status: 400 }
      );
    }

    if (reason.length < 5) {
      return NextResponse.json(
        { ok: false, message: "กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร" },
        { status: 400 }
      );
    }

    if (
      !Number.isInteger(buddhistYear) ||
      buddhistYear < 2500 ||
      buddhistYear > 2700
    ) {
      return NextResponse.json(
        { ok: false, message: "ปี พ.ศ. ไม่ถูกต้อง" },
        { status: 400 }
      );
    }

    if (!Number.isInteger(startNumber) || startNumber < 1) {
      return NextResponse.json(
        { ok: false, message: "เลขเริ่มต้นไม่ถูกต้อง" },
        { status: 400 }
      );
    }

    const { data: oldSeries, error: oldError } = await auth.admin
      .from("document_number_series")
      .select("*")
      .eq("id", seriesId)
      .eq("is_active", true)
      .eq("mode", "TEST")
      .single();

    if (oldError || !oldSeries) {
      return NextResponse.json(
        { ok: false, message: "ไม่พบชุดเลขทดสอบที่เปิดใช้งาน" },
        { status: 404 }
      );
    }

    const { data: oldIssues, error: issuesError } = await auth.admin
      .from("document_number_issues")
      .select("*")
      .eq("series_id", seriesId)
      .order("running_number");

    if (issuesError) throw new Error(issuesError.message);

    const beforeSnapshot = {
      series: oldSeries,
      issueCount: oldIssues?.length ?? 0,
    };

    const { error: backupError } = await auth.admin
      .from("document_number_backups")
      .insert({
        series_id: oldSeries.id,
        backup_reason: reason,
        series_snapshot: oldSeries,
        issues_snapshot: oldIssues ?? [],
        backed_up_by: auth.profile.id,
      });

    if (backupError) {
      throw new Error(`สำรองข้อมูลไม่สำเร็จ: ${backupError.message}`);
    }

    const { error: archiveError } = await auth.admin
      .from("document_number_series")
      .update({
        mode: "ARCHIVED",
        is_active: false,
        archived_at: new Date().toISOString(),
        updated_by: auth.profile.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", oldSeries.id);

    if (archiveError) throw new Error(archiveError.message);

    await auth.admin
      .from("document_number_issues")
      .update({ issue_status: "TEST_ARCHIVED" })
      .eq("series_id", oldSeries.id);

    const { data: newSeries, error: createError } = await auth.admin
      .from("document_number_series")
      .insert({
        code: oldSeries.code,
        name: oldSeries.name,
        prefix,
        buddhist_year: buddhistYear,
        start_number: startNumber,
        current_number: startNumber - 1,
        padding: oldSeries.padding,
        mode: "LIVE",
        is_active: true,
        created_by: auth.profile.id,
        updated_by: auth.profile.id,
      })
      .select("*")
      .single();

    if (createError || !newSeries) {
      await auth.admin
        .from("document_number_series")
        .update({ mode: "TEST", is_active: true, archived_at: null })
        .eq("id", oldSeries.id);

      throw new Error(
        createError?.message || "สร้างชุดเลขใช้งานจริงไม่สำเร็จ"
      );
    }

    const afterSnapshot = { series: newSeries };

    const { error: logError } = await auth.admin
      .from("document_number_reset_logs")
      .insert({
        old_series_id: oldSeries.id,
        new_series_id: newSeries.id,
        action: "GO_LIVE",
        reason,
        confirmation_text: confirmation,
        performed_by: auth.profile.id,
        before_snapshot: beforeSnapshot,
        after_snapshot: afterSnapshot,
      });

    if (logError) console.error("document_number_reset_logs:", logError);

    return NextResponse.json({
      ok: true,
      series: newSeries,
      archivedIssueCount: oldIssues?.length ?? 0,
      message: `สำรองข้อมูลทดสอบและเริ่มใช้งานจริงจากเลข ${startNumber} แล้ว`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "เริ่มใช้งานจริงไม่สำเร็จ",
      },
      { status: 500 }
    );
  }
}
