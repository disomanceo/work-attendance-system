import {
  callMemoGas,
  getProfileSignatureAsset,
  type GasAssetResponse,
} from "@/lib/memo-document-gas";

type OfficialDutyDocumentConfig = {
  officialDutyGasUrl: string;
  officialDutyGasSecret: string;
  profileGasUrl: string;
  profileGasSecret: string;
};

export type OfficialDutyPendingResponse = {
  ok?: boolean;
  message?: string;
  status?: string;
  workingDocumentId?: string;
  workingDocumentUrl?: string;
  requestFolderId?: string;
  attachmentFileId?: string;
  attachmentFileUrl?: string;
  attachmentFileName?: string;
  attachmentMimeType?: string;
};

export type OfficialDutyFinalizeResponse = {
  ok?: boolean;
  message?: string;
  status?: string;
  decision?: string;
  pdfFileId?: string;
  pdfFileUrl?: string;
  pdfFileName?: string;
  finalFolderId?: string;
};

export function getOfficialDutyDocumentConfig(): OfficialDutyDocumentConfig | null {
  if (process.env.OFFICIAL_DUTY_DOCUMENT_ENABLED !== "true") {
    return null;
  }

  const officialDutyGasUrl = process.env.GAS_OFFICIAL_DUTY_URL;
  const officialDutyGasSecret = process.env.OFFICIAL_DUTY_GAS_SECRET;
  const profileGasUrl = process.env.GAS_PROFILE_UPLOAD_URL;
  const profileGasSecret = process.env.GAS_PROFILE_UPLOAD_SECRET;

  if (
    !officialDutyGasUrl ||
    !officialDutyGasSecret ||
    !profileGasUrl ||
    !profileGasSecret
  ) {
    return null;
  }

  return {
    officialDutyGasUrl,
    officialDutyGasSecret,
    profileGasUrl,
    profileGasSecret,
  };
}

export async function callOfficialDutyDocumentGas(
  url: string,
  payload: Record<string, unknown>
) {
  return callMemoGas(url, payload, 50000);
}

export async function getOfficialDutySignatureAsset(
  profileGasUrl: string,
  profileGasSecret: string,
  fileId: string,
  label = "ลายเซ็น"
) {
  return getProfileSignatureAsset(
    profileGasUrl,
    profileGasSecret,
    fileId,
    label
  ) as Promise<Required<Pick<GasAssetResponse, "base64" | "mimeType">>>;
}
