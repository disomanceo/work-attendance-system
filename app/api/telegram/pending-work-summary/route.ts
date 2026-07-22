import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { collection, getDocs, limit, query } from "firebase/firestore";
import { getTelegramGroupChatIds } from "@/lib/telegram/chat-ids";
import { sendTelegramMessage } from "@/lib/telegram/send-message";
import {
  getTrainingReportFirebaseClient,
  isTrainingReportFirebaseConfigured,
  TRAINING_REPORTS_COLLECTION,
} from "@/lib/training-reports/firebase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProfileRow = {
  id: string;
  full_name: string | null;
  role: string | null;
  account_status: string | null;
};

type PendingItem = {
  teacherName: string;
  subject: string;
};

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !service) {
    throw new Error("Supabase server environment variables are not configured");
  }

  return createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function escapeHtml(value: unknown) {
  return text(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function shortTeacherName(value: unknown) {
  const name = text(value).replace(/\s+/g, " ");
  if (!name) return "ไม่ระบุชื่อ";
  return name.replace(/^(นาย|นางสาว|นาง|ว่าที่ร้อยตรี|ดร\.|ครู)\s*/u, "ครู");
}

async function requireDirector(request: Request) {
  const token = bearerToken(request);

  if (!token) {
    return { ok: false as const, message: "Missing access token", status: 401 };
  }

  const admin = adminClient();
  const {
    data: { user },
    error,
  } = await admin.auth.getUser(token);

  if (error || !user) {
    return { ok: false as const, message: "Invalid session", status: 401 };
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, full_name, role, account_status")
    .eq("id", user.id)
    .maybeSingle();

  const row = profile as ProfileRow | null;

  if (
    profileError ||
    !row ||
    row.account_status !== "active" ||
    !["admin", "director"].includes(String(row.role || ""))
  ) {
    return { ok: false as const, message: "Forbidden", status: 403 };
  }

  return { ok: true as const, admin, profile: row };
}

async function loadUnreadDocuments(admin: ReturnType<typeof adminClient>) {
  const { data, error } = await admin
    .from("smart_area_tasks")
    .select(
      `
      id,
      assignee_id,
      assignee_name_snapshot,
      assignment_opened_at,
      is_active,
      profiles!smart_area_tasks_assignee_id_fkey (
        full_name,
        account_status
      ),
      smart_area_books!inner (
        id,
        subject,
        status,
        is_active
      )
    `,
    )
    .eq("is_active", true)
    .in("status", ["assigned", "in_progress"])
    .is("assignment_opened_at", null)
    .eq("smart_area_books.is_active", true)
    .neq("smart_area_books.status", "done")
    .limit(200);

  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any): PendingItem => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    const book = Array.isArray(row.smart_area_books)
      ? row.smart_area_books[0]
      : row.smart_area_books;

    return {
      teacherName: shortTeacherName(
        row.assignee_name_snapshot || profile?.full_name,
      ),
      subject: text(book?.subject) || "ไม่ระบุเรื่อง",
    };
  });
}

async function loadUnacknowledgedOrders(admin: ReturnType<typeof adminClient>) {
  const { data: orders, error: ordersError } = await admin
    .from("order_documents")
    .select("id, subject")
    .eq("status", "APPROVED")
    .limit(200);

  if (ordersError) throw new Error(ordersError.message);

  const orderById = new Map(
    (orders ?? [])
      .map((order: any) => [text(order.id), text(order.subject)] as const)
      .filter(([id]) => Boolean(id)),
  );

  if (orderById.size === 0) return [];

  const { data, error } = await admin
    .from("order_document_recipients")
    .select("id, recipient_name_snapshot, order_document_id")
    .in("order_document_id", Array.from(orderById.keys()))
    .is("acknowledged_at", null)
    .limit(200);

  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any): PendingItem => {
    const order = { title: orderById.get(text(row.order_document_id)) };

    return {
      teacherName: shortTeacherName(row.recipient_name_snapshot),
      subject: text(order?.title) || "ไม่ระบุเรื่อง",
    };
  });
}

async function loadSubmittedTrainingAssignmentIds() {
  if (!isTrainingReportFirebaseConfigured()) return new Set<string>();

  const { db } = getTrainingReportFirebaseClient();
  const snapshot = await getDocs(
    query(collection(db, TRAINING_REPORTS_COLLECTION), limit(500)),
  );
  const doneAssignmentIds = new Set<string>();

  snapshot.docs.forEach((item) => {
    const data = item.data();
    const status = text(data.status);
    const assignmentId = text(data.sourceAssignmentId);

    if (
      assignmentId &&
      (status === "submitted" ||
        status === "not_attended" ||
        status === "draft")
    ) {
      doneAssignmentIds.add(assignmentId);
    }
  });

  return doneAssignmentIds;
}

