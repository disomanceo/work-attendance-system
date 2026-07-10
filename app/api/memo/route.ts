import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  issueDocumentNumber,
  markDocumentNumberIssue,
} from "@/lib/document-numbers";
import { notifyMemoSubmitted } from "@/lib/line/memo-notifications";
import { notifyMemoSubmittedTelegram } from "@/lib/telegram/memo-workflow-notifications";
import { loadMemoLogsByRequest } from "@/lib/memo-logs";
import {
  callMemoGas,
  getMemoDocumentConfig,
  getProfileSignatureAsset,
  type MemoPendingResponse,
} from "@/lib/memo-document-gas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MEMO_ATTACHMENT_BUCKET = "memo-attachments";
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);

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
  signature_file_id: string | null;
};

type ExistingMemo = {
  id: string;
  status: MemoStatus;
  document_number_issue_id: string | null;
  memo_number: string | null;
  sequence_number: number | null;
  attachment_bucket: string | null;
  attachment_path: string | null;
  attachment_file_name: string | null;
  attachment_mime_type: string | null;
  attachment_size_bytes: number | null;
  working_document_id: string | null;
  working_document_url: string | null;
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
      message: "เธฃเธฐเธเธเธขเธฑเธเนเธกเนเนเธ”เนเธ•เธฑเนเธเธเนเธฒ Supabase เธเธฑเนเธ Server",
    };
  }

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (!token) {
    return {
      ok: false as const,
      status: 401,
      message: "เธเธฃเธธเธ“เธฒเน€เธเนเธฒเธชเธนเนเธฃเธฐเธเธเนเธซเธกเน",
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
      message: "Session เธซเธกเธ”เธญเธฒเธขเธธ เธเธฃเธธเธ“เธฒเน€เธเนเธฒเธชเธนเนเธฃเธฐเธเธเนเธซเธกเน",
    };
  }

  const admin = createClient(cfg.url, cfg.service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, full_name, position, role, account_status, signature_file_id")
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
      message: "เธเธฑเธเธเธตเธขเธฑเธเนเธกเนเธเธฃเนเธญเธกเนเธเนเธเธฒเธ",
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
    return "เธเธฃเธธเธ“เธฒเธฃเธฐเธเธธเน€เธฃเธทเนเธญเธ 3-200 เธ•เธฑเธงเธญเธฑเธเธฉเธฃ";
  }

  if (input.reason.length < 3 || input.reason.length > 500) {
    return "เธเธฃเธธเธ“เธฒเธฃเธฐเธเธธเน€เธซเธ•เธธเธเธฅ 3-500 เธ•เธฑเธงเธญเธฑเธเธฉเธฃ";
  }

  if (input.body.length < 5 || input.body.length > 4000) {
    return "เธเธฃเธธเธ“เธฒเธฃเธฐเธเธธเธเนเธญเธเธงเธฒเธก 5-4000 เธ•เธฑเธงเธญเธฑเธเธฉเธฃ";
  }

  return "";
}

