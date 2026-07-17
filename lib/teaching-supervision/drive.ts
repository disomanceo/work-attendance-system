import "server-only";

type GasPayload = Record<string, unknown>;

export type TeachingDriveConfig = {
  url: string;
  secret: string;
  rootFolderId: string;
};

export type DriveUploadResult = {
  driveFileId: string;
  driveFolderId: string;
  driveUrl: string;
  fileName: string;
  mimeType: string;
  size: number;
};

const DEFAULT_ROOT_FOLDER_ID = "1AKzN2HTMaqpSIMgKUTyINfEtiPohLXJN";

export function getTeachingDriveConfig(): TeachingDriveConfig | null {
  const url = process.env.TEACHING_SUPERVISION_DRIVE_GAS_URL?.trim();
  const secret = process.env.TEACHING_SUPERVISION_DRIVE_GAS_SECRET?.trim();

  return url && secret
    ? {
        url,
        secret,
        rootFolderId:
          process.env.TEACHING_SUPERVISION_DRIVE_ROOT_FOLDER_ID?.trim() ||
          process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID?.trim() ||
          DEFAULT_ROOT_FOLDER_ID,
      }
    : null;
}

export function getBuddhistYear(dateValue: string) {
  const date = dateValue ? new Date(`${dateValue}T12:00:00+07:00`) : new Date();
  return date.getFullYear() + 543;
}

async function callTeachingDriveGas(
  config: TeachingDriveConfig,
  payload: GasPayload,
) {
  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify({
      ...payload,
      secret: config.secret,
      rootFolderId: config.rootFolderId,
    }),
    cache: "no-store",
    redirect: "follow",
  });

  const text = await response.text();
  let result: Record<string, unknown>;

  try {
    result = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("Google Apps Script did not return valid JSON");
  }

  if (!response.ok || result.ok !== true) {
    throw new Error(
      typeof result.message === "string"
        ? result.message
        : "Google Apps Script request failed",
    );
  }

  return result;
}

function responseToUploadResult(
  result: Record<string, unknown>,
  fallback: { fileName: string; mimeType: string; size: number },
) {
  return {
    driveFileId: String(result.fileId ?? ""),
    driveFolderId: String(result.folderId ?? ""),
    driveUrl: String(result.fileUrl ?? ""),
    fileName: String(result.fileName ?? fallback.fileName),
    mimeType: String(result.mimeType ?? fallback.mimeType),
    size: Number(result.fileSize ?? fallback.size),
  } satisfies DriveUploadResult;
}

export async function uploadImageToDrive(input: {
  config: TeachingDriveConfig;
  inspectionDate: string;
  inspectionId: string;
  slot: number;
  category: string;
  file: File;
}) {
  const base64 = Buffer.from(await input.file.arrayBuffer()).toString("base64");
  const result = await callTeachingDriveGas(input.config, {
    action: "uploadTeachingInspectionImage",
    inspectionId: input.inspectionId,
    inspectionDate: input.inspectionDate,
    buddhistYear: getBuddhistYear(input.inspectionDate),
    slot: input.slot,
    category: input.category,
    originalName: input.file.name,
    mimeType: input.file.type || "application/octet-stream",
    fileSize: input.file.size,
    base64,
  });

  return responseToUploadResult(result, {
    fileName: input.file.name,
    mimeType: input.file.type,
    size: input.file.size,
  });
}

export async function uploadPdfToDrive(input: {
  config: TeachingDriveConfig;
  inspectionDate: string;
  inspectionId: string;
  teacherName: string;
  file: File;
  existingDriveFileId?: string;
}) {
  const base64 = Buffer.from(await input.file.arrayBuffer()).toString("base64");
  const result = await callTeachingDriveGas(input.config, {
    action: "uploadTeachingInspectionPdf",
    inspectionId: input.inspectionId,
    inspectionDate: input.inspectionDate,
    buddhistYear: getBuddhistYear(input.inspectionDate),
    teacherName: input.teacherName,
    originalName: input.file.name,
    mimeType: "application/pdf",
    fileSize: input.file.size,
    existingFileId: input.existingDriveFileId || "",
    base64,
  });

  return responseToUploadResult(result, {
    fileName: input.file.name,
    mimeType: "application/pdf",
    size: input.file.size,
  });
}

export async function deleteDriveFile(
  config: TeachingDriveConfig,
  fileId: string,
) {
  await callTeachingDriveGas(config, {
    action: "deleteTeachingInspectionFile",
    fileId,
  });
}

export async function getDriveFileMetadata(
  config: TeachingDriveConfig,
  fileId: string,
) {
  return callTeachingDriveGas(config, {
    action: "getTeachingInspectionFileMetadata",
    fileId,
  });
}
