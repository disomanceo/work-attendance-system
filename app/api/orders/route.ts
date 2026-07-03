import { NextResponse } from "next/server";
import { issueDocumentNumber } from "@/lib/document-numbers";
import {
  authorizeOrderRequest,
  isOrderManager,
} from "@/lib/order-auth";
import {
  callOrderDriveGas,
  getOrderDriveConfig,
} from "@/lib/order-drive-gas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const DOCX_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PDF_TYPE = "application/pdf";

type OrderAction = "submit" | "update";

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("วันที่คำสั่งไม่ถูกต้อง");
  }

  return value;
}

function normalizeAction(value: FormDataEntryValue | null): OrderAction {
  return value === "update" ? "update" : "submit";
}

function validateFile(file: File | null, kind: "docx" | "pdf") {
  if (!file || file.size === 0) return;

  if (file.size > MAX_FILE_SIZE) {
    throw new Error("ไฟล์แต่ละไฟล์ต้องไม่เกิน 20 MB");
  }

  const allowed = kind === "docx" ? DOCX_TYPE : PDF_TYPE;

  if (file.type !== allowed) {
    throw new Error(
      kind === "docx"
        ? "ไฟล์ DOCX ไม่ถูกต้อง"
        : "ไฟล์ PDF ไม่ถูกต้อง"
    );
  }
}

