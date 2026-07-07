import { NextResponse } from "next/server";
import { requireSmartAreaUser } from "@/lib/smart-area/auth";

type AssignmentReadBody = {
  taskId?: unknown;
  attachmentId?: unknown;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

export async function POST(request: Request) {
  const auth = await requireSmartAreaUser(request);

  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, message: auth.message },
      { status: auth.status },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | AssignmentReadBody
    | null;

  const taskId = text(body?.taskId);
  const attachmentId = text(body?.attachmentId);

  if (!taskId || !attachmentId) {
    return NextResponse.json(
      { ok: false, message: "ข้อมูลการเปิดอ่านไม่ครบถ้วน" },
      { status: 400 },
    );
  }

  const { data: task, error: taskError } = await auth.admin
    .from("smart_area_tasks")
    .select("id, book_id, assignee_id, assignment_opened_at")
    .eq("id", taskId)
    .eq("assignee_id", auth.profile.id)
    .eq("is_active", true)
    .maybeSingle();

  if (taskError || !task) {
    return NextResponse.json(
      { ok: false, message: "ไม่พบงานมอบหมายของผู้ใช้" },
      { status: 404 },
    );
  }

  const { data: attachment, error: attachmentError } = await auth.admin
    .from("smart_area_attachments")
    .select("id, book_id, attachment_type")
    .eq("id", attachmentId)
    .eq("book_id", task.book_id)
    .eq("attachment_type", "signed")
    .eq("status", "active")
    .eq("is_active", true)
    .maybeSingle();

  if (attachmentError || !attachment) {
    return NextResponse.json(
      { ok: false, message: "ไม่พบไฟล์แจ้งมอบหมาย" },
      { status: 404 },
    );
  }

  const openedAt = task.assignment_opened_at || new Date().toISOString();

  if (!task.assignment_opened_at) {
    const { error: updateError } = await auth.admin
      .from("smart_area_tasks")
      .update({
        assignment_opened_at: openedAt,
        updated_by: auth.profile.id,
      })
      .eq("id", task.id)
      .eq("assignee_id", auth.profile.id)
      .is("assignment_opened_at", null);

    if (updateError) {
      console.error("Update assignment opened status error:", updateError);
      return NextResponse.json(
        { ok: false, message: "ไม่สามารถบันทึกสถานะการเปิดอ่านได้" },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    taskId: task.id,
    bookId: task.book_id,
    assignmentOpenedAt: openedAt,
  });
}
