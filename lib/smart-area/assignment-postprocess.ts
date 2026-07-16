import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

export async function refreshSmartAreaAssignmentDelivery(input: {
  admin: SupabaseClient;
  bookId: string;
  actorId: string;
  assigneeIds: string[];
  assignmentNote: string;
}) {
  const bookId = cleanText(input.bookId);
  const actorId = cleanText(input.actorId);
  const assigneeIds = Array.from(
    new Set(input.assigneeIds.map(cleanText).filter(Boolean)),
  );

  if (!bookId || !actorId || assigneeIds.length === 0) return;

  const now = new Date().toISOString();
  const assignmentNote = cleanText(input.assignmentNote) || null;

  const { data: tasks, error: taskLoadError } = await input.admin
    .from("smart_area_tasks")
    .select("id")
    .eq("book_id", bookId)
    .eq("is_active", true)
    .in("assignee_id", assigneeIds);

  if (taskLoadError) {
    console.error("Load retained Smart Area assignments error:", taskLoadError);
    return;
  }

  const taskIds = (tasks ?? [])
    .map((task) => cleanText(task.id))
    .filter(Boolean);

  if (taskIds.length === 0) return;

  const { error: taskUpdateError } = await input.admin
    .from("smart_area_tasks")
    .update({
      assignment_note: assignmentNote,
      assignment_opened_at: null,
      assignment_acknowledged_at: null,
      updated_at: now,
      updated_by: actorId,
    })
    .in("id", taskIds);

  if (taskUpdateError) {
    console.error("Refresh Smart Area assignment note error:", taskUpdateError);
  }

  const eventKeys = taskIds.map((taskId) => `smart-area-assignment:${taskId}`);
  const { error: lineLogDeleteError } = await input.admin
    .from("line_notification_logs")
    .delete()
    .in("event_key", eventKeys);

  if (lineLogDeleteError) {
    console.error(
      "Clear Smart Area assignment LINE notification logs error:",
      lineLogDeleteError,
    );
  }
}
