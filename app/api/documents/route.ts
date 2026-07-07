import { NextResponse } from "next/server";
import { requireSmartAreaUser } from "@/lib/smart-area/auth";
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
      { ok: false, books: [], message: auth.message },
      { status: auth.status },
    );
  }

  const isManager =
    auth.profile.role === "admin" || auth.profile.role === "director";
  const isClerk = auth.profile.work_permissions.includes("smart_area.clerk");
  const workspaceMode = isManager
    ? "manager"
    : isClerk
      ? "clerk"
      : "member";

  let visibleBookIds: string[] | null = null;

  if (!auth.canManageAll) {
    const { data: taskRows, error: taskError } = await auth.admin
      .from("smart_area_tasks")
      .select("book_id")
      .eq("assignee_id", auth.profile.id)
      .eq("is_active", true);

    if (taskError) {
      console.error("Load Smart Area task visibility error:", taskError);
      return NextResponse.json(
        {
          ok: false,
          books: [],
          message: "ไม่สามารถตรวจสอบรายการงานที่ได้รับมอบหมายได้",
        },
        { status: 500 },
      );
    }

    visibleBookIds = Array.from(
      new Set((taskRows ?? []).map((row) => text(row.book_id)).filter(Boolean)),
    );

    if (visibleBookIds.length === 0) {
      return NextResponse.json({
        ok: true,
        books: [],
        accessMode: "assigned",
        canManageAll: false,
        workspaceMode,
        capabilities: {
          canSubmit: false,
          canAssign: false,
          canClose: false,
        },
      });
    }
  }

  let query = auth.admin
    .from("smart_area_books")
    .select(`
      id,
      legacy_smart_area_id,
      registration_number,
      received_date,
      source_agency,
      subject,
      document_number,
      document_date,
      document_type,
      urgency,
      status,
      note,
      director_note,
      legacy_payload,
      updated_at,
      smart_area_tasks (
        id,
        assignee_id,
        assignee_name_snapshot,
        status,
        assignment_opened_at,
        assignment_acknowledged_at,
        is_active
      ),
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
      )
    `)
    .eq("is_active", true)
    .order("received_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (visibleBookIds) query = query.in("id", visibleBookIds);

  const { data, error } = await query;

  if (error) {
    console.error("Load Smart Area books error:", error);
    return NextResponse.json(
      { ok: false, books: [], message: "ไม่สามารถโหลดรายการหนังสือราชการได้" },
      { status: 500 },
    );
  }

  const { data: readRows, error: readError } = await auth.admin
    .from("smart_area_book_reads")
    .select("book_id")
    .eq("user_id", auth.profile.id);

  if (readError) {
    console.error("Load Smart Area read status error:", readError);
  }

  const readBookIds = new Set(
    (readRows ?? []).map((row) => text(row.book_id)).filter(Boolean),
  );

  const books = (data ?? []).map((book: any) => {
    const documentDate =
      book.document_date || smartAreaPayloadDocumentDate(book.legacy_payload) || "";
    const receivedDate =
      book.received_date ||
      smartAreaPayloadReceivedDate(book.legacy_payload) ||
      documentDate;

    return {
      id: book.id,
      legacySmartAreaId: book.legacy_smart_area_id,
      registrationNumber: book.registration_number || "",
      receivedDate,
    sourceAgency: book.source_agency || "",
    subject: book.subject,
    documentNumber: book.document_number || "",
    documentDate,
    documentType: book.document_type || "",
    urgency: book.urgency || "",
    status: book.status,
    note: book.note || "",
    directorNote: book.director_note || "",
    smartAreaPage: Number(
      book.legacy_payload?.smart_area_page ||
        book.legacy_payload?.raw?.smartAreaPage ||
        0,
    ),
    smartAreaOrder: Number(
      book.legacy_payload?.raw?.rowOrder ||
        book.legacy_payload?.raw?.order ||
        book.registration_number ||
        0,
    ),
    sourceUrl:
      book.legacy_payload?.source_url ||
      book.legacy_payload?.raw?.sourceUrl ||
      "",
    updatedAt: book.updated_at,
    isRead: readBookIds.has(text(book.id)),
    tasks: (book.smart_area_tasks ?? [])
      .filter((task: any) => task.is_active)
      .filter(
        (task: any) =>
          auth.canManageAll || task.assignee_id === auth.profile.id,
      )
      .map((task: any) => ({
        id: task.id,
        assigneeId: task.assignee_id,
        assigneeName: task.assignee_name_snapshot || "",
        status: task.status,
        assignmentOpenedAt: task.assignment_opened_at || "",
        assignmentAcknowledgedAt: task.assignment_acknowledged_at || "",
      })),
    attachments: (() => {
      const activeAttachments = (book.smart_area_attachments ?? [])
        .filter((attachment: any) => attachment.is_active)
        .filter((attachment: any) => attachment.status === "active");

      const signedAttachment = activeAttachments
        .filter((attachment: any) => attachment.attachment_type === "signed")
        .sort(
          (a: any, b: any) =>
            new Date(b.updated_at || b.created_at || 0).getTime() -
            new Date(a.updated_at || a.created_at || 0).getTime(),
        )
        .slice(0, 1);

      const originalAttachments = activeAttachments
        .filter((attachment: any) => attachment.attachment_type !== "signed")
        .sort(
          (a: any, b: any) =>
            Number(a.file_order || 0) - Number(b.file_order || 0),
        );

      return [...signedAttachment, ...originalAttachments].map(
        (attachment: any) => ({
          id: attachment.id,
          fileName: attachment.file_name || "ไฟล์แนบ",
          mimeType: attachment.mime_type || "",
          attachmentType: attachment.attachment_type,
          openUrl: fileOpenUrl(attachment),
          hasDriveFile: Boolean(text(attachment.drive_file_id)),
        }),
      );
      })(),
    };
  });

  return NextResponse.json({
    ok: true,
    books,
    accessMode: auth.canManageAll ? "all" : "assigned",
    canManageAll: auth.canManageAll,
    workspaceMode,
    capabilities: {
      canSubmit: isManager || isClerk,
      canAssign: isManager,
      canClose: isManager || isClerk,
    },
  });
}
