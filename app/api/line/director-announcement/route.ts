import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
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

type ProfileRow = {
  id: string;
  full_name: string | null;
  role: string | null;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function todayBangkok() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function timestampBangkok() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value || "";

  return `${value("year")}${value("month")}${value("day")}-${value("hour")}${value("minute")}`;
}

async function loadRecipients(
  admin: SupabaseClient,
) {
  const { data, error } = await admin
    .from("profiles")
    .select("id, full_name, role")
    .eq("account_status", "active")
    .in("role", ["teacher", "staff"]);

  if (error) throw new Error(error.message);

  return ((data ?? []) as ProfileRow[]).filter((profile) => profile.id);
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
        { ok: false, message: "เฉพาะผู้อำนวยการหรือผู้ดูแลระบบเท่านั้น" },
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

    const [target, recipients] = await Promise.all([
      getDirectorLineTarget(),
      loadRecipients(auth.admin),
    ]);

    if (!target.ok) {
      return NextResponse.json(
        { ok: false, message: target.message },
        { status: 500 },
      );
    }

    if (recipients.length === 0) {
      return NextResponse.json(
        { ok: false, message: "ไม่พบรายชื่อครู/เจ้าหน้าที่ที่เปิดใช้งาน" },
        { status: 400 },
      );
    }

    const legacySmartAreaId = `director-announcement:${crypto.randomUUID()}`;
    const receivedDate = todayBangkok();
    const documentNumber = `ประกาศ ผอ. ${timestampBangkok()}`;

    const { data: book, error: bookError } = await auth.admin
      .from("smart_area_books")
      .insert({
        legacy_smart_area_id: legacySmartAreaId,
        registration_number: documentNumber,
        received_date: receivedDate,
        source_agency: "ผู้อำนวยการโรงเรียน",
        subject: "ประกาศจาก ผอ.",
        document_number: documentNumber,
        document_date: receivedDate,
        document_type: "ประกาศ",
        urgency: "ปกติ",
        status: "assigned",
        note: message,
        director_note: message,
        source_system: "director-announcement",
        legacy_payload: {
          kind: "director-announcement",
          message,
          actorName: auth.profile.full_name,
        },
        created_by: auth.profile.id,
        updated_by: auth.profile.id,
      })
      .select("id")
      .single();

    if (bookError || !book?.id) {
      throw new Error(bookError?.message || "Cannot create announcement");
    }

    const taskRows = recipients.map((profile) => ({
      book_id: book.id,
      legacy_smart_area_id: legacySmartAreaId,
      legacy_sheet_row: 0,
      legacy_task_key: `${legacySmartAreaId}:task:${profile.id}`,
      assignee_id: profile.id,
      assignee_name_snapshot: text(profile.full_name) || "ครู",
      assigned_by: auth.profile.id,
      assignment_note: message,
      status: "assigned",
      is_active: true,
      created_by: auth.profile.id,
      updated_by: auth.profile.id,
    }));

    const { error: taskError } = await auth.admin
      .from("smart_area_tasks")
      .insert(taskRows);

    if (taskError) throw new Error(taskError.message);

    const lineResult = await pushDirectorLineMessages(target.groupId, [
      directorAnnouncementFlex({
        bookId: book.id,
        directorName: auth.profile.full_name || "ผู้อำนวยการ",
        message,
      }),
    ]);

    await auth.admin.from("line_notification_logs").insert({
      event_key: `director-announcement:${book.id}`,
      event_type: "director_announcement_line",
      group_id: target.groupId,
      status: lineResult.ok ? "sent" : "failed",
      response_detail: {
        result: lineResult,
        actorName: auth.profile.full_name || "director",
        recipientCount: recipients.length,
      },
      sent_at: lineResult.ok ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    });

    if (!lineResult.ok) {
      return NextResponse.json(
        {
          ok: false,
          message: lineResult.message || "ส่งประกาศเข้า LINE ไม่สำเร็จ",
          bookId: book.id,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: `ส่งประกาศจาก ผอ. แล้ว (${recipients.length.toLocaleString("th-TH")} คนต้องรับทราบ)`,
      bookId: book.id,
      recipientCount: recipients.length,
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
