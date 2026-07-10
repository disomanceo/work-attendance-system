import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyLeaveReviewed } from "@/lib/line/notifications";
import { notifyLeaveReviewedTelegram } from "@/lib/telegram/leave-workflow-notifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type GasAssetResponse = {
  ok?: boolean;
  message?: string;
  base64?: string;
  mimeType?: string;
};

type GasFinalizeResponse = {
  ok?: boolean;
  message?: string;
  status?: string;
  decision?: string;
  pdfFileId?: string;
  pdfFileUrl?: string;
  pdfFileName?: string;
  finalFolderId?: string;
};

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const leaveGasUrl = process.env.GAS_LEAVE_DOCUMENT_URL;
  const leaveGasSecret = process.env.LEAVE_DOCUMENT_SECRET;
  const profileGasUrl = process.env.GAS_PROFILE_UPLOAD_URL;
  const profileGasSecret = process.env.GAS_PROFILE_UPLOAD_SECRET;

  if (
    !url ||
    !publishable ||
    !service ||
    !leaveGasUrl ||
    !leaveGasSecret ||
    !profileGasUrl ||
    !profileGasSecret
  ) {
    return null;
  }

  return {
    url,
    publishable,
    service,
    leaveGasUrl,
    leaveGasSecret,
    profileGasUrl,
    profileGasSecret,
  };
}

async function callGas(
  url: string,
  payload: Record<string, unknown>,
  timeoutMs = 50000
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        "Google Apps Script ตอบกลับช้าเกิน 50 วินาที กรุณาตรวจสอบ Deployment และสิทธิ์การเข้าถึง"
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  let result: Record<string, unknown>;

  try {
    result = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(
      "Google Apps Script ไม่ได้ตอบกลับเป็น JSON กรุณา Deploy เวอร์ชันล่าสุด"
    );
  }

  if (!response.ok || result.ok !== true) {
    throw new Error(
      typeof result.message === "string"
        ? result.message
        : "Google Apps Script ทำงานไม่สำเร็จ"
    );
  }

  return result;
}

async function getSignatureAsset(
  profileGasUrl: string,
  profileGasSecret: string,
  fileId: string
) {
  const result = (await callGas(profileGasUrl, {
    secret: profileGasSecret,
    action: "get",
    fileId,
  })) as GasAssetResponse;

  if (!result.base64) {
    throw new Error("ไม่พบข้อมูลลายเซ็นผู้อำนวยการ");
  }

  return {
    base64: result.base64,
    mimeType: result.mimeType || "image/png",
  };
}

