import { NextResponse } from "next/server";
import { requireSmartAreaUser } from "@/lib/smart-area/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function safeFileName(value: string) {
  const cleaned = text(value)
    .replace(/[/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || "attachment";
}

function extensionName(fileName: string, url: string) {
  const value = `${fileName} ${url}`.toLowerCase();
  const match = value.match(/\.(pdf|png|jpe?g|gif|webp|bmp|svg|docx?|xlsx?|pptx?|zip|rar)(?:$|[?#\s])/i);
  return match ? match[1].toLowerCase().replace("jpeg", "jpg") : "";
}

function fileNameFromDisposition(value: string) {
  const utfMatch = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) return decodeURIComponent(utfMatch[1]);

  const plainMatch = value.match(/filename="?([^";]+)"?/i);
  return plainMatch?.[1] || "";
}

function extensionFromMime(value: string) {
  const mime = value.toLowerCase();
  const types: Record<string, string> = {
    "application/pdf": "pdf",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/bmp": "bmp",
    "image/svg+xml": "svg",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-powerpoint": "ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "application/zip": "zip",
    "application/x-zip-compressed": "zip",
    "application/vnd.rar": "rar",
    "application/x-rar": "rar",
    "application/x-rar-compressed": "rar",
  };

  return types[mime] || "";
}

function ensureExtension(fileName: string, extension: string) {
  const cleaned = safeFileName(fileName);
  if (!extension || /\.[A-Za-z0-9]{2,5}$/.test(cleaned)) return cleaned;
  return `${cleaned}.${extension}`;
}

function mimeFromExtension(extension: string) {
  const types: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    svg: "image/svg+xml",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    zip: "application/zip",
    rar: "application/vnd.rar",
  };

  return types[extension] || "application/octet-stream";
}

function isInlineFile(contentType: string, extension: string) {
  return (
    contentType.startsWith("image/") ||
    contentType.includes("application/pdf") ||
    extension === "pdf"
  );
}

function allowedCentralUrl(value: string) {
  try {
    const url = new URL(value);
    const configuredBase = process.env.SMART_AREA_BASE_URL || "";
    const configuredHost = configuredBase ? new URL(configuredBase).host : "";
    const allowedHosts = new Set(
      [configuredHost, "101.51.157.107"].filter(Boolean),
    );

    return ["http:", "https:"].includes(url.protocol) && allowedHosts.has(url.host);
  } catch {
    return false;
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ attachmentId: string }> },
) {
  const auth = await requireSmartAreaUser(request);

  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, message: auth.message },
      { status: auth.status },
    );
  }

  const { attachmentId: rawAttachmentId } = await context.params;
  const attachmentId = text(rawAttachmentId);

  if (!attachmentId) {
    return NextResponse.json(
      { ok: false, message: "Missing attachment id" },
      { status: 400 },
    );
  }

  const { data: attachment, error } = await auth.admin
    .from("smart_area_attachments")
    .select("id, book_id, source_url, file_url, file_name, mime_type, status, is_active")
    .eq("id", attachmentId)
    .eq("is_active", true)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    console.error("Load Smart Area attachment error:", error);
    return NextResponse.json(
      { ok: false, message: "Cannot load attachment" },
      { status: 500 },
    );
  }

  if (!attachment) {
    return NextResponse.json(
      { ok: false, message: "Attachment not found" },
      { status: 404 },
    );
  }

  if (!auth.canManageAll) {
    const { data: task, error: taskError } = await auth.admin
      .from("smart_area_tasks")
      .select("id")
      .eq("book_id", attachment.book_id)
      .eq("assignee_id", auth.profile.id)
      .eq("is_active", true)
      .maybeSingle();

    if (taskError || !task) {
      return NextResponse.json(
        { ok: false, message: "Forbidden" },
        { status: 403 },
      );
    }
  }

  const sourceUrl = text(attachment.file_url) || text(attachment.source_url);

  if (!sourceUrl || !allowedCentralUrl(sourceUrl)) {
    return NextResponse.json(
      { ok: false, message: "Attachment URL is not allowed" },
      { status: 400 },
    );
  }

  const upstream = await fetch(sourceUrl, {
    redirect: "follow",
    cache: "no-store",
    headers: {
      accept: "*/*",
      "user-agent": "Mozilla/5.0 WorkAttendanceAttachmentProxy/1.0",
    },
  });

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { ok: false, message: `Cannot download attachment (${upstream.status})` },
      { status: 502 },
    );
  }

  const upstreamType = text(upstream.headers.get("content-type")).split(";")[0];
  const upstreamFileName = fileNameFromDisposition(
    text(upstream.headers.get("content-disposition")),
  );
  const fileName = safeFileName(
    upstreamFileName || text(attachment.file_name) || "attachment",
  );
  const extension =
    extensionName(fileName, sourceUrl) || extensionFromMime(upstreamType);
  const contentType =
    upstreamType && !upstreamType.includes("text/html")
      ? upstreamType
      : mimeFromExtension(extension);
  const responseFileName = ensureExtension(
    fileName,
    extension || extensionFromMime(contentType),
  );
  const disposition = isInlineFile(contentType, extension)
    ? "inline"
    : "attachment";
  const headers = new Headers();

  headers.set("content-type", contentType);
  headers.set(
    "content-disposition",
    `${disposition}; filename*=UTF-8''${encodeURIComponent(responseFileName)}`,
  );
  headers.set("cache-control", "private, no-store");

  const length = upstream.headers.get("content-length");
  if (length) headers.set("content-length", length);

  return new Response(upstream.body, { status: 200, headers });
}
