import { NextResponse } from "next/server";
import { requireSmartAreaUser } from "@/lib/smart-area/auth";
import { notifySmartAreaTaskStatusTelegram } from "@/lib/telegram/smart-area-workflow-notifications";

type UpdateTaskBody = {
  taskId?: unknown;
  status?: unknown;
};

const allowedStatuses = new Set(["assigned", "in_progress", "done"]);

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

  const body = (await request.json().catch(() => null)) as UpdateTaskBody | null;
  const taskId = text(body?.taskId);
  const nextStatus = text(body?.status);

  if (!taskId || !allowedStatuses.has(nextStatus)) {
    return NextResponse.json(
      { ok: false, message: "ข้อมูลการเปลี่ยนสถานะไม่ถูกต้อง" },
      { status: 400 },
    );
  }

  const managerRole =
    auth.profile.role === "admin" || auth.profile.role === "director";

  const { data, error } = await auth.admin.rpc(
    "update_smart_area_task_status",
    {
      p_task_id: taskId,
      p_actor_id: auth.profile.id,
      p_next_status: nextStatus,
      p_can_manage_all: managerRole,
    },
  );

  if (error) {
    console.error("Update Smart Area task status error:", error);

    const message = String(error.message || "");
    const forbidden =
      message.includes("cannot update") ||
      message.includes("cannot be reopened");

    return NextResponse.json(
      {
        ok: false,
        message: forbidden
          ? "คุณไม่มีสิทธิ์เปลี่ยนสถานะงานนี้"
          : "ไม่สามารถเปลี่ยนสถานะงานได้",
      },
      { status: forbidden ? 403 : 500 },
    );
  }

  const result = Array.isArray(data) ? data[0] : null;

  try {
    await notifySmartAreaTaskStatusTelegram({
      taskId,
      nextStatus,
      actorProfileId: auth.profile.id,
      actorName: auth.profile.full_name || "ผู้ดำเนินการ",
    });
  } catch (notifyError) {
    console.error("Smart Area Telegram status notification error:", notifyError);
  }

  return NextResponse.json({
    ok: true,
    taskId,
    taskStatus: result?.task_status || nextStatus,
    bookId: result?.book_id || null,
    bookStatus: result?.book_status || null,
  });
}
