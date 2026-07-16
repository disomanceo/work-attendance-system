import { NextResponse } from "next/server";
import { notifyAnnouncementSubmittedTelegram } from "@/lib/telegram/announcement-workflow-notifications";
import {
  authorizeAnnouncementRequest,
  isAnnouncementManager,
} from "@/lib/announcement-auth";
import {
  callAnnouncementDriveGas,
  getAnnouncementDriveConfig,
} from "@/lib/announcement-drive-gas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const PDF_TYPE = "application/pdf";

const WORD_EXTENSIONS = new Set([
  "doc",
  "docx",
  "docm",
  "dot",
  "dotx",
  "dotm",
  "rtf",
]);

const WORD_MIME_TYPES = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-word.document.macroEnabled.12",
  "application/vnd.ms-word.template.macroEnabled.12",
  "application/rtf",
  "text/rtf",
  "application/octet-stream",
]);

type AnnouncementAction = "submit" | "update";

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("วันที่ประกาศไม่ถูกต้อง");
  }

  return value;
}

function normalizeAction(value: FormDataEntryValue | null): AnnouncementAction {
  return value === "update" ? "update" : "submit";
}

function validateFile(file: File | null, kind: "docx" | "pdf") {
  if (!file || file.size === 0) return;

  if (file.size > MAX_FILE_SIZE) {
    throw new Error("ไฟล์แต่ละไฟล์ต้องไม่เกิน 20 MB");
  }

  const extension = file.name
    .split(".")
    .pop()
    ?.trim()
    .toLowerCase() ?? "";

  if (kind === "pdf") {
    if (extension !== "pdf" || file.type !== PDF_TYPE) {
      throw new Error("ไฟล์ PDF ไม่ถูกต้อง");
    }

    return;
  }

  const validExtension = WORD_EXTENSIONS.has(extension);
  const validMimeType =
    !file.type ||
    WORD_MIME_TYPES.has(file.type);

  if (!validExtension || !validMimeType) {
    throw new Error(
      "รองรับไฟล์ Word: DOC, DOCX, DOCM, DOT, DOTX, DOTM และ RTF"
    );
  }
}

async function uploadFile(input: {
  file: File;
  kind: "docx" | "pdf";
  announcementId: string;
  announcementDate: string;
  buddhistYear: number;
  announcementNumber: string;
  subject: string;
  existingFileId?: string | null;
}) {
  const cfg = getAnnouncementDriveConfig();

  if (!cfg) {
    throw new Error(
      "ยังไม่ได้ตั้งค่า GAS_ORDER_FILES_URL และ GAS_ORDER_FILES_SECRET"
    );
  }

  const base64 = Buffer.from(
    await input.file.arrayBuffer()
  ).toString("base64");

  const result = await callAnnouncementDriveGas(cfg.url, {
    action: input.existingFileId
      ? "replaceOrderFile"
      : "uploadOrderFile",
    secret: cfg.secret,
    fileId: input.existingFileId ?? "",
    orderId: input.announcementId,
    orderNumber: input.announcementNumber,
    documentType: "ANNOUNCEMENT",
    announcementId: input.announcementId,
    announcementDate: input.announcementDate,
    buddhistYear: input.buddhistYear,
    announcementNumber: input.announcementNumber,
    subject: input.subject,
    fileKind: input.kind.toUpperCase(),
    originalName: input.file.name,
    mimeType: input.file.type,
    base64,
  });

  return {
    fileId: String(result.fileId ?? ""),
    fileUrl: String(result.fileUrl ?? ""),
    fileName: String(result.fileName ?? input.file.name),
    mimeType: String(result.mimeType ?? input.file.type),
  };
}

