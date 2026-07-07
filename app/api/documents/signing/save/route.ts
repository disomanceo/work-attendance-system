import { PDFDocument } from "pdf-lib";
import { NextResponse } from "next/server";
import { requireSmartAreaUser } from "@/lib/smart-area/auth";

type SaveBody = {
  bookId?: unknown;
  sourceAttachmentId?: unknown;
  sourceFileName?: unknown;
  sourceMimeType?: unknown;
  sourceFileBase64?: unknown;
  assigneeIds?: unknown;
  assignmentNote?: unknown;
  pageNumber?: unknown;
  overlayBase64?: unknown;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function signingConfig() {
  const url = process.env.SMART_AREA_SIGNING_GAS_URL?.trim();
  const secret = process.env.SMART_AREA_SIGNING_GAS_SECRET?.trim();

  return url && secret ? { url, secret } : null;
}



async function callGas(
  url: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
    redirect: "follow",
  });

  const raw = await response.text();
  let result: Record<string, unknown>;

  try {
    result = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("Google Apps Script ไม่ได้ตอบกลับเป็น JSON");
  }

  if (!response.ok || result.ok !== true) {
    throw new Error(
      typeof result.message === "string"
        ? result.message
        : "Google Apps Script ทำงานไม่สำเร็จ",
    );
  }

  return result;
}



