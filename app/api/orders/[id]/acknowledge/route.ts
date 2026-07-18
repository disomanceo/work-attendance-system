import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyOrderAcknowledgedTelegram } from "@/lib/telegram/order-workflow-notifications";
import { authorizeOrderRequest, isOrderManager } from "@/lib/order-auth";

export const dynamic = "force-dynamic";

async function loadManagerProfileIds(admin: SupabaseClient) {
  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .in("role", ["director", "admin"])
    .eq("account_status", "active");

  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((profile) => String(profile.id || "").trim())
    .filter(Boolean);
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

    const { id } = await context.params;
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

    const { data: currentRecipient, error: recipientError } = await auth.admin
      .from("order_document_recipients")
      .select("*")
      .eq("order_document_id", id)
      .eq("profile_id", auth.profile.id)
      .maybeSingle();

    if (recipientError || !currentRecipient) {
      return NextResponse.json(
        { ok: false, message: "คุณไม่ได้อยู่ในรายชื่อผู้รับแจ้งคำสั่งนี้" },
        { status: 403 },
      );
    }

    if (currentRecipient.acknowledged_at) {
      const { data: recipients, error: recipientsError } = await auth.admin
        .from("order_document_recipients")
        .select("*")
        .eq("order_document_id", id)
        .order("recipient_name_snapshot", { ascending: true });

      if (recipientsError) throw new Error(recipientsError.message);

      return NextResponse.json({
        ok: true,
        recipients: recipients ?? [],
        message: "รับทราบคำสั่งแล้ว",
      });
    }

    const now = new Date().toISOString();
    const { data: saved, error: saveError } = await auth.admin
      .from("order_document_recipients")
      .update({
        acknowledged_by: auth.profile.id,
        acknowledged_at: now,
      })
      .eq("id", currentRecipient.id)
      .select("*")
      .single();

    if (saveError || !saved) {
      throw new Error(saveError?.message || "บันทึกการรับทราบไม่สำเร็จ");
    }

    await auth.admin.from("order_document_logs").insert({
      order_document_id: id,
      actor_id: auth.profile.id,
      action: "ACKNOWLEDGE_RECIPIENT",
      from_status: order.status,
      to_status: order.status,
      revision_number: Number(order.revision_count || 0),
      note: "รับทราบคำสั่ง",
    });

    const managerIds = await loadManagerProfileIds(auth.admin);
    const notifyIds = Array.from(
      new Set([
        ...managerIds,
        String(currentRecipient.notified_by || ""),
      ].filter((profileId) => profileId && profileId !== auth.profile.id)),
    );

    if (notifyIds.length > 0 && !isOrderManager(auth.profile.role)) {
      await notifyOrderAcknowledgedTelegram({
        orderId: id,
        recipientProfileIds: notifyIds,
        actorProfileId: auth.profile.id,
        actorName: auth.profile.full_name,
        orderNumber: order.order_number,
        subject: order.subject,
        orderDate: order.order_date,
      }).catch((telegramError) => {
        console.error(
          "Telegram order acknowledged notification error:",
          telegramError,
        );
      });
    }

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
      message: "บันทึกรับทราบคำสั่งแล้ว",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error ? error.message : "รับทราบคำสั่งไม่สำเร็จ",
      },
      { status: 500 },
    );
  }
}
