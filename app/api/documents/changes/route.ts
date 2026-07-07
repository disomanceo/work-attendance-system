import { NextResponse } from "next/server";
import { requireSmartAreaUser } from "@/lib/smart-area/auth";
import {
  SMART_AREA_DOCUMENT_SELECT,
  serializeSmartAreaBook,
  smartAreaText,
} from "@/lib/smart-area/document-response";

export const dynamic = "force-dynamic";

function validIsoDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function GET(request: Request) {
  const auth = await requireSmartAreaUser(request);

  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, books: [], deletedIds: [], message: auth.message },
      { status: auth.status },
    );
  }

  const url = new URL(request.url);
  const after = validIsoDate(url.searchParams.get("after") || "");

  if (!after) {
    return NextResponse.json(
      {
        ok: false,
        books: [],
        deletedIds: [],
        message: "ไม่พบเวลาตรวจสอบข้อมูลล่าสุด",
      },
      { status: 400 },
    );
  }

  let visibleBookIds: string[] | null = null;

  if (!auth.canManageAll) {
    const { data: taskRows, error: taskError } = await auth.admin
      .from("smart_area_tasks")
      .select("book_id")
      .eq("assignee_id", auth.profile.id)
      .eq("is_active", true);

    if (taskError) {
      console.error("Load changed-document visibility error:", taskError);
      return NextResponse.json(
        {
          ok: false,
          books: [],
          deletedIds: [],
          message: "ไม่สามารถตรวจสอบสิทธิ์รายการหนังสือได้",
        },
        { status: 500 },
      );
    }

    visibleBookIds = Array.from(
      new Set(
        (taskRows ?? [])
          .map((row) => smartAreaText(row.book_id))
          .filter(Boolean),
      ),
    );

    if (visibleBookIds.length === 0) {
      const { data: state } = await auth.admin
        .from("smart_area_sync_state")
        .select("version, last_change_at")
        .eq("id", "documents")
        .maybeSingle();

      return NextResponse.json({
        ok: true,
        books: [],
        deletedIds: [],
        version: Number(state?.version || 0),
        lastChangeAt: state?.last_change_at || after,
      });
    }
  }

  let query = auth.admin
    .from("smart_area_books")
    .select(SMART_AREA_DOCUMENT_SELECT)
    .gt("updated_at", after)
    .order("updated_at", { ascending: true });

  if (visibleBookIds) query = query.in("id", visibleBookIds);

  const { data: rows, error } = await query;

  if (error) {
    console.error("Load changed Smart Area documents error:", error);
    return NextResponse.json(
      {
        ok: false,
        books: [],
        deletedIds: [],
        message: "ไม่สามารถโหลดรายการที่เปลี่ยนแปลงได้",
      },
      { status: 500 },
    );
  }

  const activeRows = (rows ?? []).filter((book: any) => book.is_active);
  const deletedIds = (rows ?? [])
    .filter((book: any) => !book.is_active)
    .map((book: any) => smartAreaText(book.id))
    .filter(Boolean);

  const activeIds = activeRows
    .map((book: any) => smartAreaText(book.id))
    .filter(Boolean);

  let readBookIds = new Set<string>();

  if (activeIds.length > 0) {
    const { data: readRows, error: readError } = await auth.admin
      .from("smart_area_book_reads")
      .select("book_id")
      .eq("user_id", auth.profile.id)
      .in("book_id", activeIds);

    if (readError) {
      console.error("Load changed-document read state error:", readError);
    } else {
      readBookIds = new Set(
        (readRows ?? [])
          .map((row) => smartAreaText(row.book_id))
          .filter(Boolean),
      );
    }
  }

  const { data: state, error: stateError } = await auth.admin
    .from("smart_area_sync_state")
    .select("version, last_change_at")
    .eq("id", "documents")
    .maybeSingle();

  if (stateError) {
    console.error("Load Smart Area sync state error:", stateError);
  }

  return NextResponse.json({
    ok: true,
    books: activeRows.map((book: any) =>
      serializeSmartAreaBook(book, {
        canManageAll: auth.canManageAll,
        profileId: auth.profile.id,
        readBookIds,
      }),
    ),
    deletedIds,
    version: Number(state?.version || 0),
    lastChangeAt: state?.last_change_at || new Date().toISOString(),
  });
}
