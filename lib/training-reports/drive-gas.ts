import "server-only";

import {
  sanitizeDriveSegment,
  folderBookNumber,
  TRAINING_REPORT_DRIVE_ROOT_FOLDER_ID,
} from "@/lib/training-reports/format";

type GasPayload = Record<string, unknown>;

type TrainingReportPhotoSlot = {
  slotIndex: number;
  slotKey: string;
  slotLabel: string;
  fileId: string;
};

export function getTrainingReportDriveConfig() {
  const url = process.env.GAS_TRAINING_REPORT_URL?.trim();
  const secret = process.env.GAS_TRAINING_REPORT_SECRET?.trim();
  const rootFolderId =
    process.env.TRAINING_REPORT_DRIVE_ROOT_FOLDER_ID?.trim() ||
    TRAINING_REPORT_DRIVE_ROOT_FOLDER_ID;

  return url && secret ? { url, secret, rootFolderId } : null;
}

export async function callTrainingReportDriveGas(
  url: string,
  payload: GasPayload,
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

  const text = await response.text();
  let result: Record<string, unknown>;

  try {
    result = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("Apps Script สำหรับรายงานประชุม/อบรมไม่ได้ตอบกลับเป็น JSON");
  }

  if (!response.ok || result.ok !== true) {
    throw new Error(
      typeof result.message === "string"
        ? result.message
        : "อัปโหลดไฟล์รายงานประชุม/อบรมไป Google Drive ไม่สำเร็จ",
    );
  }

  return result;
}

export async function uploadTrainingReportFile(input: {
  file: File;
  reportId: string;
  buddhistYear: number;
  bookNumber: string;
  teacherName: string;
  slotIndex?: number;
  slotKey?: string;
  slotLabel?: string;
}) {
  const config = getTrainingReportDriveConfig();

  if (!config) {
    throw new Error(
      "ยังไม่ได้ตั้งค่า GAS_TRAINING_REPORT_URL และ GAS_TRAINING_REPORT_SECRET",
    );
  }

  const base64 = Buffer.from(await input.file.arrayBuffer()).toString("base64");
  const result = await callTrainingReportDriveGas(config.url, {
    action: "uploadTrainingReportFile",
    secret: config.secret,
    rootFolderId: config.rootFolderId,
    reportId: input.reportId,
    buddhistYear: input.buddhistYear,
    bookNumber: folderBookNumber(input.bookNumber),
    teacherName: sanitizeDriveSegment(input.teacherName, "teacher"),
    originalName: sanitizeDriveSegment(input.file.name, "attachment"),
    mimeType: input.file.type || "application/octet-stream",
    slotIndex: input.slotIndex || "",
    slotKey: input.slotKey || "",
    slotLabel: input.slotLabel || "",
    base64,
  });

  return {
    fileId: String(result.fileId ?? ""),
    fileUrl: String(result.fileUrl ?? ""),
    fileName: String(result.fileName ?? input.file.name),
    mimeType: String(result.mimeType ?? input.file.type),
    fileSize: input.file.size,
    attachmentKind: input.slotIndex ? "photo" : "file",
    slotIndex: input.slotIndex,
    slotKey: input.slotKey,
    slotLabel: input.slotLabel,
  };
}

export async function createTrainingReportPdf(input: {
  reportId: string;
  buddhistYear: number;
  bookNumber: string;
  teacherName: string;
  documentTitle: string;
  trainingType: string;
  trainingStartDate: string;
  trainingEndDate: string;
  hours: number;
  place: string;
  organizer: string;
  objectives: string;
  summary: string;
  benefits: string;
  application: string;
  suggestions: string;
  photoSlots?: TrainingReportPhotoSlot[];
}) {
  const config = getTrainingReportDriveConfig();

  if (!config) {
    throw new Error(
      "ยังไม่ได้ตั้งค่า GAS_TRAINING_REPORT_URL และ GAS_TRAINING_REPORT_SECRET",
    );
  }

  const result = await callTrainingReportDriveGas(config.url, {
    action: "createTrainingReportPdf",
    secret: config.secret,
    rootFolderId: config.rootFolderId,
    reportId: input.reportId,
    buddhistYear: input.buddhistYear,
    bookNumber: folderBookNumber(input.bookNumber),
    teacherName: sanitizeDriveSegment(input.teacherName, "teacher"),
    documentTitle: input.documentTitle,
    trainingType: input.trainingType,
    trainingStartDate: input.trainingStartDate,
    trainingEndDate: input.trainingEndDate,
    hours: input.hours,
    place: input.place,
    organizer: input.organizer,
    objectives: input.objectives,
    summary: input.summary,
    benefits: input.benefits,
    application: input.application,
    suggestions: input.suggestions,
    photoSlots: input.photoSlots || [],
  });

  return {
    fileId: String(result.fileId ?? ""),
    fileUrl: String(result.fileUrl ?? ""),
    fileName: String(result.fileName ?? "training-report.pdf"),
    mimeType: String(result.mimeType ?? "application/pdf"),
    fileSize: Number(result.fileSize ?? 0),
    attachmentKind: "pdf",
  };
}

export async function downloadTrainingReportFile(fileId: string) {
  const config = getTrainingReportDriveConfig();

  if (!config) {
    throw new Error(
      "ยังไม่ได้ตั้งค่า GAS_TRAINING_REPORT_URL และ GAS_TRAINING_REPORT_SECRET",
    );
  }

  const result = await callTrainingReportDriveGas(config.url, {
    action: "downloadTrainingReportFile",
    secret: config.secret,
    fileId,
  });

  const base64 = typeof result.base64 === "string" ? result.base64 : "";

  if (!base64) {
    throw new Error("Apps Script ไม่ได้ส่งข้อมูลไฟล์กลับมา");
  }

  return {
    body: Buffer.from(base64, "base64"),
    fileName: String(result.fileName ?? "training-report-file"),
    mimeType: String(result.mimeType ?? "application/octet-stream"),
  };
}
