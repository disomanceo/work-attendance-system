import { NextResponse } from "next/server";
import { requireSmartAreaUser } from "@/lib/smart-area/auth";
import {
  SMART_AREA_DOCUMENT_SELECT,
  serializeSmartAreaBook,
  smartAreaText,
} from "@/lib/smart-area/document-response";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ bookId: string }> },
) {
  const auth = await requireSmartAreaUser(request);

  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, book: null, message: auth.message },
      { status: auth.status },
    );
  }

  const { bookId: rawBookId } = await context.params;
  const bookId = smartAreaText(rawBookId);

  if (!bookId) {
    return NextResponse.json(
      { ok: false, book: null, message: "ไม่พบรหัสหนังสือ" },
      { status: 400 },
    );
  }

  if (!auth.canManageAll) {
    const { data: task, error: taskError } = await auth.admin
      .from("smart_area_tasks")
      .select("id")
      .eq("book_id", bookId)
      .eq("assignee_id", auth.profile.id)
      .eq("is_active", true)
      .maybeSingle();

    if (taskError || !task) {
      return NextResponse.json(
        { ok: false, book: null, message: "คุณไม่มีสิทธิ์ดูหนังสือรายการนี้" },
        { status: 403 },
      );
    }
  }

  const { data: book, error } = await auth.admin
    .from("smart_area_books")
    .select(SMART_AREA_DOCUMENT_SELECT)
    .eq("id", bookId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("Load one Smart Area document error:", error);
    return NextResponse.json(
      { ok: false, book: null, message: "ไม่สามารถโหลดหนังสือรายการนี้ได้" },
      { status: 500 },
    );
  }

  if (!book) {
    return NextResponse.json(
      { ok: false, book: null, message: "ไม่พบหนังสือรายการนี้" },
      { status: 404 },
    );
  }

  const { data: readRow } = await auth.admin
    .from("smart_area_book_reads")
    .select("book_id")
    .eq("book_id", bookId)
    .eq("user_id", auth.profile.id)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    book: serializeSmartAreaBook(book, {
      canManageAll: auth.canManageAll,
      profileId: auth.profile.id,
      readBookIds: new Set(readRow ? [bookId] : []),
    }),
  });
}
