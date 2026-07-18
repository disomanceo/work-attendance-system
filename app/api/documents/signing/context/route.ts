import { NextResponse } from "next/server";
import {
  requireSmartAreaUser,
  isSmartAreaManagerRole,
} from "@/lib/smart-area/auth";
import {
  smartAreaPayloadDocumentDate,
  smartAreaPayloadReceivedDate,
} from "@/lib/smart-area/document-date";

export const dynamic = "force-dynamic";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function fileOpenUrl(attachment: {
  drive_file_id?: unknown;
  file_url?: unknown;
  source_url?: unknown;
}) {
  const driveFileId = text(attachment.drive_file_id);

  if (driveFileId) {
    return `https://drive.google.com/file/d/${encodeURIComponent(
      driveFileId,
    )}/view`;
  }

  return text(attachment.file_url) || text(attachment.source_url) || "";
}

export async function GET(request: Request) {
  const auth = await requireSmartAreaUser(request);

  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, message: auth.message },
      { status: auth.status },
    );
  }

  const isManager = isSmartAreaManagerRole(auth.profile.role);

  if (!isManager) {
    return NextResponse.json(
      { ok: false, message: "คุณไม่มีสิทธิ์ลงนามหนังสือราชการ" },
      { status: 403 },
    );
  }

  const bookId = new URL(request.url).searchParams.get("bookId")?.trim() || "";

  if (!bookId) {
    return NextResponse.json(
      { ok: false, message: "ไม่พบรหัสหนังสือราชการ" },
      { status: 400 },
    );
  }

  const [{ data: book, error: bookError }, { data: profile, error: profileError }] =
    await Promise.all([
      auth.admin
        .from("smart_area_books")
        .select(`
          id,
          registration_number,
          received_date,
          source_agency,
          subject,
          document_number,
          document_date,
          document_type,
          urgency,
          status,
          director_note,
          legacy_payload,
          smart_area_attachments (
            id,
            drive_file_id,
            source_url,
            file_url,
            file_name,
            mime_type,
            file_order,
            attachment_type,
            status,
            is_active
          ),
          smart_area_tasks (
            id,
            assignee_id,
            assignee_name_snapshot,
            requires_training_report,
            status,
            is_active
          )
        `)
        .eq("id", bookId)
        .eq("is_active", true)
        .maybeSingle(),
      auth.admin
        .from("profiles")
        .select("id, full_name, position, signature_file_id")
        .eq("id", auth.profile.id)
        .maybeSingle(),
    ]);

  if (bookError || !book) {
    return NextResponse.json(
      { ok: false, message: "ไม่พบหนังสือราชการ" },
      { status: 404 },
    );
  }

  if (profileError || !profile) {
    return NextResponse.json(
      { ok: false, message: "ไม่พบข้อมูลผู้ลงนาม" },
      { status: 404 },
    );
  }

  const attachments = (book.smart_area_attachments ?? [])
    .filter((item: any) => item.is_active && item.status === "active")
    .sort(
      (left: any, right: any) =>
        Number(left.file_order || 0) - Number(right.file_order || 0),
    );

  const sourceAttachment =
    attachments.find((item: any) => item.attachment_type === "original") ||
    attachments[0] ||
    null;

  if (!sourceAttachment) {
    return NextResponse.json(
      { ok: false, message: "หนังสือรายการนี้ไม่มีไฟล์ต้นฉบับ" },
      { status: 400 },
    );
  }

  const { data: assignees, error: assigneeError } = await auth.admin
    .from("profiles")
    .select("id, full_name, position, role")
    .eq("account_status", "active")
    .not("phone", "like", "deleted:%")
    .order("full_name", { ascending: true });

  if (assigneeError) {
    return NextResponse.json(
      { ok: false, message: "ไม่สามารถโหลดรายชื่อผู้รับมอบหมายได้" },
      { status: 500 },
    );
  }

  const documentDate =
    book.document_date || smartAreaPayloadDocumentDate(book.legacy_payload) || "";
  const receivedDate =
    book.received_date ||
    smartAreaPayloadReceivedDate(book.legacy_payload) ||
    documentDate;

  return NextResponse.json({
    ok: true,
    book: {
      id: book.id,
      registrationNumber: book.registration_number || "",
      receivedDate,
      sourceAgency: book.source_agency || "",
      subject: book.subject || "",
      documentNumber: book.document_number || "",
      documentDate,
      documentType: book.document_type || "",
      urgency: book.urgency || "",
      status: book.status || "",
      directorNote: book.director_note || "",
      tasks: (book.smart_area_tasks ?? [])
        .filter((item: any) => item.is_active)
        .map((item: any) => ({
          id: item.id,
          assigneeId: item.assignee_id,
          assigneeName: item.assignee_name_snapshot || "",
          requiresTrainingReport: item.requires_training_report === true,
          status: item.status,
        })),
    },
    sourceAttachment: {
      id: sourceAttachment.id,
      fileName: sourceAttachment.file_name || "document.pdf",
      mimeType: sourceAttachment.mime_type || "application/pdf",
      driveFileId: sourceAttachment.drive_file_id || "",
      sourceUrl:
        sourceAttachment.file_url || sourceAttachment.source_url || "",
      openUrl: fileOpenUrl(sourceAttachment),
    },
    signer: {
      id: profile.id,
      fullName: profile.full_name || "",
      position: profile.position || "",
      signatureFileId: profile.signature_file_id || "",
    },
    assignees: (assignees ?? []).map((item: any) => ({
      id: item.id,
      fullName: item.full_name || "",
      position: item.position || "",
      role: item.role || "",
    })),
  });
}
