import { NextResponse } from "next/server";
import { authorizeAnnouncementRequest } from "@/lib/announcement-auth";
import {
  getTeachingDriveConfig,
  uploadPdfToDrive,
} from "@/lib/teaching-supervision/drive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_PDF_SIZE = 20 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const auth = await authorizeAnnouncementRequest(request);
    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, message: auth.message },
        { status: auth.status },
      );
    }

    const config = getTeachingDriveConfig();
    if (!config) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "ยังไม่ได้ตั้งค่า Apps Script สำหรับระบบนิเทศการสอน",
        },
        { status: 500 },
      );
    }

    const formData = await request.formData();
    const inspectionId = String(formData.get("inspectionId") || "").trim();
    const inspectionDate = String(formData.get("inspectionDate") || "").trim();
    const teacherName = String(formData.get("teacherName") || "").trim();
    const existingDriveFileId = String(formData.get("existingDriveFileId") || "").trim();
    const file = formData.get("file");

    if (!inspectionId || !inspectionDate || !teacherName) {
      return NextResponse.json(
        { ok: false, message: "ข้อมูลรายงาน PDF ไม่ครบ" },
        { status: 400 },
      );
    }

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { ok: false, message: "กรุณาส่งไฟล์ PDF" },
        { status: 400 },
      );
    }

    if (file.type !== "application/pdf" || file.size > MAX_PDF_SIZE) {
      return NextResponse.json(
        { ok: false, message: "ไฟล์ต้องเป็น PDF และขนาดไม่เกิน 20 MB" },
        { status: 400 },
      );
    }

    const uploaded = await uploadPdfToDrive({
      config,
      inspectionDate,
      inspectionId,
      teacherName,
      file,
      existingDriveFileId,
    });

    return NextResponse.json({ ok: true, pdfReport: uploaded });
  } catch (error) {
    console.error("Teaching supervision PDF upload error:", error);
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "อัปโหลดรายงาน PDF ไป Google Drive ไม่สำเร็จ",
      },
      { status: 500 },
    );
  }
}
