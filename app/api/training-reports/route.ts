import { NextResponse } from "next/server";
import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from "firebase/firestore";
import { requireSmartAreaUser } from "@/lib/smart-area/auth";
import {
  getTrainingReportFirebaseClient,
  isTrainingReportFirebaseConfigured,
  TRAINING_REPORTS_COLLECTION,
} from "@/lib/training-reports/firebase";
import {
  buddhistYearFromDate,
  isoNow,
  sanitizeDriveSegment,
  text,
  validDate,
} from "@/lib/training-reports/format";
import {
  createTrainingReportPdf,
  uploadTrainingReportFile,
} from "@/lib/training-reports/drive-gas";
import type {
  TrainingReport,
  TrainingReportAttachment,
  TrainingReportMode,
  TrainingReportSource,
  TrainingReportStatus,
} from "@/lib/training-reports/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_FILE_SIZE = 30 * 1024 * 1024;
const PHOTO_SLOTS = [
  { slotIndex: 1, slotKey: "training_photo_1", slotLabel: "รูปการอบรม" },
  { slotIndex: 2, slotKey: "training_photo_2", slotLabel: "รูปการอบรม" },
  { slotIndex: 3, slotKey: "certificate_photo", slotLabel: "รูปใบประกาศ" },
  { slotIndex: 4, slotKey: "registration_photo", slotLabel: "รูปใบลงทะเบียน" },
];

function iso(value: unknown) {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof value === "string") return value;
  return "";
}

function numberValue(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) && next >= 0 ? next : 0;
}

function arrayAttachments(value: unknown): TrainingReportAttachment[] {
  if (!Array.isArray(value)) return [];

  const attachments: TrainingReportAttachment[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const data = item as Record<string, unknown>;
    const fileId = text(data.fileId);
    const fileUrl = text(data.fileUrl);
    const fileName = text(data.fileName);
    if (!fileId && !fileUrl && !fileName) continue;

    const attachmentKind = text(data.attachmentKind);
    attachments.push({
      fileId,
      fileUrl,
      fileName,
      mimeType: text(data.mimeType, "application/octet-stream"),
      fileSize: numberValue(data.fileSize),
      uploadedAt: text(data.uploadedAt),
      ...(attachmentKind
        ? {
            attachmentKind:
              attachmentKind as TrainingReportAttachment["attachmentKind"],
          }
        : {}),
      ...(numberValue(data.slotIndex)
        ? { slotIndex: numberValue(data.slotIndex) }
        : {}),
      ...(text(data.slotKey) ? { slotKey: text(data.slotKey) } : {}),
      ...(text(data.slotLabel) ? { slotLabel: text(data.slotLabel) } : {}),
    });
  }

  return attachments;
}

function parseExistingAttachments(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return [];

  try {
    return arrayAttachments(JSON.parse(value));
  } catch {
    return [];
  }
}

function findPdfAttachment(attachments: TrainingReportAttachment[]) {
  return attachments.find(
    (attachment) =>
      attachment.attachmentKind === "pdf" ||
      attachment.mimeType === "application/pdf" ||
      attachment.fileName.toLowerCase().endsWith(".pdf"),
  );
}

async function loadDirectorName(
  auth: Awaited<ReturnType<typeof requireSmartAreaUser>>,
) {
  if (!auth.ok) return "";

  const { data } = await auth.admin
    .from("profiles")
    .select("full_name, role, account_status")
    .eq("account_status", "active")
    .in("role", ["director", "admin"])
    .order("role", { ascending: false })
    .order("full_name", { ascending: true })
    .limit(1);

  return text(data?.[0]?.full_name);
}

function mapReport(id: string, data: Record<string, unknown>): TrainingReport {
  return {
    id,
    status: text(data.status, "draft") as TrainingReportStatus,
    mode: text(data.mode, "individual") as TrainingReportMode,
    reportSource: text(data.reportSource, "assigned") as TrainingReportSource,
    sourceDocumentId: text(data.sourceDocumentId),
    sourceAssignmentId: text(data.sourceAssignmentId),
    bookNumber: text(data.bookNumber),
    documentTitle: text(data.documentTitle),
    teacherProfileId: text(data.teacherProfileId),
    teacherNameSnapshot: text(data.teacherNameSnapshot),
    buddhistYear: numberValue(data.buddhistYear),
    trainingType: text(data.trainingType),
    trainingStartDate: text(data.trainingStartDate),
    trainingEndDate: text(data.trainingEndDate),
    dueDate: text(data.dueDate),
    hours: numberValue(data.hours),
    place: text(data.place),
    organizer: text(data.organizer),
    objectives: text(data.objectives),
    summary: text(data.summary),
    benefits: text(data.benefits),
    application: text(data.application),
    suggestions: text(data.suggestions),
    attachments: arrayAttachments(data.attachments),
    submittedAt: text(data.submittedAt) || null,
    createdBy: text(data.createdBy),
    createdByName: text(data.createdByName),
    updatedBy: text(data.updatedBy),
    updatedByName: text(data.updatedByName),
    createdAt: iso(data.createdAt),
    updatedAt: iso(data.updatedAt),
  };
}

