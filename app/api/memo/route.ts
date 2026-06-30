import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  issueDocumentNumber,
  markDocumentNumberIssue,
} from "@/lib/document-numbers";
import { notifyMemoSubmitted } from "@/lib/line/memo-notifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type MemoAction = "draft" | "submit";
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

type ExistingMemo = {
  id: string;
  status: MemoStatus;
  document_number_issue_id: string | null;
  memo_number: string | null;
  sequence_number: number | null;
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
    profile.account_status !== "active"
  ) {
    return {
      ok: false as const,
      status: 403,
      message: "บัญชียังไม่พร้อมใช้งาน",
    };
  }

  return {
    ok: true as const,
    admin,
    profile: profile as Profile,
  };
}

function validateMemoInput(input: {
  subject: string;
  reason: string;
  body: string;
}) {
  if (input.subject.length < 3 || input.subject.length > 200) {
    return "กรุณาระบุเรื่อง 3-200 ตัวอักษร";
  }

  if (input.reason.length < 3 || input.reason.length > 500) {
    return "กรุณาระบุเหตุผล 3-500 ตัวอักษร";
  }

  if (input.body.length < 5 || input.body.length > 4000) {
    return "กรุณาระบุข้อความ 5-4000 ตัวอักษร";
  }

  return "";
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
      new URL(request.url).searchParams.get("status")?.trim() ?? "all";

    let query = auth.admin
      .from("memo_requests")
      .select("*")
      .eq("user_id", auth.profile.id)
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
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "โหลดบันทึกข้อความไม่สำเร็จ",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  let issuedReferenceId: string | null = null;
  let issuedAdmin: SupabaseClient | null = null;

  try {
    const auth = await authorize(request);

    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, message: auth.message },
        { status: auth.status }
      );
    }

    const body = (await request.json()) as {
      id?: string;
      action?: MemoAction;
      subject?: string;
      reason?: string;
      memoText?: string;
      attachmentDescription?: string;
    };

    const action = body.action === "submit" ? "submit" : "draft";
    const subject = String(body.subject ?? "").trim();
    const reason = String(body.reason ?? "").trim();
    const memoText = String(body.memoText ?? "").trim();
    const attachmentDescription = String(
      body.attachmentDescription ?? ""
    ).trim();
    const validation = validateMemoInput({
      subject,
      reason,
      body: memoText,
    });

    if (validation) {
      return NextResponse.json(
        { ok: false, message: validation },
        { status: 400 }
      );
    }

    let existing: ExistingMemo | null = null;

    if (body.id) {
      const { data, error } = await auth.admin
        .from("memo_requests")
        .select("id, status, document_number_issue_id, memo_number, sequence_number")
        .eq("id", body.id)
        .eq("user_id", auth.profile.id)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      existing = data as ExistingMemo | null;

      if (!existing) {
        return NextResponse.json(
          { ok: false, message: "ไม่พบบันทึกข้อความนี้" },
          { status: 404 }
        );
      }

      if (!["draft", "revision"].includes(existing.status)) {
        return NextResponse.json(
          {
            ok: false,
            message:
              "แก้ไขได้เฉพาะฉบับร่างหรือรายการที่ถูกส่งกลับแก้ไขเท่านั้น",
          },
          { status: 409 }
        );
      }
    }

    const requestId = existing?.id ?? crypto.randomUUID();
    const nextStatus: MemoStatus =
      action === "submit" ? "pending" : "draft";
    const now = new Date().toISOString();
    let memoNumber = existing?.memo_number ?? null;
    let issueId = existing?.document_number_issue_id ?? null;
    let sequenceNumber = existing?.sequence_number ?? null;

    if (action === "submit" && !issueId) {
      issuedReferenceId = requestId;
      issuedAdmin = auth.admin;

      const issued = await issueDocumentNumber(auth.admin, {
        seriesCode: "LEAVE",
        documentType: "MEMO",
        referenceId: requestId,
        issuedBy: auth.profile.id,
        metadata: {
          subject,
          applicantName: auth.profile.full_name,
        },
      });

      issueId = issued.issueId;
      memoNumber = issued.formattedNumber;
      sequenceNumber = issued.runningNumber;
    }

    const payload = {
      id: requestId,
      user_id: auth.profile.id,
      full_name: auth.profile.full_name,
      position: auth.profile.position,
      subject,
      reason,
      body: memoText,
      attachment_description: attachmentDescription || null,
      status: nextStatus,
      memo_number: memoNumber,
      sequence_number: sequenceNumber,
      document_number_issue_id: issueId,
      submitted_at: action === "submit" ? now : null,
      updated_at: now,
    };

    const { data, error } = existing
      ? await auth.admin
          .from("memo_requests")
          .update(payload)
          .eq("id", requestId)
          .eq("user_id", auth.profile.id)
          .select("*")
          .single()
      : await auth.admin
          .from("memo_requests")
          .insert(payload)
          .select("*")
          .single();

    if (error || !data) {
      throw new Error(error?.message || "บันทึกข้อความไม่สำเร็จ");
    }

    await logMemoStatus(auth.admin, {
      memoRequestId: requestId,
      actorId: auth.profile.id,
      fromStatus: existing?.status ?? null,
      toStatus: nextStatus,
      note: action === "submit" ? "ส่งให้ผู้บริหารพิจารณา" : "บันทึกฉบับร่าง",
    });

    if (action === "submit") {
      await markDocumentNumberIssue(auth.admin, {
        documentType: "MEMO",
        referenceId: requestId,
        status: "COMPLETED",
      });

      await notifyMemoSubmitted({
        requestId,
        fullName: auth.profile.full_name,
        position: auth.profile.position,
        subject,
        reason,
        memoNumber,
        submittedAt: now,
      }).catch((lineError) => {
        console.error("LINE memo submitted notification error:", lineError);
      });
    }

    return NextResponse.json({
      ok: true,
      request: data,
      message:
        action === "submit"
          ? `ส่งบันทึกข้อความสำเร็จ เลขที่ ${memoNumber}`
          : "บันทึกฉบับร่างแล้ว",
    });
  } catch (error) {
    if (issuedAdmin && issuedReferenceId) {
      await markDocumentNumberIssue(issuedAdmin, {
        documentType: "MEMO",
        referenceId: issuedReferenceId,
        status: "FAILED",
        failureReason:
          error instanceof Error ? error.message : "บันทึกข้อความไม่สำเร็จ",
      });
    }

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "บันทึกข้อความไม่สำเร็จ",
      },
      { status: 500 }
    );
  }
}
