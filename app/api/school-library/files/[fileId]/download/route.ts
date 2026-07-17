import { NextResponse } from "next/server";
import {
  contentDisposition,
  downloadDriveFile,
  safeDownloadFileName,
  text,
} from "@/lib/word-drive-download";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ fileId: string }> },
) {
  const { fileId: rawFileId } = await context.params;
  const fileId = text(rawFileId);
  const url = new URL(request.url);
  const fileName = safeDownloadFileName(url.searchParams.get("name"), "school-library-file");
  const mimeType = text(url.searchParams.get("mime"));

  if (!fileId) {
    return NextResponse.json(
      { ok: false, message: "ไม่พบรหัสไฟล์" },
      { status: 400 },
    );
  }

  try {
    const file = await downloadDriveFile(fileId, { fileName, mimeType });
    const headers = new Headers();

    headers.set("content-type", file.contentType || mimeType || "application/octet-stream");
    headers.set("content-disposition", contentDisposition(fileName));
    headers.set("cache-control", "private, no-store");
    headers.set("content-length", String(file.body.length));

    return new Response(new Uint8Array(file.body), { status: 200, headers });
  } catch (error) {
    console.error("Download school library file error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "ไม่สามารถดาวน์โหลดไฟล์คลังงานโรงเรียนได้",
      },
      { status: 502 },
    );
  }
}
