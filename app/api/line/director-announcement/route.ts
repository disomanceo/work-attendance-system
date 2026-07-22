import { NextResponse } from "next/server";
import {
  isSmartAreaManagerRole,
  requireSmartAreaUser,
} from "@/lib/smart-area/auth";
import {
  directorAnnouncementFlex,
  getDirectorLineTarget,
  pushDirectorLineMessages,
} from "@/lib/line/director-announcements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AnnouncementBody = {
  message?: unknown;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

export async function POST(request: Request) {
  try {
    const auth = await requireSmartAreaUser(request);

    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, message: auth.message },
        { status: auth.status },
      );
    }

    if (!isSmartAreaManagerRole(auth.profile.role)) {
      return NextResponse.json(
        {
          ok: false,
          message: "เฉพาะผู้อำนวยการหรือผู้ดูแลระบบเท่านั้น",
        },
        { status: 403 },
      );
    }

    const body = (await request.json().catch(() => null)) as
      | AnnouncementBody
      | null;
    const message = text(body?.message);

    if (message.length < 2) {
      return NextResponse.json(
        { ok: false, message: "กรุณาพิมพ์ข้อความประกาศ" },
        { status: 400 },
      );
    }

    if (message.length > 2000) {
      return NextResponse.json(
        { ok: false, message: "ข้อความประกาศยาวเกิน 2,000 ตัวอักษร" },
        { status: 400 },
      );
    }

    const target = await getDirectorLineTarget();

    if (!target.ok) {
      return NextResponse.json(
        { ok: false, message: target.message },
        { status: 500 },
      );
    }

    const eventKey = `director-announcement-line:${crypto.randomUUID()}`;
    const lineResult = await pushDirectorLineMessages(
      target.groupId,
      [
        directorAnnouncementFlex({
          directorName: auth.profile.full_name || "ผู้อำนวยการ",
          message,
        }),
      ],
      target.token,
    );

    await auth.admin.from("line_notification_logs").insert({
      event_key: eventKey,
      event_type: "director_announcement_line",
      group_id: target.groupId,
      status: lineResult.ok ? "sent" : "failed",
      response_detail: {
        result: lineResult,
        channel: target.channel,
        actorName: auth.profile.full_name || "director",
      },
      sent_at: lineResult.ok ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    });

    if (!lineResult.ok) {
      return NextResponse.json(
        {
          ok: false,
          lineSent: false,
          message: lineResult.message || "ส่งประกาศเข้า LINE ไม่สำเร็จ",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      lineSent: true,
      message: "ส่งประกาศเข้า LINE แล้ว",
    });
  } catch (error) {
    console.error("Director LINE announcement error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "ไม่สามารถส่งประกาศจาก ผอ. ได้",
      },
      { status: 500 },
    );
  }
}