export async function GET(request: Request) {
  try {
    const auth = await authorizeAnnouncementRequest(request);

    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, message: auth.message },
        { status: auth.status }
      );
    }

    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.trim() ?? "";
    const status = url.searchParams.get("status")?.trim() ?? "all";
    const year = Number(url.searchParams.get("year") ?? 0);
    const responsibleId =
      url.searchParams.get("responsibleId")?.trim() ?? "";

        const sort = url.searchParams.get("sort")?.trim() ?? "number_desc";let query = auth.admin
      .from("announcement_documents")
      .select("*");

    switch (sort) {
      case "number_asc":
        query = query
          .order("running_number", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: true });
        break;
      case "date_desc":
        query = query
          .order("announcement_date", { ascending: false })
          .order("running_number", { ascending: false, nullsFirst: false });
        break;
      case "date_asc":
        query = query
          .order("announcement_date", { ascending: true })
          .order("running_number", { ascending: true, nullsFirst: false });
        break;
      case "updated_desc":
        query = query.order("updated_at", { ascending: false });
        break;
      case "subject_asc":
        query = query
          .order("subject", { ascending: true })
          .order("running_number", { ascending: false, nullsFirst: false });
        break;
      case "number_desc":
      default:
        query = query
          .order("running_number", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false });
        break;
    }

    if (search) {
      query = query.or(
        `announcement_number.ilike.%${search}%,subject.ilike.%${search}%`
      );
    }

    if (status !== "all") query = query.eq("status", status);
    if (year > 0) query = query.eq("buddhist_year", year);
    if (responsibleId) {
      query = query.eq("responsible_user_id", responsibleId);
    }

    const [{ data, error }, { data: announcementSeries, error: seriesError }] =
      await Promise.all([
        query,
        auth.admin
          .from("document_number_series")
          .select("buddhist_year")
          .eq("code", "ORDER")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

    if (error) throw new Error(error.message);
    if (seriesError) throw new Error(seriesError.message);

    return NextResponse.json({
      ok: true,
      announcements: data ?? [],
      configuredYear: announcementSeries?.buddhist_year ?? null,
      currentProfile: auth.profile,
      canManageAll: isAnnouncementManager(auth.profile.role),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "โหลดทะเบียนประกาศไม่สำเร็จ",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authorizeAnnouncementRequest(request);

    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, message: auth.message },
        { status: auth.status }
      );
    }

    const form = await request.formData();
    const id = String(form.get("id") ?? "").trim();
    const action = normalizeAction(form.get("action"));
    const subject = String(form.get("subject") ?? "").trim();
    const announcementDate = validDate(String(form.get("announcementDate") ?? ""));
    const responsibleUserId = String(
      form.get("responsibleUserId") ?? ""
    ).trim();
    const docxValue = form.get("docx");
    const pdfValue = form.get("pdf");
    const docx =
      docxValue instanceof File && docxValue.size > 0
        ? docxValue
        : null;
    const pdf =
      pdfValue instanceof File && pdfValue.size > 0
        ? pdfValue
        : null;

    if (subject.length < 3 || subject.length > 500) {
      return NextResponse.json(
        { ok: false, message: "กรุณาระบุเรื่อง 3-500 ตัวอักษร" },
        { status: 400 }
      );
    }

    validateFile(docx, "docx");
    validateFile(pdf, "pdf");

    const { data: responsible, error: responsibleError } =
      await auth.admin
        .from("profiles")
        .select("id, full_name, account_status")
        .eq("id", responsibleUserId)
        .maybeSingle();

    if (
      responsibleError ||
      !responsible ||
      responsible.account_status !== "active"
    ) {
      return NextResponse.json(
        { ok: false, message: "ไม่พบผู้รับผิดชอบที่เปิดใช้งาน" },
        { status: 400 }
      );
    }

    if (
      !isAnnouncementManager(auth.profile.role) &&
      responsibleUserId !== auth.profile.id
    ) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "ครูสามารถสร้างหรือแก้ไขรายการที่ตนเองเป็นผู้รับผิดชอบเท่านั้น",
        },
        { status: 403 }
      );
    }

    const now = new Date().toISOString();
    let existing: Record<string, unknown> | null = null;

    if (id) {
      const { data, error } = await auth.admin
        .from("announcement_documents")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error || !data) {
        return NextResponse.json(
          { ok: false, message: "ไม่พบรายการประกาศ" },
          { status: 404 }
        );
      }

      existing = data;

      const canEdit =
        isAnnouncementManager(auth.profile.role) ||
        data.responsible_user_id === auth.profile.id;

      if (!canEdit) {
        return NextResponse.json(
          { ok: false, message: "ไม่มีสิทธิ์แก้ไขรายการนี้" },
          { status: 403 }
        );
      }

      if (
        !isAnnouncementManager(auth.profile.role) &&
        !["PENDING", "REVISION"].includes(String(data.status))
      ) {
        return NextResponse.json(
          {
            ok: false,
            message:
              "รายการนี้อนุมัติแล้วหรือไม่ได้อยู่ในสถานะที่แก้ไขได้",
          },
          { status: 409 }
        );
      }
    }

    const announcementId = id || crypto.randomUUID();
    let announcementNumber = String(existing?.announcement_number ?? "");
    let runningNumber =
      typeof existing?.running_number === "number"
        ? existing.running_number
        : null;
    let buddhistYear =
      typeof existing?.buddhist_year === "number"
        ? existing.buddhist_year
        : null;

    if (!buddhistYear) {
      const { data: series, error: seriesError } = await auth.admin
        .from("document_number_series")
        .select("buddhist_year")
        .eq("code", "ORDER")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (seriesError) throw new Error(seriesError.message);

      buddhistYear =
        Number(series?.buddhist_year || 0) ||
        Number(announcementDate.slice(0, 4)) + 543;
    }

    if (!runningNumber) {
      const { data: latest, error: latestError } = await auth.admin
        .from("announcement_documents")
        .select("running_number")
        .eq("buddhist_year", buddhistYear)
        .order("running_number", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      if (latestError) throw new Error(latestError.message);

      runningNumber = Number(latest?.running_number || 0) + 1;
    }

    if (!announcementNumber) {
      announcementNumber = String(runningNumber);
    }

    let docxMeta = {
      fileId: String(existing?.docx_file_id ?? ""),
      fileUrl: String(existing?.docx_file_url ?? ""),
      fileName: String(existing?.docx_file_name ?? ""),
      mimeType: String(existing?.docx_mime_type ?? ""),
    };
    let pdfMeta = {
      fileId: String(existing?.pdf_file_id ?? ""),
      fileUrl: String(existing?.pdf_file_url ?? ""),
      fileName: String(existing?.pdf_file_name ?? ""),
      mimeType: String(existing?.pdf_mime_type ?? ""),
    };

    if (docx) {
      docxMeta = await uploadFile({
        file: docx,
        kind: "docx",
        announcementId,
        announcementDate,
        buddhistYear,
        announcementNumber,
        subject,
        existingFileId: docxMeta.fileId || null,
      });
    }

    if (pdf) {
      pdfMeta = await uploadFile({
        file: pdf,
        kind: "pdf",
        announcementId,
        announcementDate,
        buddhistYear,
        announcementNumber,
        subject,
        existingFileId: pdfMeta.fileId || null,
      });
    }


    const oldStatus = String(existing?.status ?? "");
    const isRevisionSubmit =
      action === "update" || oldStatus === "REVISION";
    const nextStatus = "PENDING";
    const revisionCount = Number(existing?.revision_count ?? 0);

    const payload = {
      id: announcementId,
      announcement_number: announcementNumber || null,
      running_number: runningNumber,
      buddhist_year: buddhistYear,
      subject,
      announcement_date: announcementDate,
      responsible_user_id: responsible.id,
      responsible_name_snapshot: responsible.full_name,
      status: nextStatus,
      docx_file_id: docxMeta.fileId || null,
      docx_file_url: docxMeta.fileUrl || null,
      docx_file_name: docxMeta.fileName || null,
      docx_mime_type: docxMeta.mimeType || null,
      pdf_file_id: pdfMeta.fileId || null,
      pdf_file_url: pdfMeta.fileUrl || null,
      pdf_file_name: pdfMeta.fileName || null,
      pdf_mime_type: pdfMeta.mimeType || null,
      created_by: existing?.created_by ?? auth.profile.id,
      submitted_by: auth.profile.id,
      submitted_at: now,
      last_file_uploaded_by:
        docx || pdf
          ? auth.profile.id
          : existing?.last_file_uploaded_by ?? null,
      last_file_uploaded_at:
        docx || pdf
          ? now
          : existing?.last_file_uploaded_at ?? null,
      updated_at: now,
    };

    const { data: saved, error: saveError } = await auth.admin
      .from("announcement_documents")
      .upsert(payload)
      .select("*")
      .single();

    if (saveError || !saved) {
      throw new Error(
        saveError?.message || "บันทึกรายการประกาศไม่สำเร็จ"
      );
    }

    const logAction = !existing
      ? "SUBMIT"
      : isRevisionSubmit
      ? "UPDATE_AND_RESUBMIT"
      : "EDIT";

    await auth.admin.from("announcement_document_logs").insert({
      announcement_document_id: saved.id,
      actor_id: auth.profile.id,
      action: logAction,
      from_status: oldStatus || null,
      to_status: nextStatus,
      revision_number: revisionCount,
      note:
        isRevisionSubmit
          ? `อัปเดตและส่งใหม่ ครั้งที่ ${revisionCount}`
          : null,
      file_name:
        [docxMeta.fileName, pdfMeta.fileName]
          .filter(Boolean)
          .join(", ") || null,
    });

    const hasAnnouncementFile = Boolean(docxMeta.fileId || pdfMeta.fileId);

    await notifyAnnouncementSubmittedTelegram({
      announcementId: saved.id,
      applicantProfileId: auth.profile.id,
      applicantName: auth.profile.full_name,
      responsibleProfileId: responsible.id,
      responsibleName: responsible.full_name,
      announcementNumber: saved.announcement_number,
      subject: saved.subject,
      announcementDate: saved.announcement_date,
      revisionCount: Number(saved.revision_count || 0),
    }).catch((telegramError) => {
      console.error("Telegram announcement submitted notification error:", telegramError);
    });

    return NextResponse.json({
      ok: true,
      announcement: saved,
      message: isRevisionSubmit
        ? `อัปเดตและส่งประกาศใหม่ ครั้งที่ ${revisionCount} เรียบร้อยแล้ว`
        : !existing && !hasAnnouncementFile
        ? `สร้างประกาศลำดับที่ ${announcementNumber} เรียบร้อยแล้ว สามารถแนบไฟล์ภายหลังได้`
        : "ส่งประกาศให้ ผอ. พิจารณาเรียบร้อยแล้ว",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "บันทึกรายการประกาศไม่สำเร็จ",
      },
      { status: 500 }
    );
  }
}


