import "server-only";

import { createClient } from "@supabase/supabase-js";

export const WORD_DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type DownloadFileResult = {
  body: Buffer;
  contentType: string;
};

export function text(value: unknown) {
  return String(value ?? "").trim();
}

export function serverSupabaseConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  return supabaseUrl && serviceRoleKey
    ? { supabaseUrl, serviceRoleKey }
    : null;
}

export function createServiceSupabase() {
  const config = serverSupabaseConfig();

  if (!config) return null;

  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function safeWordFileName(value: unknown) {
  const cleaned = text(value)
    .replace(/[/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  const fileName = cleaned || "document.docx";

  return /\.docx$/i.test(fileName) ? fileName : `${fileName}.docx`;
}

export function safeDownloadFileName(value: unknown, fallback = "download") {
  return (
    text(value)
      .replace(/[/\\?%*:|"<>]/g, "_")
      .replace(/\s+/g, " ")
      .trim() || fallback
  );
}

export function contentDisposition(fileName: string) {
  const asciiName =
    fileName
      .replace(/[^\x20-\x7E]/g, "_")
      .replace(/["\\]/g, "_")
      .trim() || "document.docx";

  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(
    fileName,
  )}`;
}

function looksLikeHtml(body: Buffer, contentType: string) {
  if (contentType.toLowerCase().includes("text/html")) return true;

  const prefix = body.subarray(0, 128).toString("utf8").trimStart().toLowerCase();
  return prefix.startsWith("<!doctype html") || prefix.startsWith("<html");
}

async function fetchDriveUrl(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    redirect: "follow",
    headers: {
      accept: "*/*",
      "user-agent": "Mozilla/5.0 WorkAttendanceWordProxy/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Google Drive returned HTTP ${response.status}`);
  }

  const body = Buffer.from(await response.arrayBuffer());
  const contentType = text(response.headers.get("content-type")).split(";")[0];

  return { body, contentType };
}

function exportUrlForGoogleFile(fileId: string, mimeType: string, fileName: string) {
  const lowerMime = mimeType.toLowerCase();
  const extension = fileName.split(".").pop()?.toLowerCase() || "";
  const encodedFileId = encodeURIComponent(fileId);

  if (
    lowerMime.includes("document") ||
    ["doc", "docx", "rtf", "odt"].includes(extension)
  ) {
    return `https://docs.google.com/document/d/${encodedFileId}/export?format=docx`;
  }

  if (
    lowerMime.includes("spreadsheet") ||
    lowerMime.includes("excel") ||
    ["xls", "xlsx", "csv", "ods"].includes(extension)
  ) {
    return `https://docs.google.com/spreadsheets/d/${encodedFileId}/export?format=xlsx`;
  }

  if (
    lowerMime.includes("presentation") ||
    lowerMime.includes("powerpoint") ||
    ["ppt", "pptx", "odp"].includes(extension)
  ) {
    return `https://docs.google.com/presentation/d/${encodedFileId}/export/pptx`;
  }

  return "";
}

export async function downloadDriveFile(
  fileId: string,
  options: { fileName?: string; mimeType?: string } = {},
): Promise<DownloadFileResult> {
  const safeFileId = text(fileId);

  if (!safeFileId) {
    throw new Error("Missing file id");
  }

  const direct = await fetchDriveUrl(
    `https://drive.google.com/uc?export=download&id=${encodeURIComponent(
      safeFileId,
    )}&confirm=t`,
  );

  if (!looksLikeHtml(direct.body, direct.contentType)) {
    return {
      body: direct.body,
      contentType: direct.contentType || options.mimeType || "application/octet-stream",
    };
  }

  const exportUrl = exportUrlForGoogleFile(
    safeFileId,
    text(options.mimeType),
    text(options.fileName),
  );

  if (!exportUrl) {
    throw new Error("Google Drive did not return a downloadable file");
  }

  const exported = await fetchDriveUrl(exportUrl);

  if (looksLikeHtml(exported.body, exported.contentType)) {
    throw new Error("Google Drive did not return a downloadable file");
  }

  return {
    body: exported.body,
    contentType: exported.contentType || options.mimeType || "application/octet-stream",
  };
}

export async function downloadDriveWordFile(
  fileId: string,
): Promise<DownloadFileResult> {
  const safeFileId = text(fileId);

  if (!safeFileId) {
    throw new Error("Missing file id");
  }

  const direct = await fetchDriveUrl(
    `https://drive.google.com/uc?export=download&id=${encodeURIComponent(
      safeFileId,
    )}&confirm=t`,
  );

  if (!looksLikeHtml(direct.body, direct.contentType)) {
    return {
      body: direct.body,
      contentType:
        direct.contentType && direct.contentType !== "application/octet-stream"
          ? direct.contentType
          : WORD_DOCX_MIME,
    };
  }

  const exported = await fetchDriveUrl(
    `https://docs.google.com/document/d/${encodeURIComponent(
      safeFileId,
    )}/export?format=docx`,
  );

  if (looksLikeHtml(exported.body, exported.contentType)) {
    throw new Error("Google Drive did not return a Word file");
  }

  return {
    body: exported.body,
    contentType: WORD_DOCX_MIME,
  };
}
