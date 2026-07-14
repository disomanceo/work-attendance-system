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

  const fileName = safeFileName(text(attachment.file_name) || "attachment");
  const extension = extensionName(fileName, sourceUrl);
  const upstreamType = text(upstream.headers.get("content-type")).split(";")[0];
  const contentType =
    upstreamType && !upstreamType.includes("text/html")
      ? upstreamType
      : mimeFromExtension(extension);
  const disposition = isInlineFile(contentType, extension)
    ? "inline"
    : "attachment";
  const headers = new Headers();

  headers.set("content-type", contentType);
  headers.set(
    "content-disposition",
    `${disposition}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
  );
  headers.set("cache-control", "private, no-store");

  const length = upstream.headers.get("content-length");
  if (length) headers.set("content-length", length);

  return new Response(upstream.body, { status: 200, headers });
}
