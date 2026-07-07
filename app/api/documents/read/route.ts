import { NextResponse } from "next/server";
import { requireSmartAreaUser } from "@/lib/smart-area/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireSmartAreaUser(request);

  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, message: auth.message },
      { status: auth.status },
    );
  }

  let payload: { bookId?: unknown };

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "ข้อมูลคำขอไม่ถูกต้อง" },
      { status: 400 },
    );
  }

  const bookId = String(payload.bookId ?? "").trim();

  if (!bookId) {
    return NextResponse.json(
      { ok: false, message: "ไม่พบรหัสหนังสือ" },
      { status: 400 },
    );
  }

  const { error } = await auth.admin
    .from("smart_area_book_reads")
    .upsert(
      {
        book_id: bookId,
        user_id: auth.profile.id,
        read_at: new Date().toISOString(),
      },
      { onConflict: "book_id,user_id" },
    );

  if (error) {
    console.error("Mark Smart Area book as read error:", error);
    return NextResponse.json(
      { ok: false, message: "ไม่สามารถบันทึกสถานะการอ่านได้" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, bookId });
}
