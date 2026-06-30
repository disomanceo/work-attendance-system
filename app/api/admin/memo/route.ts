import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { notifyMemoReviewed } from "@/lib/line/memo-notifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ReviewAction = "approve" | "acknowledge" | "reject" | "send_back";
type MemoStatus =
  | "draft"
  | "pending"
  | "revision"
  | "approved"
  | "acknowledged"
  | "rejected"
  | "cancelled";

type Profile = {
  id: string;
  full_name: string;
  position: string | null;
  role: string;
  account_status: string;
};

function getConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  return url && publishable && service
    ? { url, publishable, service }
    : null;
}

async function authorize(request: Request) {
  const cfg = getConfig();

  if (!cfg) {
    return {
      ok: false as const,
      status: 500,
      message: "ระบบยังไม่ได้ตั้งค่า Supabase ฝั่ง Server",
    };
  }

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (!token) {
    return {
      ok: false as const,
      status: 401,
      message: "กรุณาเข้าสู่ระบบใหม่",
    };
  }

  const auth = createClient(cfg.url, cfg.publishable, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error: authError,
  } = await auth.auth.getUser(token);

  if (authError || !user) {
    return {
      ok: false as const,
      status: 401,
      message: "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่",
    };
  }

  const admin = createClient(cfg.url, cfg.service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, full_name, position, role, account_status")
    .eq("id", user.id)
    .maybeSingle();

  if (
    profileError ||
    !profile ||
    profile.account_status !== "active" ||
    !["admin", "director"].includes(profile.role)
  ) {
    return {
      ok: false as const,
      status: 403,
      message: "คุณไม่มีสิทธิ์พิจารณาบันทึกข้อความ",
    };
  }

  return {
    ok: true as const,
    admin,
    profile: profile as Profile,
  };
}

function nextStatus(action: ReviewAction): MemoStatus {
  if (action === "approve") return "approved";
  if (action === "acknowledge") return "acknowledged";
  if (action === "reject") return "rejected";
  return "revision";
}

async function logMemoStatus(
  admin: SupabaseClient,
  input: {
    memoRequestId: string;
    actorId: string;
    fromStatus: MemoStatus | null;
    toStatus: MemoStatus;
    note?: string | null;
  }
) {
  await admin
    .from("memo_request_logs")
    .insert({
      memo_request_id: input.memoRequestId,
      actor_id: input.actorId,
      from_status: input.fromStatus,
      to_status: input.toStatus,
      note: input.note ?? null,
    })
    .throwOnError();
}

export async function GET(request: Request) {
  try {
    const auth = await authorize(request);

    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, message: auth.message },
        { status: auth.status }
      );
    }

    const status =
      new URL(request.url).searchParams.get("status")?.trim() ?? "pending";

    let query = auth.admin
      .from("memo_requests")
      .select("*")
      .neq("status", "draft")
      .order("created_at", { ascending: false });

    if (status !== "all") {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      ok: true,
      requests: data ?? [],
      pendingCount:
        (data ?? []).filter((item) => item.status === "pending").length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "โหลดรายการบันทึกข้อความไม่สำเร็จ",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await authorize(request);

    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, message: auth.message },
        { status: auth.status }
      );
    }

    const body = (await request.json()) as {
      requestId?: string;
      action?: ReviewAction;
      note?: string;
    };
    const action = body.action;

    if (
      !body.requestId ||
      !action ||
      !["approve", "acknowledge", "reject", "send_back"].includes(action)
    ) {
      return NextResponse.json(
        { ok: false, message: "ข้อมูลการพิจารณาไม่ครบ" },
        { status: 400 }
      );
    }

    const { data: memo, error: memoError } = await auth.admin
      .from("memo_requests")
      .select("id, status")
      .eq("id", body.requestId)
      .maybeSingle();

    if (memoError) {
      throw new Error(memoError.message);
    }

    if (!memo) {
      return NextResponse.json(
        { ok: false, message: "ไม่พบบันทึกข้อความนี้" },
        { status: 404 }
      );
    }

    if (memo.status !== "pending") {
      return NextResponse.json(
        {
          ok: false,
          message: "พิจารณาได้เฉพาะรายการที่รอพิจารณาเท่านั้น",
        },
        { status: 409 }
      );
    }

    const status = nextStatus(action);
    const note = String(body.note ?? "").trim();

    if ((action === "reject" || action === "send_back") && note.length < 3) {
      return NextResponse.json(
        {
          ok: false,
          message: "กรุณาระบุความคิดเห็นอย่างน้อย 3 ตัวอักษร",
        },
        { status: 400 }
      );
    }

    const { data, error } = await auth.admin
      .from("memo_requests")
      .update({
        status,
        reviewed_by: auth.profile.id,
        reviewed_at: new Date().toISOString(),
        review_note: note || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", memo.id)
      .eq("status", "pending")
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(error?.message || "บันทึกผลการพิจารณาไม่สำเร็จ");
    }

    await logMemoStatus(auth.admin, {
      memoRequestId: memo.id,
      actorId: auth.profile.id,
      fromStatus: memo.status as MemoStatus,
      toStatus: status,
      note,
    });

    await notifyMemoReviewed({
      requestId: memo.id,
      fullName: data.full_name,
      subject: data.subject,
      memoNumber: data.memo_number,
      status,
      reviewerName: auth.profile.full_name,
      reviewNote: note || null,
    }).catch((lineError) => {
      console.error("LINE memo reviewed notification error:", lineError);
    });

    return NextResponse.json({
      ok: true,
      request: data,
      message: "บันทึกผลการพิจารณาแล้ว",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "พิจารณาบันทึกข้อความไม่สำเร็จ",
      },
      { status: 500 }
    );
  }
}