function requireOnSubmit(label: string, value: string, status: TrainingReportStatus) {
  if (status === "submitted" && !value.trim()) {
    throw new Error(`กรุณากรอก${label}ก่อนส่งรายงาน`);
  }
}

async function markLinkedTaskDone(input: {
  auth: Awaited<ReturnType<typeof requireSmartAreaUser>>;
  taskId: string;
}) {
  if (!input.auth.ok || !input.taskId) return null;

  const { error } = await input.auth.admin.rpc("update_smart_area_task_status", {
    p_task_id: input.taskId,
    p_actor_id: input.auth.profile.id,
    p_next_status: "done",
    p_can_manage_all: input.auth.canManageAll,
  });

  return error?.message ?? null;
}

export async function GET(request: Request) {
  try {
    const auth = await requireSmartAreaUser(request);

    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, reports: [], message: auth.message },
        { status: auth.status },
      );
    }

    if (!isTrainingReportFirebaseConfigured()) {
      return NextResponse.json({
        ok: true,
        reports: [],
        currentProfile: auth.profile,
        canManageAll: auth.canManageAll,
        warning:
          "ยังไม่ได้ตั้งค่า Firebase สำหรับโมดูลรายงานผลการประชุม/อบรม",
      });
    }

    const { db } = getTrainingReportFirebaseClient();
    const reportsRef = collection(db, TRAINING_REPORTS_COLLECTION);
    const reportQuery = auth.canManageAll
      ? query(reportsRef, limit(120))
      : query(
          reportsRef,
          where("teacherProfileId", "==", auth.profile.id),
          limit(120),
        );

    const snapshot = await getDocs(reportQuery);
    const reports = snapshot.docs
      .map((item) => mapReport(item.id, item.data()))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

    return NextResponse.json({
      ok: true,
      reports,
      currentProfile: auth.profile,
      canManageAll: auth.canManageAll,
    });
  } catch (error) {
    console.error("Load training reports error:", error);
    return NextResponse.json(
      {
        ok: false,
        reports: [],
        message:
          error instanceof Error
            ? error.message
            : "ไม่สามารถโหลดรายงานผลการประชุม/อบรมได้",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireSmartAreaUser(request);

    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, message: auth.message },
        { status: auth.status },
      );
    }

    const form = await request.formData();
    const statusInput = text(form.get("status"));
    const status =
      statusInput === "submitted" || statusInput === "not_attended"
        ? statusInput
        : "draft";
    const mode = text(form.get("mode")) === "group" ? "group" : "individual";
    const reportSource =
      text(form.get("reportSource")) === "manual" ? "manual" : "assigned";
    const reportId = text(form.get("id")) || crypto.randomUUID();
    const sourceAssignmentId = text(form.get("sourceAssignmentId"));
    const sourceDocumentId = text(form.get("sourceDocumentId"));
    const documentTitle = text(form.get("documentTitle"));
    const inputBookNumber = text(form.get("bookNumber"));
    const bookNumber =
      reportSource === "manual" ? text(inputBookNumber, "อบรมเอง") : inputBookNumber;
    const teacherProfileId = auth.canManageAll
      ? text(form.get("teacherProfileId"), auth.profile.id)
      : auth.profile.id;
    const teacherNameSnapshot = auth.canManageAll
      ? text(form.get("teacherNameSnapshot"), auth.profile.full_name)
      : auth.profile.full_name;
    const trainingStartDate = validDate(text(form.get("trainingStartDate")));
    const trainingEndDate = validDate(text(form.get("trainingEndDate")));
    const dueDate = validDate(text(form.get("dueDate")));
    const trainingType = text(form.get("trainingType"), "ประชุม/อบรม");
    const place = text(form.get("place"));
    const organizer = text(form.get("organizer"));
    const objectives = text(form.get("objectives"));
    const summary = text(form.get("summary"));
    const benefits = text(form.get("benefits"));
    const application = text(form.get("application"));
    const suggestions = text(form.get("suggestions"));
    const hours = numberValue(form.get("hours"));
    const { db } = getTrainingReportFirebaseClient();

    requireOnSubmit("ชื่อเรื่อง", documentTitle, status);
    if (reportSource !== "manual") {
      requireOnSubmit("เลขหนังสือ", bookNumber, status);
    }
    requireOnSubmit("วันที่เริ่มประชุม/อบรม", trainingStartDate, status);
    requireOnSubmit("สรุปสาระสำคัญ", summary, status);
    const buddhistYear = buddhistYearFromDate(
      trainingStartDate || dueDate || new Date().toISOString().slice(0, 10),
    );
    const uploadedAt = isoNow();
    const existingPhotos = parseExistingAttachments(
      form.get("existingPhotoAttachments"),
    ).filter((attachment) => attachment.attachmentKind === "photo");
    const existingPdf = findPdfAttachment(
      parseExistingAttachments(form.get("existingPdfAttachment")),
    );
    const photoUploads = PHOTO_SLOTS.map((slot) => {
      const file = form.get(`photoSlot${slot.slotIndex}`);
      return file instanceof File && file.size > 0 ? { ...slot, file } : null;
    }).filter(
      (item): item is (typeof PHOTO_SLOTS)[number] & { file: File } =>
        Boolean(item),
    );
    const uploadFiles = form
      .getAll("attachments")
      .filter((item): item is File => item instanceof File && item.size > 0);

    for (const file of [...photoUploads.map((item) => item.file), ...uploadFiles]) {
      if (file.size > MAX_FILE_SIZE) {
        throw new Error("ไฟล์แนบแต่ละไฟล์ต้องมีขนาดไม่เกิน 30 MB");
      }
    }

    const uploadedPhotos = await Promise.all(
      photoUploads.map(async (photo) => {
        const uploaded = await uploadTrainingReportFile({
          file: photo.file,
          reportId,
          buddhistYear,
          bookNumber: sanitizeDriveSegment(bookNumber, "no-book-number"),
          teacherName: sanitizeDriveSegment(teacherNameSnapshot, "teacher"),
          slotIndex: photo.slotIndex,
          slotKey: photo.slotKey,
          slotLabel: photo.slotLabel,
        });

        return {
          ...uploaded,
          attachmentKind: "photo" as const,
          uploadedAt,
        };
      }),
    );
    const uploadedPhotoSlots = new Set(
      uploadedPhotos.map((photo) => photo.slotIndex).filter(Boolean),
    );
    const retainedPhotos = existingPhotos.filter(
      (photo) => photo.slotIndex && !uploadedPhotoSlots.has(photo.slotIndex),
    );
    const finalPhotos = [...retainedPhotos, ...uploadedPhotos].sort(
      (left, right) => (left.slotIndex || 0) - (right.slotIndex || 0),
    );

    const generatedPdf =
      status === "submitted"
        ? await createTrainingReportPdf({
            reportId,
            buddhistYear,
            bookNumber,
            teacherName: teacherNameSnapshot,
            documentTitle,
            trainingType,
            trainingStartDate,
            trainingEndDate,
            hours,
            place,
            organizer,
            objectives,
            summary,
            benefits,
            application,
            suggestions,
            directorName: await loadDirectorName(auth),
            existingPdfFileId: existingPdf?.fileId || "",
            photoSlots: finalPhotos
              .filter((photo) => photo.fileId)
              .map((photo) => ({
                slotIndex: photo.slotIndex || 0,
                slotKey: photo.slotKey || "",
                slotLabel: photo.slotLabel || "",
                fileId: photo.fileId,
              })),
          })
        : null;

    const uploadedAttachments = await Promise.all(
      uploadFiles.map(async (file) => {
        const uploaded = await uploadTrainingReportFile({
          file,
          reportId,
          buddhistYear,
          bookNumber: sanitizeDriveSegment(bookNumber, "no-book-number"),
          teacherName: sanitizeDriveSegment(teacherNameSnapshot, "teacher"),
        });

        return {
          ...uploaded,
          attachmentKind: "file" as const,
          uploadedAt,
        };
      }),
    );
    const attachments = [
      ...(generatedPdf
        ? [{ ...generatedPdf, attachmentKind: "pdf" as const, uploadedAt }]
        : []),
      ...finalPhotos,
      ...uploadedAttachments,
    ];

    const ref = doc(db, TRAINING_REPORTS_COLLECTION, reportId);
    const submittedAt =
      status === "submitted" || status === "not_attended" ? uploadedAt : null;
    const payload = {
      status,
      mode,
      reportSource,
      sourceDocumentId,
      sourceAssignmentId,
      bookNumber,
      documentTitle,
      teacherProfileId,
      teacherNameSnapshot,
      buddhistYear,
      trainingType,
      trainingStartDate,
      trainingEndDate,
      dueDate,
      hours,
      place,
      organizer,
      objectives,
      summary,
      benefits,
      application,
      suggestions,
      attachments,
      submittedAt,
      createdBy: auth.profile.id,
      createdByName: auth.profile.full_name,
      updatedBy: auth.profile.id,
      updatedByName: auth.profile.full_name,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(ref, payload, { merge: true });

    const taskWarning =
      (status === "submitted" || status === "not_attended") && sourceAssignmentId
        ? await markLinkedTaskDone({ auth, taskId: sourceAssignmentId })
        : null;

    return NextResponse.json({
      ok: true,
      report: {
        ...payload,
        id: reportId,
        createdAt: uploadedAt,
        updatedAt: uploadedAt,
      },
      warning: taskWarning,
      message:
        status === "submitted"
          ? "ส่งรายงานผลการประชุม/อบรมแล้ว"
          : status === "not_attended"
            ? "บันทึกว่าไม่เข้าประชุม/อบรมแล้ว"
            : "บันทึกร่างรายงานแล้ว",
    });
  } catch (error) {
    console.error("Save training report error:", error);
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "ไม่สามารถบันทึกรายงานผลการประชุม/อบรมได้",
      },
      { status: 500 },
    );
  }
}
