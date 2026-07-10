import "server-only";

import { createClient } from "@supabase/supabase-js";
import { notifyTelegramProfiles } from "@/lib/telegram/private-notifications";

type SmartAreaBook = {
  id: string;
  registration_number: string | null;
  received_date: string | null;
  source_agency: string | null;
  subject: string | null;
  urgency: string | null;
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

function appUrl() {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (explicit) return explicit;

  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return production ? `https://${production}` : "http://localhost:3000";
}

function documentUrl(bookId: string) {
  return `${appUrl()}/documents?book=${encodeURIComponent(bookId)}`;
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

async function loadBook(bookId: string) {
  const { data, error } = await adminClient()
    .from("smart_area_books")
    .select(
      "id, registration_number, received_date, source_agency, subject, urgency",
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
    "📄 <b>มีหนังสือราชการมอบหมายใหม่</b>",
    "",
    `เลขรับ: ${escapeHtml(input.book.registration_number)}`,
    `เรื่อง: ${escapeHtml(input.book.subject)}`,
    `จาก: ${escapeHtml(input.book.source_agency)}`,
    `ความเร็ว: ${escapeHtml(input.book.urgency)}`,
    `ผู้มอบหมาย: ${escapeHtml(input.assignedByName)}`,
    ...(input.task.assignment_note
      ? [`หมายเหตุ: ${escapeHtml(input.task.assignment_note)}`]
      : []),
    "",
    `เปิดหนังสือ: ${escapeHtml(documentUrl(input.book.id))}`,
  ].join("\n");
}

function statusMessage(input: {
  book: SmartAreaBook;
  task: SmartAreaTask;
  nextStatus: string;
  actorName: string;
}) {
  const isDone = input.nextStatus === "done";
  const heading = isDone
    ? "✅ <b>ครูดำเนินการหนังสือราชการเสร็จสิ้นแล้ว</b>"
    : "▶️ <b>ครูเริ่มดำเนินการหนังสือราชการแล้ว</b>";
  const timestamp = isDone ? input.task.completed_at : input.task.started_at;

  return [
    heading,
    "",
    `ผู้ดำเนินการ: ${escapeHtml(input.actorName || input.task.assignee_name_snapshot)}`,
    `เลขรับ: ${escapeHtml(input.book.registration_number)}`,
    `เรื่อง: ${escapeHtml(input.book.subject)}`,
    `จาก: ${escapeHtml(input.book.source_agency)}`,
    `เวลา: ${escapeHtml(thaiDateTime(timestamp))}`,
    "",
    `เปิดหนังสือ: ${escapeHtml(documentUrl(input.book.id))}`,
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
