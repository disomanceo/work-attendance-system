import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTelegramGroupChatIds } from "@/lib/telegram/chat-ids";
import { sendTelegramMessage } from "@/lib/telegram/send-message";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProfileRow = {
  id: string;
  full_name: string | null;
  role: string | null;
  account_status: string | null;
};

type PendingCount = {
  teacherName: string;
  count: number;
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

  return name
    .replace(
      /^(นาย|นางสาว|นาง|ว่าที่ร้อยตรี|ว่าที่ร\.ต\.|ดร\.|ครู)\s*/u,
      "ครู",
    )
    .trim();
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

function addCount(map: Map<string, number>, teacherName: unknown) {
  const name = shortTeacherName(teacherName);
  map.set(name, (map.get(name) ?? 0) + 1);
}

async function loadUnacknowledgedSmartAreaTasks(
  admin: ReturnType<typeof adminClient>,
) {
  const { data, error } = await admin
    .from("smart_area_tasks")
    .select(
      `
      id,
      assignee_name_snapshot,
      assignment_acknowledged_at,
      is_active,
      profiles!smart_area_tasks_assignee_id_fkey (
        full_name,
        account_status
      ),
      smart_area_books!inner (
        id,
        status,
        is_active
      )
    `,
    )
    .eq("is_active", true)
    .in("status", ["assigned", "in_progress"])
    .is("assignment_acknowledged_at", null)
    .eq("smart_area_books.is_active", true)
    .neq("smart_area_books.status", "done")
    .limit(1000);

  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return row.assignee_name_snapshot || profile?.full_name;
  });
}

async function loadUnacknowledgedOrderRecipients(
  admin: ReturnType<typeof adminClient>,
) {
  const { data: orders, error: ordersError } = await admin
    .from("order_documents")
    .select("id")
    .eq("status", "APPROVED")
    .limit(1000);

  if (ordersError) throw new Error(ordersError.message);

  const orderIds = (orders ?? []).map((order: any) => text(order.id));
  if (orderIds.length === 0) return [];

  const { data, error } = await admin
    .from("order_document_recipients")
    .select("id, recipient_name_snapshot, order_document_id")
    .in("order_document_id", orderIds)
    .is("acknowledged_at", null)
    .limit(1000);

  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any) => row.recipient_name_snapshot);
}

async function loadUnacknowledgedCounts(
  admin: ReturnType<typeof adminClient>,
) {
  const [documentNames, orderNames] = await Promise.all([
    loadUnacknowledgedSmartAreaTasks(admin),
    loadUnacknowledgedOrderRecipients(admin),
  ]);

  const counts = new Map<string, number>();
  for (const name of [...documentNames, ...orderNames]) addCount(counts, name);

  return Array.from(counts.entries())
    .map(([teacherName, count]) => ({ teacherName, count }))
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.teacherName.localeCompare(right.teacherName, "th"),
    );
}

function buildMessage(items: PendingCount[]) {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  const lines = [
    "<b>มีงานที่ยังไม่รับทราบ</b>",
    `ทั้งหมด ${total.toLocaleString("th-TH")} งาน`,
    "",
    ...items.map(
      (item) =>
        `${escapeHtml(item.teacherName)}  ${item.count.toLocaleString(
          "th-TH",
        )}  งาน`,
    ),
  ];

  return lines.join("\n");
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
        {
          ok: false,
          message: "ยังไม่ได้ตั้งค่ากลุ่ม Telegram สำหรับแจ้งเตือน",
        },
        { status: 500 },
      );
    }

    const pendingCounts = await loadUnacknowledgedCounts(auth.admin);
    const total = pendingCounts.reduce((sum, item) => sum + item.count, 0);

    if (total === 0) {
      return NextResponse.json({
        ok: true,
        message: "ไม่มีงานที่ยังไม่รับทราบ",
        result: {
          sent: false,
          total,
          people: 0,
        },
      });
    }

    const message = buildMessage(pendingCounts);
    const results = await Promise.allSettled(
      chatIds.map((chatId) => sendTelegramMessage(chatId, message)),
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
        people: pendingCounts.length,
        sentCount,
        failedCount: results.length - sentCount,
        failedReasons,
      },
      sent_at: sentCount > 0 ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    });

    if (sentCount === 0) {
      return NextResponse.json(
        {
          ok: false,
          message: failedReasons[0] || "ส่ง Telegram ไม่สำเร็จ",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: `ส่งสรุปงานที่ยังไม่รับทราบแล้ว ${total.toLocaleString(
        "th-TH",
      )} งาน`,
      result: {
        sent: true,
        total,
        people: pendingCounts.length,
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
            : "ไม่สามารถส่งสรุปงานที่ยังไม่รับทราบได้",
      },
      { status: 500 },
    );
  }
}
