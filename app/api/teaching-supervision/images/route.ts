import { NextResponse } from "next/server";
import { authorizeAnnouncementRequest } from "@/lib/announcement-auth";
import {
  getTeachingDriveConfig,
  uploadImageToDrive,
} from "@/lib/teaching-supervision/drive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

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
    const slot = Number(formData.get("slot") || 0);
    const category = String(formData.get("category") || "").trim();
    const file = formData.get("file");

    if (!inspectionId || !inspectionDate || !slot || !category) {
      return NextResponse.json(
        { ok: false, message: "ข้อมูลรูปหลักฐานไม่ครบ" },
        { status: 400 },
      );
    }

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { ok: false, message: "กรุณาเลือกรูปหลักฐาน" },
        { status: 400 },
      );
    }

    if (!file.type.startsWith("image/") || file.size > MAX_IMAGE_SIZE) {
      return NextResponse.json(
        { ok: false, message: "รูปต้องเป็นไฟล์ภาพและขนาดไม่เกิน 10 MB" },
        { status: 400 },
      );
    }

    const uploaded = await uploadImageToDrive({
      config,
      inspectionDate,
      inspectionId,
      slot,
      category,
      file,
    });

    return NextResponse.json({ ok: true, image: uploaded });
  } catch (error) {
    console.error("Teaching supervision image upload error:", error);
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "อัปโหลดรูปหลักฐานไป Google Drive ไม่สำเร็จ",
      },
      { status: 500 },
    );
  }
}
