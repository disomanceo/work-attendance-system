import { NextResponse } from "next/server";
import { notifyOrderReviewedTelegram } from "@/lib/telegram/order-workflow-notifications";
import {
  authorizeOrderRequest,
  isOrderManager,
} from "@/lib/order-auth";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorizeOrderRequest(request);

    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, message: auth.message },
        { status: auth.status }
      );
    }

    if (!isOrderManager(auth.profile.role)) {
      return NextResponse.json(
        { ok: false, message: "เน€เธเธเธฒเธฐ เธเธญ. เธซเธฃเธทเธญ Admin เน€เธ—เนเธฒเธเธฑเนเธ" },
        { status: 403 }
      );
    }

    const { id } = await context.params;
    const body = await request.json();
    const action = String(body.action ?? "");
    const note = String(body.note ?? "").trim();

    if (!["approve", "return"].includes(action)) {
      return NextResponse.json(
        { ok: false, message: "เธเธณเธชเธฑเนเธเธ”เธณเน€เธเธดเธเธเธฒเธฃเนเธกเนเธ–เธนเธเธ•เนเธญเธ" },
        { status: 400 }
      );
    }

    if (action === "return" && note.length < 3) {
      return NextResponse.json(
        {
          ok: false,
          message: "เธเธฃเธธเธ“เธฒเธฃเธฐเธเธธเธฃเธฒเธขเธฅเธฐเน€เธญเธตเธขเธ”เธ—เธตเนเธ•เนเธญเธเนเธเนเนเธเธญเธขเนเธฒเธเธเนเธญเธข 3 เธ•เธฑเธงเธญเธฑเธเธฉเธฃ",
        },
        { status: 400 }
      );
    }

    const { data: current, error: loadError } = await auth.admin
      .from("order_documents")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (loadError || !current) {
      return NextResponse.json(
        { ok: false, message: "เนเธกเนเธเธเธฃเธฒเธขเธเธฒเธฃเธเธณเธชเธฑเนเธ" },
        { status: 404 }
      );
    }

    if (current.status !== "PENDING") {
      return NextResponse.json(
        {
          ok: false,
          message: "เธเธดเธเธฒเธฃเธ“เธฒเนเธ”เนเน€เธเธเธฒเธฐเธฃเธฒเธขเธเธฒเธฃเธ—เธตเนเธฃเธญเธญเธเธธเธกเธฑเธ•เธด",
        },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const nextStatus =
      action === "approve" ? "APPROVED" : "REVISION";
    const nextRevision =
      action === "return"
        ? Number(current.revision_count ?? 0) + 1
        : Number(current.revision_count ?? 0);

    const update =
      action === "approve"
        ? {
            status: nextStatus,
            approved_by: auth.profile.id,
            approved_at: now,
            updated_at: now,
          }
        : {
            status: nextStatus,
            revision_count: nextRevision,
            latest_revision_note: note,
            returned_by: auth.profile.id,
            returned_at: now,
            updated_at: now,
          };

    const { data: saved, error: saveError } = await auth.admin
      .from("order_documents")
      .update(update)
      .eq("id", id)
      .select("*")
      .single();

    if (saveError || !saved) {
      throw new Error(
        saveError?.message || "เธเธฑเธเธ—เธถเธเธเธฅเธเธฒเธฃเธเธดเธเธฒเธฃเธ“เธฒเนเธกเนเธชเธณเน€เธฃเนเธ"
      );
    }

    await auth.admin.from("order_document_logs").insert({
      order_document_id: id,
      actor_id: auth.profile.id,
      action:
        action === "approve"
          ? "APPROVE"
          : "RETURN_FOR_REVISION",
      from_status: current.status,
      to_status: nextStatus,
      revision_number: nextRevision,
      note: note || null,
    });

    await notifyOrderReviewedTelegram({
      orderId: saved.id,
      recipientProfileId: saved.responsible_user_id,
      reviewerProfileId: auth.profile.id,
      reviewerName: auth.profile.full_name,
      approved: action === "approve",
      orderNumber: saved.order_number,
      subject: saved.subject,
      orderDate: saved.order_date,
      revisionCount: nextRevision,
      reviewNote: note || null,
      pdfFileUrl: saved.pdf_file_url || null,
    }).catch((telegramError) => {
      console.error("Telegram order reviewed notification error:", telegramError);
    });

    return NextResponse.json({
      ok: true,
      order: saved,
      message:
        action === "approve"
          ? "เธญเธเธธเธกเธฑเธ•เธดเธเธณเธชเธฑเนเธเน€เธฃเธตเธขเธเธฃเนเธญเธขเนเธฅเนเธง"
          : `เธชเนเธเธเธฅเธฑเธเนเธเนเนเธ เธเธฃเธฑเนเธเธ—เธตเน ${nextRevision} เนเธฅเนเธง`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "เธเธดเธเธฒเธฃเธ“เธฒเธเธณเธชเธฑเนเธเนเธกเนเธชเธณเน€เธฃเนเธ",
      },
      { status: 500 }
    );
  }
}
