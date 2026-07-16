import { NextResponse } from "next/server";
import {
  contentDisposition,
  createServiceSupabase,
  downloadDriveWordFile,
  safeWordFileName,
  text,
  WORD_DOCX_MIME,
} from "@/lib/word-drive-download";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ fileId: string }> },
) {
  const { fileId: rawFileId } = await context.params;
  const fileId = text(rawFileId);

  if (!fileId) {
    return NextResponse.json(
      { ok: false, message: "ไม่พบรหัสไฟล์ Word" },
      { status: 400 },
    );
  }

  const admin = createServiceSupabase();

  if (!admin) {
    return NextResponse.json(
      { ok: false, message: "ยังไม่ได้ตั้งค่า Supabase ฝั่ง Server" },
      { status: 500 },
    );
  }

  const { data: order, error } = await admin
    .from("order_documents")
    .select("id, docx_file_id, docx_file_name")
    .eq("docx_file_id", fileId)
    .maybeSingle();

  if (error) {
    console.error("Load order Word file metadata error:", error);
    return NextResponse.json(
      { ok: false, message: "ไม่สามารถตรวจสอบไฟล์คำสั่งได้" },
      { status: 500 },
    );
  }

  if (!order) {
    return NextResponse.json(
      { ok: false, message: "ไม่พบไฟล์ Word ของคำสั่ง" },
      { status: 404 },
    );
  }

  try {
    const file = await downloadDriveWordFile(fileId);
    const fileName = safeWordFileName(order.docx_file_name);
    const headers = new Headers();

    headers.set("content-type", file.contentType || WORD_DOCX_MIME);
    headers.set("content-disposition", contentDisposition(fileName));
    headers.set("cache-control", "private, no-store");
    headers.set("content-length", String(file.body.length));

    return new Response(new Uint8Array(file.body), { status: 200, headers });
  } catch (downloadError) {
    console.error("Download order Word file error:", downloadError);
    return NextResponse.json(
      { ok: false, message: "ไม่สามารถดาวน์โหลดไฟล์ Word ของคำสั่งได้" },
      { status: 502 },
    );
  }
}
