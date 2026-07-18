import { NextResponse } from "next/server";
import { downloadTrainingReportFile } from "@/lib/training-reports/drive-gas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cleanFileId(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "");
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ fileId: string }> },
) {
  const { fileId: rawFileId } = await context.params;
  const fileId = cleanFileId(rawFileId);

  if (!fileId) {
    return NextResponse.json(
      { ok: false, message: "ไม่พบรหัสไฟล์รูปภาพ" },
      { status: 400 },
    );
  }

  try {
    const file = await downloadTrainingReportFile(fileId);
    const contentType = file.mimeType || "application/octet-stream";

    if (!contentType.toLowerCase().startsWith("image/")) {
      return NextResponse.json(
        { ok: false, message: "ไฟล์นี้ไม่ใช่รูปภาพ" },
        { status: 415 },
      );
    }

    const headers = new Headers();

    headers.set("content-type", contentType);
    headers.set("cache-control", "private, max-age=300");
    headers.set("content-length", String(file.body.length));

    return new Response(new Uint8Array(file.body), { status: 200, headers });
  } catch (error) {
    console.error("Preview training report photo error:", error);

    return NextResponse.json(
      { ok: false, message: "ไม่สามารถแสดงรูปภาพรายงานได้" },
      { status: 502 },
    );
  }
}
