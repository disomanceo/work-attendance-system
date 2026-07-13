import "server-only";

import { createClient } from "@supabase/supabase-js";
import { notifyTelegramProfiles } from "@/lib/telegram/private-notifications";

type SmartAreaBook = {
  id: string;
  registration_number: string | null;
  received_date: string | null;
  source_agency: string | null;
  subject: string | null;
  document_number: string | null;
  urgency: string | null;
  note: string | null;
};

type SmartAreaTask = {
  id: string;
  book_id: string;
  assignee_id: string | null;
  assignee_name_snapshot: string | null;
  assignment_note: string | null;
  status: string;
  started_at: string | null;
  completed_at: string | null;
};

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !service) {
    throw new Error("Supabase server environment variables are not configured");
  }

  return createClient(url, service, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function escapeHtml(value: string | null | undefined) {
  return String(value ?? "-")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function thaiDateTime(value: string | null) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function thaiDate(value: string | null) {
  if (!value) return "-";

  const date = new Date(`${value}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function urgencyLabel(value: string | null) {
  const normalized = String(value || "")
    .trim()
    .replace(/\s+/g, "");

  if (normalized.includes("\u0e14\u0e48\u0e27\u0e19\u0e17\u0e35\u0e48\u0e2a\u0e38\u0e14")) {
    return "\u0e14\u0e48\u0e27\u0e19\u0e17\u0e35\u0e48\u0e2a\u0e38\u0e14";
  }

  if (normalized.includes("\u0e14\u0e48\u0e27\u0e19")) {
    return "\u0e14\u0e48\u0e27\u0e19";
  }

  return "\u0e1b\u0e01\u0e15\u0e34";
}

function displaySubject(value: string | null) {
  return String(value || "-")
    .replace(
      /\s*\[\s*(?:\u0e1b\u0e01\u0e15\u0e34|\u0e14\u0e48\u0e27\u0e19|\u0e14\u0e48\u0e27\u0e19\u0e17\u0e35\u0e48\u0e2a\u0e38\u0e14)\s*\]\s*$/u,
      "",
    )
    .trim();
}

function messageField(label: string, value: string | null | undefined) {
  return `<b>${escapeHtml(label)}</b>: ${escapeHtml(value || "-")}`;
}

async function loadBook(bookId: string) {
  const { data, error } = await adminClient()
    .from("smart_area_books")
    .select(
      "id, registration_number, received_date, source_agency, subject, document_number, urgency, note",
    )
    .eq("id", bookId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new Error(`Cannot load Smart Area book: ${error.message}`);
  }

  return (data ?? null) as SmartAreaBook | null;
}

async function loadTasksForBook(bookId: string) {
  const { data, error } = await adminClient()
    .from("smart_area_tasks")
    .select(
      "id, book_id, assignee_id, assignee_name_snapshot, assignment_note, status, started_at, completed_at",
    )
    .eq("book_id", bookId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Cannot load Smart Area tasks: ${error.message}`);
  }

  return (data ?? []) as SmartAreaTask[];
}

async function loadTask(taskId: string) {
  const { data, error } = await adminClient()
    .from("smart_area_tasks")
    .select(
      "id, book_id, assignee_id, assignee_name_snapshot, assignment_note, status, started_at, completed_at",
    )
    .eq("id", taskId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new Error(`Cannot load Smart Area task: ${error.message}`);
  }

  return (data ?? null) as SmartAreaTask | null;
}

async function loadDirectorProfileIds() {
  const { data, error } = await adminClient()
    .from("profiles")
    .select("id")
    .in("role", ["director", "admin"])
    .eq("is_active", true);

  if (error) {
    throw new Error(`Cannot load director profiles: ${error.message}`);
  }

  return (data ?? [])
    .map((profile) => String(profile.id || "").trim())
    .filter(Boolean);
}

function assignmentMessage(input: {
  book: SmartAreaBook;
  task: SmartAreaTask;
  assignedByName: string;
}) {
  return [
    "\u{1F4D7} <b>\u0e21\u0e35\u0e2b\u0e19\u0e31\u0e07\u0e2a\u0e37\u0e2d\u0e23\u0e32\u0e0a\u0e01\u0e32\u0e23\u0e21\u0e2d\u0e1a\u0e2b\u0e21\u0e32\u0e22\u0e43\u0e2b\u0e21\u0e48</b>",
    "\u0e01\u0e23\u0e38\u0e13\u0e32\u0e40\u0e1b\u0e34\u0e14\u0e2d\u0e48\u0e32\u0e19\u0e41\u0e25\u0e30\u0e14\u0e33\u0e40\u0e19\u0e34\u0e19\u0e01\u0e32\u0e23\u0e43\u0e19\u0e23\u0e30\u0e1a\u0e1a",
    "",
    "<b>\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e2b\u0e19\u0e31\u0e07\u0e2a\u0e37\u0e2d</b>",
    messageField("\u0e40\u0e25\u0e02\u0e23\u0e31\u0e1a", input.book.registration_number),
    messageField("\u0e27\u0e31\u0e19\u0e17\u0e35\u0e48\u0e23\u0e31\u0e1a", thaiDate(input.book.received_date)),
    messageField("\u0e40\u0e25\u0e02\u0e17\u0e35\u0e48\u0e2b\u0e19\u0e31\u0e07\u0e2a\u0e37\u0e2d", input.book.document_number),
    messageField("\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07", displaySubject(input.book.subject)),
    messageField("\u0e08\u0e32\u0e01", input.book.source_agency),
    messageField("\u0e04\u0e27\u0e32\u0e21\u0e40\u0e23\u0e47\u0e27", urgencyLabel(input.book.urgency)),
    ...(input.book.note ? [messageField("\u0e2b\u0e21\u0e32\u0e22\u0e40\u0e2b\u0e15\u0e38", input.book.note)] : []),
    "",
    "<b>\u0e01\u0e32\u0e23\u0e21\u0e2d\u0e1a\u0e2b\u0e21\u0e32\u0e22</b>",
    messageField("\u0e1c\u0e39\u0e49\u0e21\u0e2d\u0e1a\u0e2b\u0e21\u0e32\u0e22", input.assignedByName),
    messageField("\u0e1c\u0e39\u0e49\u0e23\u0e31\u0e1a\u0e21\u0e2d\u0e1a\u0e2b\u0e21\u0e32\u0e22", input.task.assignee_name_snapshot),
    ...(input.task.assignment_note
      ? [messageField("\u0e04\u0e33\u0e2a\u0e31\u0e48\u0e07/\u0e2b\u0e21\u0e32\u0e22\u0e40\u0e2b\u0e15\u0e38", input.task.assignment_note)]
      : []),
  ].join("\n");
}

function statusMessage(input: {
  book: SmartAreaBook;
  task: SmartAreaTask;
  nextStatus: string;
  actorName: string;
}) {
  const isDone = input.nextStatus === "done";
  const timestamp = isDone ? input.task.completed_at : input.task.started_at;

  return [
    isDone
      ? "\u2705 <b>\u0e14\u0e33\u0e40\u0e19\u0e34\u0e19\u0e01\u0e32\u0e23\u0e2b\u0e19\u0e31\u0e07\u0e2a\u0e37\u0e2d\u0e23\u0e32\u0e0a\u0e01\u0e32\u0e23\u0e40\u0e2a\u0e23\u0e47\u0e08\u0e2a\u0e34\u0e49\u0e19\u0e41\u0e25\u0e49\u0e27</b>"
      : "\u25B6\uFE0F <b>\u0e40\u0e23\u0e34\u0e48\u0e21\u0e14\u0e33\u0e40\u0e19\u0e34\u0e19\u0e01\u0e32\u0e23\u0e2b\u0e19\u0e31\u0e07\u0e2a\u0e37\u0e2d\u0e23\u0e32\u0e0a\u0e01\u0e32\u0e23\u0e41\u0e25\u0e49\u0e27</b>",
    "",
    "<b>\u0e01\u0e32\u0e23\u0e14\u0e33\u0e40\u0e19\u0e34\u0e19\u0e01\u0e32\u0e23</b>",
    messageField("\u0e1c\u0e39\u0e49\u0e14\u0e33\u0e40\u0e19\u0e34\u0e19\u0e01\u0e32\u0e23", input.actorName || input.task.assignee_name_snapshot),
    messageField("\u0e40\u0e27\u0e25\u0e32", thaiDateTime(timestamp)),
    "",
    "<b>\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e2b\u0e19\u0e31\u0e07\u0e2a\u0e37\u0e2d</b>",
    messageField("\u0e40\u0e25\u0e02\u0e23\u0e31\u0e1a", input.book.registration_number),
    messageField("\u0e40\u0e25\u0e02\u0e17\u0e35\u0e48\u0e2b\u0e19\u0e31\u0e07\u0e2a\u0e37\u0e2d", input.book.document_number),
    messageField("\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07", displaySubject(input.book.subject)),
    messageField("\u0e08\u0e32\u0e01", input.book.source_agency),
    messageField("\u0e04\u0e27\u0e32\u0e21\u0e40\u0e23\u0e47\u0e27", urgencyLabel(input.book.urgency)),
  ].join("\n");
}

export async function notifySmartAreaAssignmentsTelegram(input: {
  bookId: string;
  actorProfileId: string;
  assignedByName: string;
}) {
  const [book, tasks] = await Promise.all([
    loadBook(input.bookId),
    loadTasksForBook(input.bookId),
  ]);

  if (!book) {
    return { requested: 0, sent: 0, skipped: 0, failed: 0 };
  }

  let requested = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const task of tasks) {
    if (task.status !== "assigned" || !task.assignee_id) continue;

    const result = await notifyTelegramProfiles({
      event: "document.assigned",
      recipientProfileIds: [task.assignee_id],
      actorProfileId: input.actorProfileId,
      entityType: "smart_area_task",
      entityId: task.id,
      text: assignmentMessage({
        book,
        task,
        assignedByName: input.assignedByName,
      }),
      metadata: {
        bookId: book.id,
        taskId: task.id,
      },
    });

    requested += result.requested;
    sent += result.sent;
    skipped += result.skipped;
    failed += result.failed;
  }

  return { requested, sent, skipped, failed };
}

export async function notifySmartAreaTaskStatusTelegram(input: {
  taskId: string;
  nextStatus: string;
  actorProfileId: string;
  actorName: string;
}) {
  if (!["in_progress", "done"].includes(input.nextStatus)) {
    return { requested: 0, sent: 0, skipped: 0, failed: 0 };
  }

  const task = await loadTask(input.taskId);
  if (!task) {
    return { requested: 0, sent: 0, skipped: 0, failed: 0 };
  }

  const [book, directorProfileIds] = await Promise.all([
    loadBook(task.book_id),
    loadDirectorProfileIds(),
  ]);

  if (!book || directorProfileIds.length === 0) {
    return { requested: 0, sent: 0, skipped: 0, failed: 0 };
  }

  return notifyTelegramProfiles({
    event:
      input.nextStatus === "done"
        ? "document.completed"
        : "document.started",
    recipientProfileIds: directorProfileIds,
    actorProfileId: input.actorProfileId,
    entityType: "smart_area_task",
    entityId: task.id,
    text: statusMessage({
      book,
      task,
      nextStatus: input.nextStatus,
      actorName: input.actorName,
    }),
    metadata: {
      bookId: book.id,
      taskId: task.id,
      taskStatus: input.nextStatus,
    },
  });
}
