type MemoDocumentConfig = {
  memoGasUrl: string;
  memoGasSecret: string;
  profileGasUrl: string;
  profileGasSecret: string;
};

export type GasAssetResponse = {
  ok?: boolean;
  message?: string;
  base64?: string;
  mimeType?: string;
};

export type MemoPendingResponse = {
  ok?: boolean;
  message?: string;
  status?: string;
  workingDocumentId?: string;
  workingDocumentUrl?: string;
};

export type MemoFinalizeResponse = {
  ok?: boolean;
  message?: string;
  status?: string;
  decision?: string;
  pdfFileId?: string;
  pdfFileUrl?: string;
  pdfFileName?: string;
  finalFolderId?: string;
};

export function getMemoDocumentConfig(): MemoDocumentConfig | null {
  if (process.env.MEMO_DOCUMENT_ENABLED !== "true") {
    return null;
  }

  const memoGasUrl = process.env.GAS_MEMO_DOCUMENT_URL;
  const memoGasSecret = process.env.MEMO_DOCUMENT_SECRET;
  const profileGasUrl = process.env.GAS_PROFILE_UPLOAD_URL;
  const profileGasSecret = process.env.GAS_PROFILE_UPLOAD_SECRET;

  if (!memoGasUrl || !memoGasSecret || !profileGasUrl || !profileGasSecret) {
    return null;
  }

  return {
    memoGasUrl,
    memoGasSecret,
    profileGasUrl,
    profileGasSecret,
  };
}

export async function callMemoGas(
  url: string,
  payload: Record<string, unknown>,
  timeoutMs = 50000
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        "Google Apps Script ตอบกลับช้าเกิน 50 วินาที กรุณาตรวจสอบ Deployment และสิทธิ์การเข้าถึง"
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  let result: Record<string, unknown>;

  try {
    result = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(
      "Google Apps Script ไม่ได้ตอบกลับเป็น JSON กรุณา Deploy เวอร์ชันล่าสุด"
    );
  }

  if (!response.ok || result.ok !== true) {
    throw new Error(
      typeof result.message === "string"
        ? result.message
        : "Google Apps Script ทำงานไม่สำเร็จ"
    );
  }

  return result;
}

export async function getProfileSignatureAsset(
  profileGasUrl: string,
  profileGasSecret: string,
  fileId: string,
  label = "ลายเซ็น"
) {
  const result = (await callMemoGas(profileGasUrl, {
    secret: profileGasSecret,
    action: "get",
    fileId,
  })) as GasAssetResponse;

  if (!result.base64) {
    throw new Error(`ไม่พบข้อมูล${label}`);
  }

  return {
    base64: result.base64,
    mimeType: result.mimeType || "image/png",
  };
}
