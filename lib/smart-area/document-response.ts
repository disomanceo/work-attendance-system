import {
  smartAreaPayloadDocumentDate,
  smartAreaPayloadReceivedDate,
} from "@/lib/smart-area/document-date";
import {
  smartAreaPayloadOrder,
  smartAreaPayloadPage,
} from "@/lib/smart-area/source-order";

export const SMART_AREA_DOCUMENT_SELECT = `
  id,
  is_active,
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
    created_at,
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
`;

export function smartAreaText(value: unknown) {
  return String(value ?? "").trim();
}

function fileOpenUrl(attachment: {
  id?: unknown;
  attachment_type?: unknown;
  drive_file_id?: unknown;
  file_url?: unknown;
  source_url?: unknown;
}) {
  const driveFileId = smartAreaText(attachment.drive_file_id);

  if (driveFileId) {
    return `https://drive.google.com/file/d/${encodeURIComponent(
      driveFileId,
    )}/view`;
  }

  if (
    smartAreaText(attachment.id) &&
    smartAreaText(attachment.attachment_type) !== "signed"
  ) {
    return `/api/documents/attachments/${encodeURIComponent(
      smartAreaText(attachment.id),
    )}/download`;
  }

  return (
    smartAreaText(attachment.file_url) ||
    smartAreaText(attachment.source_url) ||
    ""
  );
}

export function serializeSmartAreaBook(
  book: any,
  options: {
    canManageAll: boolean;
    profileId: string;
    readBookIds: Set<string>;
  },
) {
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
    smartAreaPage: smartAreaPayloadPage(book.legacy_payload),
    smartAreaOrder: smartAreaPayloadOrder(
      book.legacy_payload,
      book.registration_number,
    ),
    sourceUrl:
      book.legacy_payload?.source_url ||
      book.legacy_payload?.raw?.sourceUrl ||
      "",
    updatedAt: book.updated_at,
    isRead: options.readBookIds.has(smartAreaText(book.id)),
    tasks: (book.smart_area_tasks ?? [])
      .filter((task: any) => task.is_active)
      .filter(
        (task: any) =>
          options.canManageAll || task.assignee_id === options.profileId,
      )
      .map((task: any) => ({
        id: task.id,
        assigneeId: task.assignee_id,
        assigneeName: task.assignee_name_snapshot || "",
        status: task.status,
        assignmentOpenedAt: task.assignment_opened_at || "",
        assignmentAcknowledgedAt: task.assignment_acknowledged_at || "",
        assignedAt: task.created_at || "",
      })),
    attachments: (book.smart_area_attachments ?? [])
      .filter((attachment: any) => attachment.is_active)
      .filter((attachment: any) => attachment.status === "active")
      .sort(
        (left: any, right: any) =>
          Number(left.file_order || 0) - Number(right.file_order || 0),
      )
      .map((attachment: any) => ({
        id: attachment.id,
        fileName: attachment.file_name || "ไฟล์แนบ",
        mimeType: attachment.mime_type || "",
        attachmentType: attachment.attachment_type,
        openUrl: fileOpenUrl(attachment),
        hasDriveFile: Boolean(smartAreaText(attachment.drive_file_id)),
      })),
  };
}
