import "server-only";

import { createClient } from "@supabase/supabase-js";
import { sendTelegramMessage } from "@/lib/telegram/send-message";

type SmartAreaTaskDetail = {
  id: string;
  assignee_name_snapshot: string | null;
  completed_at: string | null;
  smart_area_books: {
    id: string;
    registration_number: string | null;
    subject: string | null;
    source_agency: string | null;
  } | null;
};

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return null;

  return createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getTelegramChatIds() {
  const configured =
    process.env.TELEGRAM_ALLOWED_CHAT_IDS?.trim() ||
    process.env.TELEGRAM_CHAT_ID?.trim() ||
    "";

  return configured
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
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

function escapeHtml(value: string) {
  return value
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

async function wasSent(key: string) {
  const admin = adminClient();
  if (!admin) return false;

  const { data } = await admin
    .from("line_notification_logs")
    .select("status")
    .eq("event_key", key)
    .maybeSingle();

  return data?.status === "sent";
}

async function logResult(
  key: string,
  sent: boolean,
  result: unknown,
) {
  const admin = adminClient();
  if (!admin) return;

  await admin.from("line_notification_logs").upsert(
    {
      event_key: key,
      event_type: "smart_area_done_telegram",
      group_id: "telegram",
      status: sent ? "sent" : "failed",
      response_detail: result,
      sent_at: sent ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "event_key" },
  );
}

async function loadTask(taskId: string) {
  const admin = adminClient();
  if (!admin) return null;

  const { data, error } = await admin
    .from("smart_area_tasks")
    .select(
      "id, assignee_name_snapshot, completed_at, smart_area_books ( id, registration_number, subject, source_agency )",
    )
    .eq("id", taskId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("Load Smart Area done task for Telegram error:", error);
    return null;
  }

  return (data ?? null) as SmartAreaTaskDetail | null;
}

function buildDoneMessage(task: SmartAreaTaskDetail) {
  const book = task.smart_area_books;
  const bookId = book?.id || "";
  const link = bookId ? documentUrl(bookId) : "";

  return [
    "<b>หนังสือราชการ: ครูทำงานเสร็จแล้ว</b>",
    "",
    `ผู้ดำเนินการ: ${escapeHtml(task.assignee_name_snapshot || "-")}`,
    `เลขรับ: ${escapeHtml(book?.registration_number || "-")}`,
    `เรื่อง: ${escapeHtml(book?.subject || "-")}`,
    `จาก: ${escapeHtml(book?.source_agency || "-")}`,
    `เวลาเสร็จ: ${escapeHtml(thaiDateTime(task.completed_at))}`,
    ...(link ? [`เปิดหนังสือ: ${escapeHtml(link)}`] : []),
  ].join("\n");
}

export async function notifySmartAreaTaskDone(input: {
  taskId: string;
  nextStatus: string;
}) {
  if (input.nextStatus !== "done" || !input.taskId) {
    return { sent: false, skipped: true };
  }

  const key = `smart-area-task-done:${input.taskId}`;
  if (await wasSent(key)) return { sent: false, skipped: true };

  const chatIds = getTelegramChatIds();
  if (chatIds.length === 0) {
    return {
      sent: false,
      sentCount: 0,
      failedCount: 0,
      message:
        "TELEGRAM_ALLOWED_CHAT_IDS หรือ TELEGRAM_CHAT_ID ไม่ได้ตั้งค่า",
    };
  }

  const task = await loadTask(input.taskId);
  if (!task) {
    return { sent: false, sentCount: 0, failedCount: 0 };
  }

  const message = buildDoneMessage(task);
  const results = await Promise.allSettled(
    chatIds.map((chatId) => sendTelegramMessage(chatId, message)),
  );
  const sentCount = results.filter(
    (result) => result.status === "fulfilled",
  ).length;
  const failedCount = results.length - sentCount;

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(
        `Smart Area done Telegram failed for chat ${chatIds[index]}:`,
        result.reason,
      );
    }
  });

  await logResult(
    key,
    sentCount > 0,
    results.map((result) =>
      result.status === "fulfilled"
        ? { ok: true }
        : {
            ok: false,
            reason:
              result.reason instanceof Error
                ? result.reason.message
                : String(result.reason),
          },
    ),
  );

  return {
    sent: sentCount > 0,
    sentCount,
    failedCount,
  };
}