async function handleSigningPost(request: Request) {
  const auth = await requireSmartAreaUser(request);

  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, message: auth.message },
      { status: auth.status },
    );
  }

  const isManager =
    auth.profile.role === "admin" || auth.profile.role === "director";

  if (!isManager) {
    return NextResponse.json(
      { ok: false, message: "คุณไม่มีสิทธิ์ลงนามหนังสือราชการ" },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => null)) as SaveBody | null;
  const bookId = text(body?.bookId);
  const sourceAttachmentId = text(body?.sourceAttachmentId);
  const sourceFileName = text(body?.sourceFileName);
  const sourceMimeType = text(body?.sourceMimeType);
  const sourceFileBase64 = text(body?.sourceFileBase64);
  const assigneeIds = stringArray(body?.assigneeIds);
  const assignmentNote = text(body?.assignmentNote);
  const requestedPageNumber = Number(body?.pageNumber || 1);
  const overlayBase64 = text(body?.overlayBase64);

  if (!bookId || (!sourceAttachmentId && !sourceFileBase64)) {
    return NextResponse.json(
      { ok: false, message: "ข้อมูลหนังสือหรือไฟล์ต้นฉบับไม่ครบถ้วน" },
      { status: 400 },
    );
  }

  if (assigneeIds.length === 0) {
    return NextResponse.json(
      { ok: false, message: "กรุณาเลือกผู้รับมอบหมายอย่างน้อย 1 คน" },
      { status: 400 },
    );
  }

  if (!overlayBase64) {
    return NextResponse.json(
      { ok: false, message: "ไม่พบข้อมูลลายเซ็นหรือข้อความบนเอกสาร" },
      { status: 400 },
    );
  }

  const signing = signingConfig();

  if (!signing) {
    return NextResponse.json(
      { ok: false, message: "ยังตั้งค่าระบบลงนามไม่ครบถ้วน" },
      { status: 500 },
    );
  }

  const [{ data: book, error: bookError }, { data: attachment, error: attachmentError }, { data: signer, error: signerError }] =
    await Promise.all([
      auth.admin
        .from("smart_area_books")
        .select("id, legacy_smart_area_id, registration_number, subject, status")
        .eq("id", bookId)
        .eq("is_active", true)
        .maybeSingle(),
      sourceFileBase64
        ? Promise.resolve({ data: null, error: null })
        : auth.admin
        .from("smart_area_attachments")
        .select("id, book_id, drive_file_id, source_url, file_url, file_name, mime_type")
        .eq("id", sourceAttachmentId)
        .eq("book_id", bookId)
        .eq("is_active", true)
        .eq("status", "active")
        .maybeSingle(),
      auth.admin
        .from("profiles")
        .select("id, full_name, signature_file_id")
        .eq("id", auth.profile.id)
        .maybeSingle(),
    ]);

  if (
    bookError ||
    !book ||
    attachmentError ||
    (!sourceFileBase64 && !attachment)
  ) {
    return NextResponse.json(
      { ok: false, message: "ไม่พบหนังสือหรือไฟล์ต้นฉบับ" },
      { status: 404 },
    );
  }

  if (signerError || !signer) {
    return NextResponse.json(
      { ok: false, message: "ไม่พบข้อมูลผู้ลงนาม" },
      { status: 400 },
    );
  }

  const { data: existingSignedRows, error: existingSignedError } =
    await auth.admin
      .from("smart_area_attachments")
      .select("id, drive_file_id, file_url, file_name, updated_at")
      .eq("book_id", bookId)
      .eq("attachment_type", "signed")
      .eq("is_active", true)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(10);

  if (existingSignedError) {
    console.error("Load existing signed attachment error:", existingSignedError);
    return NextResponse.json(
      { ok: false, message: "ไม่สามารถตรวจสอบไฟล์แจ้งมอบหมายเดิมได้" },
      { status: 500 },
    );
  }

  const existingSigned = existingSignedRows?.[0] ?? null;

    let sourceBase64 = sourceFileBase64;
  let resolvedSourceMimeType = sourceMimeType;
  let resolvedSourceFileName = sourceFileName;

  if (!sourceBase64) {
    const sourceResult = await callGas(signing.url, {
      secret: signing.secret,
      action: "getFile",
      driveFileId: attachment?.drive_file_id || "",
      sourceUrl: attachment?.file_url || attachment?.source_url || "",
    });

    sourceBase64 =
      typeof sourceResult.base64 === "string" ? sourceResult.base64 : "";
    resolvedSourceMimeType =
      typeof sourceResult.mimeType === "string"
        ? sourceResult.mimeType
        : attachment?.mime_type || "";
    resolvedSourceFileName = attachment?.file_name || "";
  }

  if (!sourceBase64) {
    return NextResponse.json(
      { ok: false, message: "ไม่สามารถอ่านไฟล์ที่เลือกเพื่อลงนามได้" },
      { status: 502 },
    );
  }

  const normalizedMimeType = resolvedSourceMimeType.toLowerCase();
  const sourceBytes = Buffer.from(sourceBase64, "base64");
  let pdf: PDFDocument;

  if (
    normalizedMimeType.includes("pdf") ||
    resolvedSourceFileName.toLowerCase().endsWith(".pdf")
  ) {
    pdf = await PDFDocument.load(sourceBytes);
  } else if (
    normalizedMimeType.includes("png") ||
    resolvedSourceFileName.toLowerCase().endsWith(".png")
  ) {
    pdf = await PDFDocument.create();
    const image = await pdf.embedPng(sourceBytes);
    const page = pdf.addPage([image.width, image.height]);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: image.width,
      height: image.height,
    });
  } else if (
    normalizedMimeType.includes("jpeg") ||
    normalizedMimeType.includes("jpg") ||
    /\.(jpe?g)$/i.test(resolvedSourceFileName)
  ) {
    pdf = await PDFDocument.create();
    const image = await pdf.embedJpg(sourceBytes);
    const page = pdf.addPage([image.width, image.height]);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: image.width,
      height: image.height,
    });
  } else {
    return NextResponse.json(
      {
        ok: false,
        message: "รองรับเฉพาะไฟล์ PDF, PNG, JPG และ JPEG",
      },
      { status: 400 },
    );
  }
  const pages = pdf.getPages();
  const pageIndex = Math.min(
    Math.max(Math.floor(requestedPageNumber) - 1, 0),
    pages.length - 1,
  );
  const page = pages[pageIndex];

  const overlayBytes = Buffer.from(overlayBase64, "base64");
  const overlayImage = await pdf.embedPng(overlayBytes);
  const { width: pageWidth, height: pageHeight } = page.getSize();

  page.drawImage(overlayImage, {
    x: 0,
    y: 0,
    width: pageWidth,
    height: pageHeight,
  });

  const signedBytes = await pdf.save();
  const safeRegistration =
    text(book.registration_number).replace(/[\\/:*?"<>|#%{}~&]/g, "-") ||
    text(book.legacy_smart_area_id) ||
    book.id;
  const fileName = `แจ้งมอบหมาย-${safeRegistration}.pdf`;

  const uploadResult = await callGas(signing.url, {
    secret: signing.secret,
    action: "uploadSigned",
    bookId,
    signedBy: signer.id,
    fileName,
    replaceFileId: existingSigned?.drive_file_id || "",
    mimeType: "application/pdf",
    base64: Buffer.from(signedBytes).toString("base64"),
  });

  const driveFileId =
    typeof uploadResult.fileId === "string" ? uploadResult.fileId : "";
  const fileUrl =
    typeof uploadResult.fileUrl === "string" ? uploadResult.fileUrl : "";

  if (!driveFileId) {
    return NextResponse.json(
      { ok: false, message: "Signing API ไม่คืนรหัสไฟล์ฉบับลงนาม" },
      { status: 502 },
    );
  }

  if (existingSigned) {
    const { error: updateSignedError } = await auth.admin
      .from("smart_area_attachments")
      .update({
        file_url: fileUrl || existingSigned.file_url || null,
        drive_file_id: driveFileId,
        file_name: fileName,
        mime_type: "application/pdf",
        file_order: 0,
        status: "active",
        is_active: true,
        legacy_payload: {
          source: "work-attendance-signing",
          signed_by: signer.id,
          signed_by_name: signer.full_name || "",
          signed_page: pageIndex + 1,
          overlay_mode: "manual-placement",
          replaced_existing_file: true,
        },
        updated_by: signer.id,
      })
      .eq("id", existingSigned.id);

    if (updateSignedError) {
      console.error("Update signed attachment error:", updateSignedError);
      return NextResponse.json(
        {
          ok: false,
          message:
            "อัปเดตไฟล์แล้ว แต่ไม่สามารถบันทึกรายการแจ้งมอบหมายเดิมได้",
        },
        { status: 500 },
      );
    }

    const duplicateIds = (existingSignedRows ?? [])
      .slice(1)
      .map((row) => row.id)
      .filter(Boolean);

    if (duplicateIds.length > 0) {
      const { error: duplicateCleanupError } = await auth.admin
        .from("smart_area_attachments")
        .update({
          status: "history",
          is_active: false,
          removed_at: new Date().toISOString(),
          removed_by: signer.id,
          removed_reason: "Replaced by the current signed assignment file",
          updated_by: signer.id,
        })
        .in("id", duplicateIds);

      if (duplicateCleanupError) {
        console.error(
          "Deactivate duplicate signed attachments error:",
          duplicateCleanupError,
        );
      }
    }
  } else {
    const { error: insertError } = await auth.admin
      .from("smart_area_attachments")
      .insert({
        book_id: bookId,
        legacy_smart_area_id: book.legacy_smart_area_id,
        legacy_sheet_row: 0,
        legacy_attachment_key: `signed:${bookId}`,
        source_url: null,
        file_url: fileUrl || null,
        drive_file_id: driveFileId,
        file_name: fileName,
        mime_type: "application/pdf",
        file_order: 0,
        attachment_type: "signed",
        status: "active",
        is_active: true,
        legacy_payload: {
          source: "work-attendance-signing",
          signed_by: signer.id,
          signed_by_name: signer.full_name || "",
          signed_page: pageIndex + 1,
          overlay_mode: "manual-placement",
          replaced_existing_file: false,
        },
        created_by: signer.id,
        updated_by: signer.id,
      });

    if (insertError) {
      console.error("Insert signed attachment error:", insertError);
      return NextResponse.json(
        {
          ok: false,
          message:
            "อัปโหลดไฟล์แล้ว แต่ไม่สามารถบันทึกรายการแจ้งมอบหมายในฐานข้อมูลได้",
        },
        { status: 500 },
      );
    }
  }

  const { data: assignmentData, error: assignmentError } = await auth.admin.rpc(
    "replace_smart_area_assignments",
    {
      p_book_id: bookId,
      p_actor_id: signer.id,
      p_assignee_ids: assigneeIds,
      p_assignment_note: assignmentNote || null,
      p_allowed: true,
    },
  );

  if (assignmentError) {
    console.error("Assign after signing error:", assignmentError);
    return NextResponse.json(
      {
        ok: false,
        message:
          "บันทึกฉบับลงนามแล้ว แต่ไม่สามารถบันทึกผู้รับมอบหมายได้",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    bookId,
    signedAttachment: {
      driveFileId,
      fileUrl,
      fileName,
    },
    assignment: Array.isArray(assignmentData) ? assignmentData[0] : null,
  });
}
export async function POST(request: Request) {
  try {
    return await handleSigningPost(request);
  } catch (error) {
    console.error("Signing save route error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "เกิดข้อผิดพลาดภายในระบบบันทึกลงนาม",
      },
      { status: 500 },
    );
  }
}
