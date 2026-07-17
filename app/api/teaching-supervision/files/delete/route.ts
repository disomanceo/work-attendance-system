import { NextResponse } from "next/server";
import { authorizeAnnouncementRequest } from "@/lib/announcement-auth";
import {
  deleteDriveFile,
  getTeachingDriveConfig,
} from "@/lib/teaching-supervision/drive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    const body = (await request.json()) as { driveFileId?: unknown };
    const driveFileId = String(body.driveFileId || "").trim();

    if (!driveFileId) {
      return NextResponse.json(
        { ok: false, message: "ไม่พบ Drive file id" },
        { status: 400 },
      );
    }

    await deleteDriveFile(config, driveFileId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Teaching supervision delete Drive file error:", error);
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error ? error.message : "ลบไฟล์ใน Google Drive ไม่สำเร็จ",
      },
      { status: 500 },
    );
  }
}
