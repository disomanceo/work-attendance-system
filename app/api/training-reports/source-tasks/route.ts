import { NextResponse } from "next/server";
import { requireSmartAreaUser } from "@/lib/smart-area/auth";
import type { TrainingReportSourceTask } from "@/lib/training-reports/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function text(value: unknown) {
  return String(value ?? "").trim();
}

export async function GET(request: Request) {
  const auth = await requireSmartAreaUser(request);
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope");

  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, tasks: [], message: auth.message },
      { status: auth.status },
    );
  }

  let query = auth.admin
    .from("smart_area_tasks")
    .select(
      `
      id,
      assignee_id,
      assignee_name_snapshot,
      status,
      assignment_note,
      requires_training_report,
      is_active,
      profiles!smart_area_tasks_assignee_id_fkey (
        profile_image_file_id
      ),
      smart_area_books!inner (
        id,
        registration_number,
        document_number,
        subject,
        document_date,
        received_date,
        status,
        is_active
      )
    `,
    )
    .eq("is_active", true)
    .eq("requires_training_report", true)
    .in("status", ["assigned", "in_progress", "done"])
    .order("created_at", { ascending: false })
    .limit(100);

  if (scope === "mine" || !auth.canManageAll) {
    query = query.eq("assignee_id", auth.profile.id);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Load training report source tasks error:", error);
    return NextResponse.json(
      {
        ok: false,
        tasks: [],
        message: "ไม่สามารถโหลดงานหนังสือราชการที่ได้รับมอบหมายได้",
      },
      { status: 500 },
    );
  }

  const tasks: TrainingReportSourceTask[] = (data ?? [])
    .map((row: any) => {
      const book = Array.isArray(row.smart_area_books)
        ? row.smart_area_books[0]
        : row.smart_area_books;

      return {
        taskId: text(row.id),
        bookId: text(book?.id),
        assigneeId: text(row.assignee_id),
        assigneeName: text(row.assignee_name_snapshot),
        assigneeImageFileId: text(
          Array.isArray(row.profiles)
            ? row.profiles[0]?.profile_image_file_id
            : row.profiles?.profile_image_file_id,
        ),
        status: text(row.status),
        requiresTrainingReport: row.requires_training_report === true,
        assignmentNote: text(row.assignment_note),
        registrationNumber: text(book?.registration_number),
        documentNumber: text(book?.document_number),
        subject: text(book?.subject),
        documentDate: text(book?.document_date),
        receivedDate: text(book?.received_date),
      };
    })
    .filter((task) => task.taskId && task.bookId);

  return NextResponse.json({
    ok: true,
    tasks,
    currentProfile: auth.profile,
    canManageAll: auth.canManageAll,
  });
}
