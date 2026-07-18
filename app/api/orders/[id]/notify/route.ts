import { NextResponse } from "next/server";
import { notifyOrderAssignedTelegram } from "@/lib/telegram/order-workflow-notifications";
import {
  authorizeOrderRequest,
  isOrderManager,
} from "@/lib/order-auth";

export const dynamic = "force-dynamic";

type NotifyBody = {
  recipientIds?: unknown;
};

function normalizeRecipientIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => String(item ?? "").trim())
        .filter(Boolean),
    ),
  ).slice(0, 100);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authorizeOrderRequest(request);

    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, message: auth.message },
        { status: auth.status },
      );
    }

    if (!isOrderManager(auth.profile.role)) {
      return NextResponse.json(
        { ok: false, message: "เฉพาะ ผอ. หรือ Admin เท่านั้น" },
        { status: 403 },
      );
    }

    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as NotifyBody | null;
    const recipientIds = normalizeRecipientIds(body?.recipientIds);

    if (recipientIds.length === 0) {
      return NextResponse.json(
        { ok: false, message: "กรุณาเลือกรายชื่อครูที่ต้องแจ้งคำสั่ง" },
        { status: 400 },
      );
    }

    const { data: order, error: orderError } = await auth.admin
      .from("order_documents")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (orderError || !order) {
      return NextResponse.json(
        { ok: false, message: "ไม่พบรายการคำสั่ง" },
        { status: 404 },
      );
    }

    if (order.status !== "APPROVED") {
      return NextResponse.json(
        { ok: false, message: "แจ้งคำสั่งได้เฉพาะรายการที่อนุมัติแล้ว" },
        { status: 409 },
      );
    }

    const { data: profiles, error: profilesError } = await auth.admin
      .from("profiles")
      .select("id, full_name, position, role, account_status")
      .in("id", recipientIds)
      .eq("account_status", "active");

    if (profilesError) {
      throw new Error(profilesError.message);
    }

    const profileRows = (profiles ?? []).filter(
      (profile) => !["director", "admin"].includes(String(profile.role || "")),
    );

    if (profileRows.length === 0) {
      return NextResponse.json(
        { ok: false, message: "ไม่พบครูที่เปิดใช้งานตามรายชื่อที่เลือก" },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const rows = profileRows.map((profile) => ({
      order_document_id: id,
      profile_id: profile.id,
      recipient_name_snapshot: profile.full_name,
      recipient_position_snapshot: profile.position || null,
      notified_by: auth.profile.id,
      notified_at: now,
    }));

    const { error: saveError } = await auth.admin
      .from("order_document_recipients")
      .upsert(rows, { onConflict: "order_document_id,profile_id" });

    if (saveError) {
      throw new Error(saveError.message);
    }

    await auth.admin.from("order_document_logs").insert({
      order_document_id: id,
      actor_id: auth.profile.id,
      action: "NOTIFY_RECIPIENTS",
      from_status: order.status,
      to_status: order.status,
      revision_number: Number(order.revision_count || 0),
      note: `แจ้งคำสั่งให้ครู ${profileRows.length} คน`,
    });

    await notifyOrderAssignedTelegram({
      orderId: id,
      recipientProfileIds: profileRows.map((profile) => profile.id),
      actorProfileId: auth.profile.id,
      actorName: auth.profile.full_name,
      orderNumber: order.order_number,
      subject: order.subject,
      orderDate: order.order_date,
      pdfFileUrl: order.pdf_file_url || null,
    }).catch((telegramError) => {
      console.error("Telegram order assigned notification error:", telegramError);
    });

    const { data: recipients, error: recipientsError } = await auth.admin
      .from("order_document_recipients")
      .select("*")
      .eq("order_document_id", id)
      .order("recipient_name_snapshot", { ascending: true });

    if (recipientsError) {
      throw new Error(recipientsError.message);
    }

    return NextResponse.json({
      ok: true,
      recipients: recipients ?? [],
      message: `แจ้งคำสั่งให้ครู ${profileRows.length} คนแล้ว`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error ? error.message : "แจ้งคำสั่งไม่สำเร็จ",
      },
      { status: 500 },
    );
  }
}