export async function DELETE(request: Request) {
  try {
    const auth = await authorizeAnnouncementRequest(request);

    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, message: auth.message },
        { status: auth.status }
      );
    }

    let announcementId = "";

    try {
      const body = (await request.json()) as { announcementId?: unknown };
      announcementId = typeof body.announcementId === "string" ? body.announcementId.trim() : "";
    } catch {
      announcementId = "";
    }

    if (!announcementId) {
      return NextResponse.json(
        { ok: false, message: "ไม่พบรหัสประกาศที่ต้องการลบ" },
        { status: 400 }
      );
    }

    const { data: announcement, error: loadError } = await auth.admin
      .from("announcement_documents")
      .select(
        "id, announcement_number, responsible_user_id, status, docx_file_id, pdf_file_id"
      )
      .eq("id", announcementId)
      .maybeSingle();

    if (loadError || !announcement) {
      return NextResponse.json(
        { ok: false, message: "ไม่พบรายการประกาศ" },
        { status: 404 }
      );
    }

    const manager = isAnnouncementManager(auth.profile.role);
    const ownerCanDelete =
      announcement.responsible_user_id === auth.profile.id &&
      String(announcement.status) === "REVISION";

    if (!manager && !ownerCanDelete) {
      return NextResponse.json(
        { ok: false, message: "ไม่มีสิทธิ์ลบรายการประกาศนี้" },
        { status: 403 }
      );
    }

    const fileIds = [announcement.docx_file_id, announcement.pdf_file_id]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean);

    let fileWarning = "";

    if (fileIds.length > 0) {
      const cfg = getAnnouncementDriveConfig();

      if (!cfg) {
        fileWarning = " แต่ยังไม่ได้ตั้งค่า GAS สำหรับลบไฟล์ประกาศ";
      } else {
        try {
          await callAnnouncementDriveGas(cfg.url, {
            action: "deleteOrderFiles",
            secret: cfg.secret,
            fileIds,
          });
        } catch (error) {
          console.error("delete announcement files error:", error);
          fileWarning = " แต่ย้ายไฟล์ลงถังขยะไม่สำเร็จ กรุณาตรวจ Google Drive";
        }
      }
    }

    const { error: logDeleteError } = await auth.admin
      .from("announcement_document_logs")
      .delete()
      .eq("announcement_document_id", announcementId);

    if (logDeleteError) throw new Error(logDeleteError.message);

    const { error: deleteError } = await auth.admin
      .from("announcement_documents")
      .delete()
      .eq("id", announcementId);

    if (deleteError) throw new Error(deleteError.message);

    const deletedNumber = String(
      announcement.announcement_number ?? "รายการนี้"
    );

    return NextResponse.json({
      ok: true,
      announcementId,
      message: `ลบประกาศลำดับที่ ${deletedNumber} เรียบร้อยแล้ว${fileWarning}`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error ? error.message : "ลบประกาศไม่สำเร็จ",
      },
      { status: 500 }
    );
  }
}