function parseSubmittedDate(value: string | undefined) {
  const date = String(value ?? "").trim();

  if (!date) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("เธเธฃเธธเธ“เธฒเธฃเธฐเธเธธเธงเธฑเธเธ—เธตเนเธขเธทเนเธเนเธซเนเธ–เธนเธเธ•เนเธญเธ");
  }

  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "00";
  const milliseconds = String(now.getMilliseconds()).padStart(3, "0");

  return `${date}T${part("hour")}:${part("minute")}:${part("second")}.${milliseconds}+07:00`;
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

    const requests = data ?? [];
    const logsByRequest = await loadMemoLogsByRequest(
      auth.admin,
      requests.map((item) => item.id)
    );

    return NextResponse.json({
      ok: true,
      requests: requests.map((item) => ({
        ...item,
        logs: logsByRequest.get(item.id) ?? [],
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "เนเธซเธฅเธ”เธเธฑเธเธ—เธถเธเธเนเธญเธเธงเธฒเธกเนเธกเนเธชเธณเน€เธฃเนเธ",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  let issuedReferenceId: string | null = null;
  let issuedAdmin: SupabaseClient | null = null;
  let uploadedAttachmentPath: string | null = null;
  let uploadAdmin: SupabaseClient | null = null;
  let replacedAttachmentBucket: string | null = null;
  let replacedAttachmentPath: string | null = null;
  let pendingMemoDocumentId: string | null = null;
  let pendingMemoGasUrl: string | null = null;
  let pendingMemoGasSecret: string | null = null;

  try {
    const auth = await authorize(request);

    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, message: auth.message },
        { status: auth.status }
      );
    }

    const contentType = request.headers.get("content-type") ?? "";
    let body:
      | {
          id?: string;
          action?: MemoAction;
          subject?: string;
          reason?: string;
          memoText?: string;
          submittedDate?: string;
          attachmentDescription?: string;
          attachment?: File | null;
        }
      | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const attachmentValue = form.get("attachment");

      body = {
        id: String(form.get("id") ?? "") || undefined,
        action: String(form.get("action") ?? "") as MemoAction,
        subject: String(form.get("subject") ?? ""),
        reason: String(form.get("reason") ?? ""),
        memoText: String(form.get("memoText") ?? ""),
        submittedDate: String(form.get("submittedDate") ?? ""),
        attachmentDescription: String(form.get("attachmentDescription") ?? ""),
        attachment:
          attachmentValue instanceof File && attachmentValue.size > 0
            ? attachmentValue
            : null,
      };
    } else {
      body = (await request.json()) as {
        id?: string;
        action?: MemoAction;
        subject?: string;
        reason?: string;
        memoText?: string;
        submittedDate?: string;
        attachmentDescription?: string;
      };
    }

    const action = body?.action === "submit" ? "submit" : "draft";
    const subject = String(body.subject ?? "").trim();
    const reason = String(body.reason ?? "").trim();
    const memoText = String(body.memoText ?? "").trim();
    const documentSubmittedAt =
      parseSubmittedDate(body.submittedDate) ?? new Date().toISOString();
    const submittedAt =
      action === "submit" ? new Date().toISOString() : documentSubmittedAt;
    const attachmentDescription = String(
      body.attachmentDescription ?? ""
    ).trim();
    const attachment = body.attachment ?? null;
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
        .select(
          "id, status, document_number_issue_id, memo_number, sequence_number, attachment_bucket, attachment_path, attachment_file_name, attachment_mime_type, attachment_size_bytes, working_document_id, working_document_url"
        )
        .eq("id", body.id)
        .eq("user_id", auth.profile.id)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      existing = data as ExistingMemo | null;

      if (!existing) {
        return NextResponse.json(
          { ok: false, message: "เนเธกเนเธเธเธเธฑเธเธ—เธถเธเธเนเธญเธเธงเธฒเธกเธเธตเน" },
          { status: 404 }
        );
      }

      if (!["draft", "revision"].includes(existing.status)) {
        return NextResponse.json(
          {
            ok: false,
            message:
              "เนเธเนเนเธเนเธ”เนเน€เธเธเธฒเธฐเธเธเธฑเธเธฃเนเธฒเธเธซเธฃเธทเธญเธฃเธฒเธขเธเธฒเธฃเธ—เธตเนเธ–เธนเธเธชเนเธเธเธฅเธฑเธเนเธเนเนเธเน€เธ—เนเธฒเธเธฑเนเธ",
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
    let attachmentBucket = existing?.attachment_bucket ?? null;
    let attachmentPath = existing?.attachment_path ?? null;
    let attachmentFileName = existing?.attachment_file_name ?? null;
    let attachmentMimeType = existing?.attachment_mime_type ?? null;
    let attachmentSizeBytes = existing?.attachment_size_bytes ?? null;

    if (attachment) {
      if (attachment.size > MAX_ATTACHMENT_SIZE) {
        return NextResponse.json(
          { ok: false, message: "เนเธเธฅเนเนเธเธเธ•เนเธญเธเธกเธตเธเธเธฒเธ”เนเธกเนเน€เธเธดเธ 10 MB" },
          { status: 400 }
        );
      }

      if (!ALLOWED_ATTACHMENT_TYPES.has(attachment.type)) {
        return NextResponse.json(
          { ok: false, message: "เธฃเธญเธเธฃเธฑเธเน€เธเธเธฒเธฐเนเธเธฅเน PDF, JPG เนเธฅเธฐ PNG" },
          { status: 400 }
        );
      }

      const extension = attachment.name.split(".").pop()?.toLowerCase() || "bin";
      const safeExtension = extension.replace(/[^a-z0-9]/g, "") || "bin";
      const attachmentPathValue = `${auth.profile.id}/${requestId}/${crypto.randomUUID()}.${safeExtension}`;
      const { error: uploadError } = await auth.admin.storage
        .from(MEMO_ATTACHMENT_BUCKET)
        .upload(attachmentPathValue, attachment, {
          contentType: attachment.type || "application/octet-stream",
          upsert: false,
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      uploadedAttachmentPath = attachmentPathValue;
      uploadAdmin = auth.admin;
      replacedAttachmentBucket = existing?.attachment_bucket ?? null;
      replacedAttachmentPath = existing?.attachment_path ?? null;
      attachmentBucket = MEMO_ATTACHMENT_BUCKET;
      attachmentPath = attachmentPathValue;
      attachmentFileName = attachment.name;
      attachmentMimeType = attachment.type || "application/octet-stream";
      attachmentSizeBytes = attachment.size;
    }

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

    let workingDocumentId = existing?.working_document_id ?? null;
    let workingDocumentUrl = existing?.working_document_url ?? null;
    const memoDocumentConfig =
      action === "submit" ? getMemoDocumentConfig() : null;

    if (memoDocumentConfig && action === "submit") {
      if (!auth.profile.signature_file_id) {
        return NextResponse.json(
          {
            ok: false,
            message:
              "เธเธฃเธธเธ“เธฒเธญเธฑเธเนเธซเธฅเธ”เธฅเธฒเธขเน€เธเนเธเนเธเธเนเธญเธกเธนเธฅเธชเนเธงเธเธ•เธฑเธงเธเนเธญเธเธชเนเธเธเธฑเธเธ—เธถเธเธเนเธญเธเธงเธฒเธก",
          },
          { status: 400 }
        );
      }

      if (workingDocumentId) {
        await callMemoGas(memoDocumentConfig.memoGasUrl, {
          action: "memoDiscardPending",
          secret: memoDocumentConfig.memoGasSecret,
          workingDocumentId,
        }).catch((cleanupError) => {
          console.error("Discard old pending memo document error:", cleanupError);
        });
      }

      const applicantSignature = await getProfileSignatureAsset(
        memoDocumentConfig.profileGasUrl,
        memoDocumentConfig.profileGasSecret,
        auth.profile.signature_file_id,
        "เธฅเธฒเธขเน€เธเนเธเธเธนเนเธขเธทเนเธ"
      );

      const gasResult = (await callMemoGas(memoDocumentConfig.memoGasUrl, {
        action: "memoCreatePending",
        secret: memoDocumentConfig.memoGasSecret,
        roleKey: auth.profile.role,
        documentNumber: memoNumber,
        documentRunningNumber: sequenceNumber,
        fullName: auth.profile.full_name,
        position: auth.profile.position || auth.profile.role,
        subject,
        reason,
        memoText,
        attachmentDescription: attachmentDescription || "-",
        submittedAt: documentSubmittedAt,
        applicantSignatureBase64:
          `data:${applicantSignature.mimeType};base64,${applicantSignature.base64}`,
      })) as MemoPendingResponse;

      if (!gasResult.workingDocumentId) {
        throw new Error("GAS เนเธกเนเธเธทเธเธเนเธญเธกเธนเธฅ Google Docs เธเธญเธเธเธฑเธเธ—เธถเธเธเนเธญเธเธงเธฒเธก");
      }

      pendingMemoDocumentId = gasResult.workingDocumentId;
      pendingMemoGasUrl = memoDocumentConfig.memoGasUrl;
      pendingMemoGasSecret = memoDocumentConfig.memoGasSecret;
      workingDocumentId = gasResult.workingDocumentId;
      workingDocumentUrl = gasResult.workingDocumentUrl || null;
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
      attachment_bucket: attachmentBucket,
      attachment_path: attachmentPath,
      attachment_file_name: attachmentFileName,
      attachment_mime_type: attachmentMimeType,
      attachment_size_bytes: attachmentSizeBytes,
      status: nextStatus,
      memo_number: memoNumber,
      sequence_number: sequenceNumber,
      document_number_issue_id: issueId,
      working_document_id: workingDocumentId,
      working_document_url: workingDocumentUrl,
      submitted_at: action === "submit" ? submittedAt : null,
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
      throw new Error(error?.message || "เธเธฑเธเธ—เธถเธเธเนเธญเธเธงเธฒเธกเนเธกเนเธชเธณเน€เธฃเนเธ");
    }

    pendingMemoDocumentId = null;

    if (replacedAttachmentBucket && replacedAttachmentPath) {
      await auth.admin.storage
        .from(replacedAttachmentBucket)
        .remove([replacedAttachmentPath])
        .catch((cleanupError) => {
          console.error("Remove replaced memo attachment error:", cleanupError);
        });
    }

    await logMemoStatus(auth.admin, {
      memoRequestId: requestId,
      actorId: auth.profile.id,
      fromStatus: existing?.status ?? null,
      toStatus: nextStatus,
      note: action === "submit" ? "เธชเนเธเนเธซเนเธเธนเนเธเธฃเธดเธซเธฒเธฃเธเธดเธเธฒเธฃเธ“เธฒ" : "เธเธฑเธเธ—เธถเธเธเธเธฑเธเธฃเนเธฒเธ",
    });

    if (action === "submit") {
      await markDocumentNumberIssue(auth.admin, {
        documentType: "MEMO",
        referenceId: requestId,
        status: "COMPLETED",
      });

      await Promise.allSettled([
        notifyMemoSubmitted({
          requestId,
          fullName: auth.profile.full_name,
          position: auth.profile.position,
          subject,
          reason,
          memoNumber,
          submittedAt,
        }),
        notifyMemoSubmittedTelegram({
          requestId,
          applicantProfileId: auth.profile.id,
          applicantName: auth.profile.full_name,
          memoNumber,
          subject,
          reason,
        }),
      ]).then((results) => {
        results.forEach((result, index) => {
          if (result.status === "rejected") {
            console.error(
              index === 0
                ? "LINE memo submitted notification error:"
                : "Telegram memo submitted notification error:",
              result.reason
            );
          }
        });
      });
    }

    return NextResponse.json({
      ok: true,
      request: data,
      message:
        action === "submit"
          ? `เธชเนเธเธเธฑเธเธ—เธถเธเธเนเธญเธเธงเธฒเธกเธชเธณเน€เธฃเนเธ เน€เธฅเธเธ—เธตเน ${memoNumber}`
          : "เธเธฑเธเธ—เธถเธเธเธเธฑเธเธฃเนเธฒเธเนเธฅเนเธง",
    });
  } catch (error) {
    if (uploadAdmin && uploadedAttachmentPath) {
      await uploadAdmin.storage
        .from(MEMO_ATTACHMENT_BUCKET)
        .remove([uploadedAttachmentPath])
        .catch(() => undefined);
    }

    if (issuedAdmin && issuedReferenceId) {
      await markDocumentNumberIssue(issuedAdmin, {
        documentType: "MEMO",
        referenceId: issuedReferenceId,
        status: "FAILED",
        failureReason:
          error instanceof Error ? error.message : "เธเธฑเธเธ—เธถเธเธเนเธญเธเธงเธฒเธกเนเธกเนเธชเธณเน€เธฃเนเธ",
      });
    }

    if (pendingMemoGasUrl && pendingMemoGasSecret && pendingMemoDocumentId) {
      await callMemoGas(pendingMemoGasUrl, {
        action: "memoDiscardPending",
        secret: pendingMemoGasSecret,
        workingDocumentId: pendingMemoDocumentId,
      }).catch(() => undefined);
    }

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "เธเธฑเธเธ—เธถเธเธเนเธญเธเธงเธฒเธกเนเธกเนเธชเธณเน€เธฃเนเธ",
      },
      { status: 500 }
    );
  }
}
