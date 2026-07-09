import "server-only";

import {
  getLineAdminClient,
  type LineMessage,
} from "@/lib/line/client";

type AdminClient = NonNullable<ReturnType<typeof getLineAdminClient>>;

type SmartAreaBook = {
  id: string;
  registration_number: string | null;
  received_date: string | null;
  source_agency: string | null;
  subject: string | null;
  document_number: string | null;
  urgency: string | null;
};

type SmartAreaTask = {
  id: string;
  book_id: string;
  assignee_id: string | null;
  assignee_name_snapshot: string | null;
  assignment_note: string | null;
  status: string;
  is_active: boolean;
  created_at: string;
};

type ProfileLineUser = {
  id: string;
  full_name: string | null;
  line_user_id: string | null;
};

type LegacyLineUserLink = {
  profile_id: string;
  line_user_id: string;
  is_active: boolean;
};

const GREEN = "#1B8A5A";
const TEXT = "#0F172A";
const MUTED = "#64748B";

function text(value: string, extra: Record<string, unknown> = {}) {
  return {
    type: "text",
    text: value || "-",
    size: "sm",
    color: TEXT,
    wrap: true,
    ...extra,
  };
}

function row(label: string, value: string) {
  return {
    type: "box",
    layout: "horizontal",
    margin: "sm",
    alignItems: "flex-start",
    contents: [
      text(label, {
        size: "xs",
        color: MUTED,
        weight: "bold",
        flex: 0,
      }),
      text(value || "-", {
        flex: 1,
        margin: "md",
      }),
    ],
  };
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

function thaiDate(value: string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00+07:00`));
}

async function parseLineResponse(response: Response) {
  const raw = await response.text();
  let detail: unknown = raw;

  try {
    detail = raw ? JSON.parse(raw) : null;
  } catch {}

  return response.ok
    ? { ok: true as const, status: response.status }
    : {
        ok: false as const,
        status: response.status,
        message: "LINE direct message failed",
        detail,
      };
}

async function pushDirectLineMessages(
  to: string,
  messages: LineMessage[],
) {
  const token =
    process.env.LINE_DIRECT_CHANNEL_ACCESS_TOKEN?.trim() ||
    process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();

  if (!token) {
    return {
      ok: false as const,
      message:
        "LINE_DIRECT_CHANNEL_ACCESS_TOKEN หรือ LINE_CHANNEL_ACCESS_TOKEN is not configured",
    };
  }

  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to, messages }),
    cache: "no-store",
  });

  return parseLineResponse(response);
}

async function wasSent(admin: AdminClient, key: string) {
  const { data } = await admin
    .from("line_notification_logs")
    .select("status")
    .eq("event_key", key)
    .maybeSingle();

  return data?.status === "sent";
}

async function logResult(
  admin: AdminClient,
  key: string,
  to: string,
  result: unknown,
  sent: boolean,
) {
  await admin.from("line_notification_logs").upsert(
    {
      event_key: key,
      event_type: "smart_area_assignment_direct",
      group_id: `user:${to}`,
      status: sent ? "sent" : "failed",
      response_detail: result,
      sent_at: sent ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "event_key" },
  );
}

async function loadBook(admin: AdminClient, bookId: string) {
  const { data, error } = await admin
    .from("smart_area_books")
    .select(
      "id, registration_number, received_date, source_agency, subject, document_number, urgency",
    )
    .eq("id", bookId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("Load Smart Area book for LINE notification error:", error);
    return null;
  }

  return (data ?? null) as SmartAreaBook | null;
}

async function loadTasks(admin: AdminClient, bookId: string) {
  const { data, error } = await admin
    .from("smart_area_tasks")
    .select(
      "id, book_id, assignee_id, assignee_name_snapshot, assignment_note, status, is_active, created_at",
    )
    .eq("book_id", bookId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Load Smart Area tasks for LINE notification error:", error);
    return [];
  }

  return (data ?? []) as SmartAreaTask[];
}

async function loadLineRecipients(
  admin: AdminClient,
  profileIds: string[],
) {
  const uniqueProfileIds = Array.from(new Set(profileIds.filter(Boolean)));
  const recipients = new Map<string, string>();

  if (uniqueProfileIds.length === 0) return recipients;

  const profileResult = await admin
    .from("profiles")
    .select("id, full_name, line_user_id")
    .in("id", uniqueProfileIds);

  if (profileResult.error) {
    console.error("Load profile LINE user IDs error:", profileResult.error);
  } else {
    for (const profile of (profileResult.data ?? []) as ProfileLineUser[]) {
      const lineUserId = String(profile.line_user_id || "").trim();
      if (profile.id && lineUserId) {
        recipients.set(profile.id, lineUserId);
      }
    }
  }

  const missingProfileIds = uniqueProfileIds.filter(
    (profileId) => !recipients.has(profileId),
  );

  if (missingProfileIds.length === 0) return recipients;

  const legacyResult = await admin
    .from("smart_area_line_user_links")
    .select("profile_id, line_user_id, is_active")
    .in("profile_id", missingProfileIds)
    .eq("is_active", true);

  if (legacyResult.error) {
    console.error("Load legacy Smart Area LINE user links error:", legacyResult.error);
    return recipients;
  }

  for (const item of (legacyResult.data ?? []) as LegacyLineUserLink[]) {
    const lineUserId = String(item.line_user_id || "").trim();
    if (item.profile_id && lineUserId) {
      recipients.set(item.profile_id, lineUserId);
    }
  }

  return recipients;
}

function assignmentFlex(input: {
  book: SmartAreaBook;
  task: SmartAreaTask;
  assignedByName: string;
}) {
  const openUrl = documentUrl(input.book.id);
  const title = "มีหนังสือราชการมอบหมายใหม่";

  return {
    type: "flex",
    altText: `${title}: ${input.book.subject || "-"}`,
    contents: {
      type: "bubble",
      size: "kilo",
      header: {
        type: "box",
        layout: "vertical",
        paddingAll: "12px",
        backgroundColor: GREEN,
        contents: [
          text(title, {
            color: "#FFFFFF",
            weight: "bold",
            size: "md",
          }),
          text("กรุณาเปิดอ่านและดำเนินการในระบบ", {
            color: "#ECFDF5",
            size: "xxs",
            margin: "xs",
          }),
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "12px",
        spacing: "none",
        contents: [
          row("เลขรับ", input.book.registration_number || "-"),
          row("วันที่รับ", thaiDate(input.book.received_date)),
          row("เรื่อง", input.book.subject || "-"),
          row("จาก", input.book.source_agency || "-"),
          row("ความเร็ว", input.book.urgency || "-"),
          row("ผู้มอบหมาย", input.assignedByName || "ผู้อำนวยการ"),
          ...(input.task.assignment_note
            ? [row("หมายเหตุ", input.task.assignment_note)]
            : []),
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "12px",
        contents: [
          {
            type: "button",
            style: "primary",
            height: "sm",
            color: GREEN,
            action: {
              type: "uri",
              label: "เปิดหนังสือราชการ",
              uri: openUrl,
            },
          },
        ],
      },
    },
  } as LineMessage;
}

export async function notifySmartAreaAssignments(input: {
  bookId: string;
  assignedByName?: string;
}) {
  const admin = getLineAdminClient();
  if (!admin || !input.bookId) {
    return {
      ok: false as const,
      sentCount: 0,
      failedCount: 0,
      message: "Supabase admin client is not configured",
    };
  }

  const [book, tasks] = await Promise.all([
    loadBook(admin, input.bookId),
    loadTasks(admin, input.bookId),
  ]);

  if (!book || tasks.length === 0) {
    return {
      ok: true as const,
      sentCount: 0,
      failedCount: 0,
      skipped: true,
    };
  }

  const taskByProfileId = tasks.filter(
    (task) => task.status === "assigned" && task.assignee_id,
  );
  const lineRecipients = await loadLineRecipients(
    admin,
    taskByProfileId
      .map((task) => task.assignee_id)
      .filter((id): id is string => Boolean(id)),
  );

  let sentCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (const task of taskByProfileId) {
    const profileId = task.assignee_id;
    if (!profileId) continue;

    const lineUserId = lineRecipients.get(profileId);
    if (!lineUserId) {
      skippedCount += 1;
      continue;
    }

    const key = `smart-area-assignment:${task.id}`;
    if (await wasSent(admin, key)) {
      skippedCount += 1;
      continue;
    }

    const result = await pushDirectLineMessages(lineUserId, [
      assignmentFlex({
        book,
        task,
        assignedByName: input.assignedByName || "ผู้อำนวยการ",
      }),
    ]);

    await logResult(admin, key, lineUserId, result, result.ok);

    if (result.ok) {
      sentCount += 1;
    } else {
      failedCount += 1;
      console.error("Smart Area LINE assignment notification failed:", result);
    }
  }

  return {
    ok: failedCount === 0,
    sentCount,
    failedCount,
    skippedCount,
  };
}
