import { NextResponse } from "next/server";
import { requireBudgetUser } from "@/lib/budget/supabase-server";

export const dynamic = "force-dynamic";

type AttachmentRow = {
  id: string;
  drive_file_id: string;
  file_name: string;
  file_url: string;
  mime_type: string | null;
};

type ActivityRow = {
  id: string;
  legacy_activity_id: string | null;
  name: string;
  owner_name_snapshot: string | null;
  status: string;
  funding_source: string | null;
  approved_budget: number | string;
  legacy_actual_amount: number | string;
  start_date: string | null;
  end_date: string | null;
};

export async function GET(request: Request) {
  const auth = await requireBudgetUser(request);

  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, projects: [], message: auth.message },
      { status: auth.status },
    );
  }

  const { data, error } = await auth.admin
    .from("budget_projects")
    .select(`
      id,
      legacy_project_id,
      project_code,
      fiscal_year,
      name,
      plan_name,
      department,
      owner_name_snapshot,
      status,
      approved_budget,
      legacy_actual_amount,
      start_date,
      end_date,
      budget_activities (
        id,
        legacy_activity_id,
        name,
        owner_name_snapshot,
        status,
        funding_source,
        approved_budget,
        legacy_actual_amount,
        start_date,
        end_date,
        sort_order
      ),
      budget_project_attachments (
        id,
        drive_file_id,
        file_name,
        file_url,
        mime_type,
        activity_id,
        is_active
      )
    `)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Load Supabase budget projects error:", error);
    return NextResponse.json(
      { ok: false, projects: [], message: "ไม่สามารถโหลดโครงการจาก Supabase ได้" },
      { status: 500 },
    );
  }

  const projects = (data ?? []).map((row: any) => {
    const projectAttachments = (row.budget_project_attachments ?? [])
      .filter((file: any) => file.is_active && !file.activity_id)
      .map((file: AttachmentRow) => ({
        id: file.drive_file_id || file.id,
        fileId: file.drive_file_id,
        name: file.file_name,
        fileName: file.file_name,
        url: file.file_url,
        webViewLink: file.file_url,
        mimeType: file.mime_type || "",
      }));

    const activities = (row.budget_activities ?? [])
      .sort((a: any, b: any) => Number(a.sort_order) - Number(b.sort_order))
      .map((activity: ActivityRow) => ({
        ID: activity.legacy_activity_id || activity.id,
        ProjectID: row.legacy_project_id || row.id,
        ActivityName: activity.name,
        OwnerName: activity.owner_name_snapshot || "",
        Status: activity.status,
        BudgetSource: activity.funding_source || "",
        ApprovedBudget: Number(activity.approved_budget || 0),
        SpentBudget: Number(activity.legacy_actual_amount || 0),
        StartDate: activity.start_date || "",
        EndDate: activity.end_date || "",
      }));

    return {
      ID: row.legacy_project_id || row.id,
      ProjectCode: row.project_code || "",
      FiscalYear: row.fiscal_year ? String(row.fiscal_year) : "",
      ProjectName: row.name,
      PlanName: row.plan_name || "",
      Department: row.department || row.plan_name || "",
      OwnerName: row.owner_name_snapshot || "",
      Status: row.status,
      ApprovedBudget: Number(row.approved_budget || 0),
      SpentBudget: Number(row.legacy_actual_amount || 0),
      StartDate: row.start_date || "",
      EndDate: row.end_date || "",
      UseActivities: activities.length > 0,
      ActivitiesList: activities,
      AttachmentsJSON: projectAttachments,
    };
  });

  return NextResponse.json({
    ok: true,
    configured: true,
    source: "supabase",
    projects,
  });
}