async function uploadFile(input: {
  file: File;
  kind: "docx" | "pdf";
  orderId: string;
  buddhistYear: number;
  orderNumber: string;
  subject: string;
  existingFileId?: string | null;
}) {
  const cfg = getOrderDriveConfig();

  if (!cfg) {
    throw new Error(
      "ยังไม่ได้ตั้งค่า GAS_ORDER_FILES_URL และ GAS_ORDER_FILES_SECRET"
    );
  }

  const base64 = Buffer.from(
    await input.file.arrayBuffer()
  ).toString("base64");

  const result = await callOrderDriveGas(cfg.url, {
    action: input.existingFileId
      ? "replaceOrderFile"
      : "uploadOrderFile",
    secret: cfg.secret,
    fileId: input.existingFileId ?? "",
    orderId: input.orderId,
    buddhistYear: input.buddhistYear,
    orderNumber: input.orderNumber,
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
    const auth = await authorizeOrderRequest(request);

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

    let query = auth.admin
      .from("order_documents")
      .select("*")
      .order("order_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (search) {
      query = query.or(
        `order_number.ilike.%${search}%,subject.ilike.%${search}%`
      );
    }

    if (status !== "all") query = query.eq("status", status);
    if (year > 0) query = query.eq("buddhist_year", year);
    if (responsibleId) {
      query = query.eq("responsible_user_id", responsibleId);
    }

    const [{ data, error }, { data: orderSeries, error: seriesError }] =
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
      orders: data ?? [],
      configuredYear: orderSeries?.buddhist_year ?? null,
      currentProfile: auth.profile,
      canManageAll: isOrderManager(auth.profile.role),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "โหลดทะเบียนคำสั่งไม่สำเร็จ",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authorizeOrderRequest(request);

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
    const orderDate = validDate(String(form.get("orderDate") ?? ""));
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
      !isOrderManager(auth.profile.role) &&
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
        .from("order_documents")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error || !data) {
        return NextResponse.json(
          { ok: false, message: "ไม่พบรายการคำสั่ง" },
          { status: 404 }
        );
      }

      existing = data;

      const canEdit =
        isOrderManager(auth.profile.role) ||
        data.responsible_user_id === auth.profile.id;

      if (!canEdit) {
        return NextResponse.json(
          { ok: false, message: "ไม่มีสิทธิ์แก้ไขรายการนี้" },
          { status: 403 }
        );
      }

      if (
        !isOrderManager(auth.profile.role) &&
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

    const orderId = id || crypto.randomUUID();
    let orderNumber = String(existing?.order_number ?? "");
    let runningNumber =
      typeof existing?.running_number === "number"
        ? existing.running_number
        : null;
    let buddhistYear =
      typeof existing?.buddhist_year === "number"
        ? existing.buddhist_year
        : null;
    let issueId = String(
      existing?.document_number_issue_id ?? ""
    ) || null;

    if (!orderNumber) {
      const issued = await issueDocumentNumber(auth.admin, {
        seriesCode: "ORDER",
        documentType: "ORDER",
        referenceId: orderId,
        issuedBy: auth.profile.id,
        metadata: {
          subject,
          responsibleUserId,
          orderDate,
        },
      });

      orderNumber = issued.formattedNumber;
      runningNumber = issued.runningNumber;
      buddhistYear = issued.buddhistYear;
      issueId = issued.issueId;
    }

    if (!buddhistYear) {
      buddhistYear = Number(orderDate.slice(0, 4)) + 543;
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
        orderId,
        buddhistYear,
        orderNumber,
        subject,
        existingFileId: docxMeta.fileId || null,
      });
    }

    if (pdf) {
      pdfMeta = await uploadFile({
        file: pdf,
        kind: "pdf",
        orderId,
        buddhistYear,
        orderNumber,
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
      id: orderId,
      document_number_issue_id: issueId,
      order_number: orderNumber || null,
      running_number: runningNumber,
      buddhist_year: buddhistYear,
      subject,
      order_date: orderDate,
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
      .from("order_documents")
      .upsert(payload)
      .select("*")
      .single();

    if (saveError || !saved) {
      throw new Error(
        saveError?.message || "บันทึกรายการคำสั่งไม่สำเร็จ"
      );
    }

    const logAction = !existing
      ? "SUBMIT"
      : isRevisionSubmit
      ? "UPDATE_AND_RESUBMIT"
      : "EDIT";

    await auth.admin.from("order_document_logs").insert({
      order_document_id: saved.id,
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

    const hasOrderFile = Boolean(docxMeta.fileId || pdfMeta.fileId);

    return NextResponse.json({
      ok: true,
      order: saved,
      message: isRevisionSubmit
        ? `อัปเดตและส่งใหม่ ครั้งที่ ${revisionCount} เรียบร้อยแล้ว`
        : !existing && !hasOrderFile
        ? `จองเลขคำสั่ง ${orderNumber} เรียบร้อยแล้ว สามารถแนบไฟล์ภายหลังได้`
        : "ส่งคำสั่งให้ผู้บริหารพิจารณาเรียบร้อยแล้ว",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "บันทึกรายการคำสั่งไม่สำเร็จ",
      },
      { status: 500 }
    );
  }
}


export async function DELETE(request: Request) {
  try {
    const auth = await authorizeOrderRequest(request);

    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, message: auth.message },
        { status: auth.status }
      );
    }

    let orderId = "";

    try {
      const body = (await request.json()) as { orderId?: unknown };
      orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
    } catch {
      orderId = "";
    }

    if (!orderId) {
      return NextResponse.json(
        { ok: false, message: "ไม่พบรหัสคำสั่งที่ต้องการลบ" },
        { status: 400 }
      );
    }

    const { data: order, error: loadError } = await auth.admin
      .from("order_documents")
      .select(
        "id, order_number, responsible_user_id, status, docx_file_id, pdf_file_id"
      )
      .eq("id", orderId)
      .maybeSingle();

    if (loadError || !order) {
      return NextResponse.json(
        { ok: false, message: "ไม่พบรายการคำสั่ง" },
        { status: 404 }
      );
    }

    const manager = isOrderManager(auth.profile.role);
    const ownerCanDelete =
      order.responsible_user_id === auth.profile.id &&
      String(order.status) === "REVISION";

    if (!manager && !ownerCanDelete) {
      return NextResponse.json(
        { ok: false, message: "ไม่มีสิทธิ์ลบรายการคำสั่งนี้" },
        { status: 403 }
      );
    }

    const fileIds = [order.docx_file_id, order.pdf_file_id]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean);

    // Reset the order, its logs, the issued TEST number, and the series counter
    // in one database transaction. The RPC rejects LIVE series automatically.
    const { data: resetResult, error: resetError } = await auth.admin.rpc(
      "reset_test_order",
      { p_order_id: orderId }
    );

    if (resetError) {
      const message = String(resetError.message ?? "");
      const status = message.includes("LIVE") ? 409 : 500;

      return NextResponse.json(
        {
          ok: false,
          message:
            message || "รีเซ็ตรายการคำสั่งและเลขเอกสารไม่สำเร็จ",
        },
        { status }
      );
    }

    let fileWarning = "";

    if (fileIds.length > 0) {
      const cfg = getOrderDriveConfig();

      if (!cfg) {
        fileWarning = " แต่ยังไม่ได้ตั้งค่า GAS สำหรับลบไฟล์คำสั่ง";
      } else {
        try {
          await callOrderDriveGas(cfg.url, {
            action: "deleteOrderFiles",
            secret: cfg.secret,
            fileIds,
          });
        } catch (error) {
          console.error("deleteOrderFiles error:", error);
          fileWarning = " แต่ย้ายไฟล์ลงถังขยะไม่สำเร็จ กรุณาตรวจ Google Drive";
        }
      }
    }

    const reset =
      resetResult && typeof resetResult === "object"
        ? (resetResult as Record<string, unknown>)
        : {};
    const deletedNumber = String(
      reset.deleted_number ?? order.order_number ?? "รายการนี้"
    );

    return NextResponse.json({
      ok: true,
      orderId,
      reset,
      message: `ลบคำสั่ง ${deletedNumber} และคืนเลขทดสอบเรียบร้อยแล้ว${fileWarning}`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error ? error.message : "ลบคำสั่งไม่สำเร็จ",
      },
      { status: 500 }
    );
  }
}
