import { NextResponse } from "next/server";
import { requireSmartAreaUser } from "@/lib/smart-area/auth";
import { notifySmartAreaAssignments } from "@/lib/line/smart-area-notifications";

type ActionBody = {
  action?: unknown;
  bookId?: unknown;
  assigneeIds?: unknown;
  note?: unknown;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

export async function POST(request: Request) {
  const auth = await requireSmartAreaUser(request);

  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, message: auth.message },
      { status: auth.status },
    );
  }

  const body = (await request.json().catch(() => null)) as ActionBody | null;
  const action = text(body?.action);
  const bookId = text(body?.bookId);
  const note = text(body?.note);
  const assigneeIds = stringArray(body?.assigneeIds);

  if (!bookId) {
    return NextResponse.json(
      { ok: false, message: "ไม่พบรหัสหนังสือราชการ" },
      { status: 400 },
    );
  }

  const isManager =
    auth.profile.role === "admin" || auth.profile.role === "director";
  const isClerk = auth.profile.work_permissions.includes("smart_area.clerk");

  if (action === "submit") {
    const { data, error } = await auth.admin.rpc(
      "submit_smart_area_book_to_director",
      {
        p_book_id: bookId,
        p_actor_id: auth.profile.id,
        p_allowed: isManager || isClerk,
      },
    );

    if (error) {
      console.error("Submit Smart Area book error:", error);
      return NextResponse.json(
        { ok: false, message: "ไม่สามารถเสนอหนังสือต่อผู้อำนวยการได้" },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true, bookId, bookStatus: data });
  }

  if (action === "assign") {
    if (assigneeIds.length === 0) {
      return NextResponse.json(
        { ok: false, message: "กรุณาเลือกผู้รับมอบหมายอย่างน้อย 1 คน" },
        { status: 400 },
      );
    }

    const { data, error } = await auth.admin.rpc(
      "replace_smart_area_assignments",
      {
        p_book_id: bookId,
        p_actor_id: auth.profile.id,
        p_assignee_ids: assigneeIds,
        p_assignment_note: note || null,
        p_allowed: isManager,
      },
    );

    if (error) {
      console.error("Assign Smart Area book error:", error);
      return NextResponse.json(
        { ok: false, message: "ไม่สามารถบันทึกผู้รับมอบหมายได้" },
        { status: isManager ? 400 : 403 },
      );
    }

    const result = Array.isArray(data) ? data[0] : null;

    try {
      await notifySmartAreaAssignments({
        bookId,
        assignedByName: auth.profile.full_name || "ผู้อำนวยการ",
      });
    } catch (notifyError) {
      console.error("Smart Area assignment LINE notification error:", notifyError);
    }

    return NextResponse.json({
      ok: true,
      bookId,
      bookStatus: result?.book_status || "assigned",
      retainedCount: result?.retained_count || 0,
      addedCount: result?.added_count || 0,
      removedCount: result?.removed_count || 0,
    });
  }

  if (action === "close") {
    const { data, error } = await auth.admin.rpc(
      "close_smart_area_book_without_task",
      {
        p_book_id: bookId,
        p_actor_id: auth.profile.id,
        p_note: note || null,
        p_allowed: isManager || isClerk,
      },
    );

    if (error) {
      console.error("Close Smart Area book error:", error);
      return NextResponse.json(
        { ok: false, message: "ไม่สามารถปิดหนังสือราชการได้" },
        { status: isManager || isClerk ? 400 : 403 },
      );
    }

    return NextResponse.json({ ok: true, bookId, bookStatus: data });
  }

  return NextResponse.json(
    { ok: false, message: "คำสั่งไม่ถูกต้อง" },
    { status: 400 },
  );
}
