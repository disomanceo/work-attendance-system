import "server-only";

type GasPayload = Record<string, unknown>;

const SCHOOL_LIBRARY_ROOT_FOLDER_ID = "1oqa3etlgk5LtqDLRY2SJn1mDinPL0_lJ";

export function getSchoolLibraryDriveConfig() {
  const dedicatedUrl = process.env.SCHOOL_LIBRARY_DRIVE_GAS_URL?.trim();
  const dedicatedSecret = process.env.SCHOOL_LIBRARY_DRIVE_GAS_SECRET?.trim();

  return dedicatedUrl && dedicatedSecret
    ? {
        url: dedicatedUrl,
        secret: dedicatedSecret,
        action: "uploadSchoolLibraryFile" as const,
        rootFolderId:
          process.env.SCHOOL_LIBRARY_DRIVE_ROOT_FOLDER_ID?.trim() ||
          SCHOOL_LIBRARY_ROOT_FOLDER_ID,
      }
    : null;
}

export async function callSchoolLibraryDriveGas(
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
    throw new Error("Google Apps Script did not return valid JSON");
  }

  if (!response.ok || result.ok !== true) {
    throw new Error(
      typeof result.message === "string"
        ? result.message
        : "Cannot upload file to Google Drive",
    );
  }

  return result;
}