async function loadPendingTrainingReports(
  admin: ReturnType<typeof adminClient>,
) {
  const [doneAssignmentIds, tasksResult] = await Promise.all([
    loadSubmittedTrainingAssignmentIds(),
    admin
      .from("smart_area_tasks")
      .select(
        `
        id,
        assignee_id,
        assignee_name_snapshot,
        requires_training_report,
        is_active,
        profiles!smart_area_tasks_assignee_id_fkey (
          full_name,
          account_status
        ),
        smart_area_books!inner (
          id,
          subject,
          is_active
        )
      `,
      )
      .eq("is_active", true)
      .eq("requires_training_report", true)
      .eq("smart_area_books.is_active", true)
      .limit(200),
  ]);

  if (tasksResult.error) throw new Error(tasksResult.error.message);

  return (tasksResult.data ?? [])
    .filter((row: any) => !doneAssignmentIds.has(text(row.id)))
    .map((row: any): PendingItem => {
      const profile = Array.isArray(row.profiles)
        ? row.profiles[0]
        : row.profiles;
      const book = Array.isArray(row.smart_area_books)
        ? row.smart_area_books[0]
        : row.smart_area_books;

      return {
        teacherName: shortTeacherName(
          row.assignee_name_snapshot || profile?.full_name,
        ),
        subject: text(book?.subject) || "ไม่ระบุเรื่อง",
      };
    });
}

function formatItems(label: string, items: PendingItem[]) {
  if (items.length === 0) return [];

  return [
    `<b>${escapeHtml(label)}</b>`,
    ...items.map(
      (item) =>
        `⚠️ ${escapeHtml(item.teacherName)} ${escapeHtml(label)} ${escapeHtml(
          item.subject,
        )}`,
    ),
  ];
}

function buildMessage(input: {
  unreadDocuments: PendingItem[];
  unacknowledgedOrders: PendingItem[];
  pendingTrainingReports: PendingItem[];
}) {
  const lines = [
    "📌 <b>แจ้งงานค้าง</b>",
    ...formatItems("ยังไม่เปิดหนังสือ", input.unreadDocuments),
    ...formatItems("ยังไม่รับทราบคำสั่ง", input.unacknowledgedOrders),
    ...formatItems(
      "ยังไม่รายงานการประชุม/อบรม",
      input.pendingTrainingReports,
    ),
  ];

  return lines.join("\n");
}

function splitTelegramMessage(message: string) {
  const chunks: string[] = [];
  let current = "";

  for (const line of message.split("\n")) {
    const next = current ? `${current}\n${line}` : line;

    if (next.length > 3500 && current) {
      chunks.push(current);
      current = line;
      continue;
    }

    current = next;
  }

  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [message];
}

function rejectionDetails(results: PromiseSettledResult<unknown>[]) {
  return results
    .filter(
      (result): result is PromiseRejectedResult =>
        result.status === "rejected",
    )
    .map((result) =>
      result.reason instanceof Error
        ? result.reason.message
        : String(result.reason ?? "Unknown error"),
    );
}

export async function POST(request: Request) {
  try {
    const auth = await requireDirector(request);

    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, message: auth.message },
        { status: auth.status },
      );
    }

    const chatIds = getTelegramGroupChatIds();

    if (chatIds.length === 0) {
      return NextResponse.json(
        { ok: false, message: "ยังไม่ได้ตั้งค่ากลุ่ม Telegram สำหรับแจ้งเตือน" },
        { status: 500 },
      );
    }

    const [unreadDocuments, unacknowledgedOrders, pendingTrainingReports] =
      await Promise.all([
        loadUnreadDocuments(auth.admin),
        loadUnacknowledgedOrders(auth.admin),
        loadPendingTrainingReports(auth.admin),
      ]);

    const total =
      unreadDocuments.length +
      unacknowledgedOrders.length +
      pendingTrainingReports.length;

    if (total === 0) {
      return NextResponse.json({
        ok: true,
        message: "ไม่มีงานค้างที่ต้องแจ้งเตือน",
        result: {
          sent: false,
          total,
          unreadDocuments: 0,
          unacknowledgedOrders: 0,
          pendingTrainingReports: 0,
        },
      });
    }

    const message = buildMessage({
      unreadDocuments,
      unacknowledgedOrders,
      pendingTrainingReports,
    });
    const messages = splitTelegramMessage(message);
    const results = await Promise.allSettled(
      chatIds.flatMap((chatId) =>
        messages.map((item) => sendTelegramMessage(chatId, item)),
      ),
    );
    const sentCount = results.filter((result) => result.status === "fulfilled")
      .length;
    const failedReasons = rejectionDetails(results);

    await auth.admin.from("line_notification_logs").insert({
      event_key: `pending-work-summary:${Date.now()}`,
      event_type: "pending_work_summary_telegram",
      group_id: "telegram",
      status: sentCount > 0 ? "sent" : "failed",
      response_detail: {
        actorName: auth.profile.full_name || "director",
        total,
        unreadDocuments: unreadDocuments.length,
        unacknowledgedOrders: unacknowledgedOrders.length,
        pendingTrainingReports: pendingTrainingReports.length,
        messageChunks: messages.length,
        sentCount,
        failedCount: results.length - sentCount,
        failedReasons,
      },
      sent_at: sentCount > 0 ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    });

    if (sentCount === 0) {
      return NextResponse.json(
        { ok: false, message: "ส่ง Telegram ไม่สำเร็จ" },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: `ส่งสรุปงานค้างแล้ว ${total.toLocaleString("th-TH")} รายการ`,
      result: {
        sent: true,
        total,
        unreadDocuments: unreadDocuments.length,
        unacknowledgedOrders: unacknowledgedOrders.length,
        pendingTrainingReports: pendingTrainingReports.length,
      },
    });
  } catch (error) {
    console.error("Pending work Telegram summary error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "ไม่สามารถส่งสรุปงานค้างได้",
      },
      { status: 500 },
    );
  }
}