async function authorize(request: Request) {
  const cfg = config();
  if (!cfg) {
    throw new Error(
      "Environment Variables ของ Supabase หรือ Google Apps Script ยังไม่ครบ"
    );
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
    .select(
      "id, full_name, position, role, account_status, signature_file_id"
    )
    .eq("id", user.id)
    .maybeSingle();

  if (
    !profile ||
    profile.account_status !== "active" ||
    !["director", "admin"].includes(profile.role)
  ) {
    return {
      ok: false as const,
      status: 403,
      message: "ไม่มีสิทธิ์พิจารณาใบลา",
    };
  }

  return { ok: true as const, user, profile, admin, cfg };
}

export async function GET(request: Request) {
  try {
    const authorization = await authorize(request);
    if (!authorization.ok) {
      return NextResponse.json(
        { ok: false, message: authorization.message },
        { status: authorization.status }
      );
    }

    const status = new URL(request.url).searchParams.get("status") || "pending";

    let query = authorization.admin
      .from("leave_requests")
      .select(
        `
        *,
        profiles!leave_requests_user_id_fkey (
          full_name,
          position,
          role,
          profile_image_file_id
        )
      `
      )
      .order("created_at", { ascending: false });

    if (status !== "all") query = query.eq("status", status);

    const { data, error } = await query;
    if (error) throw new Error("โหลดรายการใบลาไม่สำเร็จ");

    return NextResponse.json({ ok: true, requests: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "เกิดข้อผิดพลาด",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const authorization = await authorize(request);
    if (!authorization.ok) {
      return NextResponse.json(
        { ok: false, message: authorization.message },
        { status: authorization.status }
      );
    }

    const body = (await request.json()) as {
      requestId?: string;
      action?: "approve" | "reject";
      note?: string;
    };

    if (!body.requestId || !["approve", "reject"].includes(body.action ?? "")) {
      return NextResponse.json(
        { ok: false, message: "ข้อมูลการพิจารณาไม่ครบ" },
        { status: 400 }
      );
    }

    const { admin, user, profile, cfg } = authorization;

    if (!profile.signature_file_id) {
      return NextResponse.json(
        {
          ok: false,
          message: "กรุณาอัปโหลดลายเซ็นผู้อำนวยการก่อนพิจารณาใบลา",
        },
        { status: 400 }
      );
    }

    const { data: leave } = await admin
      .from("leave_requests")
      .select(
        `
        *,
        profiles!leave_requests_user_id_fkey (
          full_name,
          position,
          role,
          profile_image_file_id
        )
      `
      )
      .eq("id", body.requestId)
      .eq("status", "pending")
      .maybeSingle();

    if (!leave) {
      return NextResponse.json(
        { ok: false, message: "ไม่พบใบลาที่รอพิจารณา" },
        { status: 404 }
      );
    }

    if (!leave.working_document_id || !leave.leave_number) {
      throw new Error(
        "ใบลานี้ยังไม่มีเอกสาร Google Docs กรุณาตรวจสอบข้อมูลก่อนพิจารณา"
      );
    }

    const directorSignature = await getSignatureAsset(
      cfg.profileGasUrl,
      cfg.profileGasSecret,
      profile.signature_file_id
    );

    const nextStatus = body.action === "approve" ? "approved" : "rejected";

    const gasResult = (await callGas(cfg.leaveGasUrl, {
      action: "leaveFinalize",
      secret: cfg.leaveGasSecret,
      workingDocumentId: leave.working_document_id,
      requestFolderId: leave.drive_request_folder_id || "",
      evidenceFileId: leave.evidence_file_id || "",
      leaveNumber: leave.leave_number,
      fiscalYear: leave.fiscal_year,
      fullName: leave.profiles?.full_name || "",
      leaveType: leave.leave_type,
      decision: nextStatus,
      directorNote: body.note?.trim() || "",
      directorSignatureBase64:
        `data:${directorSignature.mimeType};base64,${directorSignature.base64}`,
    })) as GasFinalizeResponse;

    if (!gasResult.pdfFileId || !gasResult.pdfFileUrl) {
      throw new Error("GAS สร้าง PDF ไม่สำเร็จหรือไม่คืน File ID");
    }

    let sequenceNumber: number | null = null;

    if (body.action === "approve") {
      const { count, error: countError } = await admin
        .from("leave_requests")
        .select("id", { count: "exact", head: true })
        .eq("user_id", leave.user_id)
        .eq("leave_type", leave.leave_type)
        .eq("fiscal_year", leave.fiscal_year)
        .eq("status", "approved");

      if (countError) throw new Error("คำนวณครั้งที่ลาไม่สำเร็จ");
      sequenceNumber = Number(count ?? 0) + 1;
    }

    const { data, error } = await admin
      .from("leave_requests")
      .update({
        status: nextStatus,
        sequence_number: sequenceNumber,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        review_note: body.note?.trim() || null,
        updated_at: new Date().toISOString(),

        pdf_file_id: gasResult.pdfFileId,
        pdf_file_url: gasResult.pdfFileUrl,
        pdf_file_name: gasResult.pdfFileName || null,
        final_drive_folder_id: gasResult.finalFolderId || null,
        finalized_at: new Date().toISOString(),

        // ไฟล์ชั่วคราวถูกลบโดย GAS แล้ว
        working_document_id: null,
        working_document_url: null,
        drive_request_folder_id: null,
        attachment_bucket: null,
        attachment_path: null,
      })
      .eq("id", leave.id)
      .eq("status", "pending")
      .select("*")
      .single();

    if (error) {
      console.error("Leave finalize database update error:", error);

      throw new Error(
        `สร้าง PDF สำเร็จแล้ว แต่บันทึกผลลงฐานข้อมูลไม่สำเร็จ: ${error.message}` +
          (error.details ? ` | ${error.details}` : "") +
          (error.hint ? ` | ${error.hint}` : "")
      );
    }

    await Promise.allSettled([
      notifyLeaveReviewed({
        requestId: leave.id,
        fullName: leave.profiles?.full_name || "ไม่พบชื่อ",
        leaveType: leave.leave_type,
        startDate: leave.start_date,
        endDate: leave.end_date,
        totalDays: Number(leave.total_work_days || 0),
        approved: nextStatus === "approved",
        reviewerName: profile.full_name || "ผู้บริหาร",
        reviewNote: body.note?.trim() || "",
        leaveNumber: leave.leave_number,
      }),
      notifyLeaveReviewedTelegram({
        requestId: leave.id,
        applicantProfileId: leave.user_id,
        reviewerProfileId: profile.id,
        reviewerName: profile.full_name || "ผู้บริหาร",
        approved: nextStatus === "approved",
        leaveNumber: leave.leave_number,
        leaveType: leave.leave_type,
        startDate: leave.start_date,
        endDate: leave.end_date,
        totalDays: Number(leave.total_work_days || 0),
        reviewNote: body.note?.trim() || "",
        pdfFileUrl: gasResult.pdfFileUrl,
      }),
    ]).then((results) => {
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          console.error(
            index === 0
              ? "LINE leave reviewed notification error:"
              : "Telegram leave reviewed notification error:",
            result.reason
          );
        }
      });
    });

    return NextResponse.json({
      ok: true,
      request: data,
      pdfFileUrl: gasResult.pdfFileUrl,
      message:
        nextStatus === "approved"
          ? `อนุมัติ ${leave.leave_number} แล้ว เป็นการลาครั้งที่ ${sequenceNumber}`
          : `ไม่อนุมัติ ${leave.leave_number} และจัดเก็บ PDF เรียบร้อยแล้ว`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "เกิดข้อผิดพลาด",
      },
      { status: 500 }
    );
  }
}
export async function DELETE(request: Request) {
  try {
    const authorization = await authorize(request);

    if (!authorization.ok) {
      return NextResponse.json(
        { ok: false, message: authorization.message },
        { status: authorization.status }
      );
    }

    const body = (await request.json()) as {
      requestId?: string;
      confirmation?: string;
    };

    if (!body.requestId) {
      return NextResponse.json(
        { ok: false, message: "ไม่พบรหัสใบลาที่ต้องการลบ" },
        { status: 400 }
      );
    }

    if (body.confirmation !== "ลบ") {
      return NextResponse.json(
        { ok: false, message: "กรุณาพิมพ์คำว่า ลบ เพื่อยืนยัน" },
        { status: 400 }
      );
    }

    const { admin, cfg } = authorization;

    const { data: leave, error: leaveError } = await admin
      .from("leave_requests")
      .select(`
        id,
        status,
        leave_number,
        working_document_id,
        drive_request_folder_id,
        evidence_file_id,
        document_number_issue_id
      `)
      .eq("id", body.requestId)
      .maybeSingle();

    if (leaveError) {
      throw new Error(`อ่านข้อมูลใบลาไม่สำเร็จ: ${leaveError.message}`);
    }

    if (!leave) {
      return NextResponse.json(
        { ok: false, message: "ไม่พบใบลานี้ หรืออาจถูกลบไปแล้ว" },
        { status: 404 }
      );
    }

    if (leave.status !== "pending") {
      return NextResponse.json(
        {
          ok: false,
          message: "ลบได้เฉพาะใบลาที่อยู่ระหว่างรอพิจารณาเท่านั้น",
        },
        { status: 409 }
      );
    }

    // พยายามลบเอกสารชั่วคราวใน Google Drive ก่อน
    // ถ้าไฟล์ถูกย้าย/ลบไปแล้ว จะไม่ขัดขวางการลบข้อมูลค้าง
    await callGas(cfg.leaveGasUrl, {
      action: "leaveDiscardPending",
      secret: cfg.leaveGasSecret,
      workingDocumentId: leave.working_document_id || "",
      evidenceFileId: leave.evidence_file_id || "",
      requestFolderId: leave.drive_request_folder_id || "",
    }).catch((cleanupError) => {
      console.error("Delete pending leave Drive cleanup error:", cleanupError);
    });

    const { error: deleteError } = await admin
      .from("leave_requests")
      .delete()
      .eq("id", leave.id)
      .eq("status", "pending");

    if (deleteError) {
      throw new Error(`ลบข้อมูลใบลาไม่สำเร็จ: ${deleteError.message}`);
    }

    if (leave.document_number_issue_id) {
      const { error: issueError } = await admin
        .from("document_number_issues")
        .update({
          issue_status: "CANCELLED",
          failure_reason: "ลบใบลาที่ค้างโดยผู้บริหาร",
        })
        .eq("id", leave.document_number_issue_id);

      if (issueError) {
        console.error(
          "Update document number issue after delete error:",
          issueError
        );
      }
    }

    return NextResponse.json({
      ok: true,
      message: `ลบใบลา ${leave.leave_number || ""} เรียบร้อยแล้ว`,
    });
  } catch (error) {
    console.error("DELETE /api/admin/leave error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "เกิดข้อผิดพลาดในการลบใบลา",
      },
      { status: 500 }
    );
  }
}
