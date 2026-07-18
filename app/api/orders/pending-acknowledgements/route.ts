import { NextResponse } from "next/server";
import { authorizeOrderRequest } from "@/lib/order-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await authorizeOrderRequest(request);

    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, message: auth.message },
        { status: auth.status },
      );
    }

    const { count, error } = await auth.admin
      .from("order_document_recipients")
      .select("id, order_documents!inner(status)", {
        count: "exact",
        head: true,
      })
      .eq("profile_id", auth.profile.id)
      .is("acknowledged_at", null)
      .eq("order_documents.status", "APPROVED");

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      ok: true,
      count: count ?? 0,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "โหลดจำนวนคำสั่งที่ต้องรับทราบไม่สำเร็จ",
      },
      { status: 500 },
    );
  }
}
