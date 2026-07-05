import { NextResponse } from "next/server";
import { requireBudgetUser } from "@/lib/budget/supabase-server";

function text(value: unknown) {
  return String(value ?? "").trim();
}

async function canStartBudgetProjects(auth: Awaited<ReturnType<typeof requireBudgetUser>>) {
  if (!auth.ok) return false;

  const role = text(auth.profile.role).toLowerCase();
  if (role === "admin" || role === "director") return true;

  const { data } = await auth.admin
    .from("profiles")
    .select("work_permissions")
    .eq("id", auth.profile.id)
    .maybeSingle();

  const permissions = Array.isArray(data?.work_permissions)
    ? data.work_permissions.map((item: unknown) => text(item))
    : [];

  return permissions.includes("budget.procurement");
}

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
      budget_payment_records (
        activity_id,
        amount,
        status
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

  const canStartProjects = await canStartBudgetProjects(auth);

  const projects = (data ?? []).map((row: any) => {
    const activePayments = (row.budget_payment_records ?? []).filter(
      (payment: any) => payment.status === "active"
    );

    const actualPaid = activePayments.reduce(
      (sum: number, payment: any) =>
        sum + Number(payment.amount || 0),
      0
    );
    const calculatedStatus = row.status;

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
      .map((activity: ActivityRow) => {
        const activityPaid = activePayments
          .filter((payment: any) => payment.activity_id === activity.id)
          .reduce(
            (sum: number, payment: any) =>
              sum + Number(payment.amount || 0),
            0
          );

        return {
          SupabaseID: activity.id,
          ID: activity.legacy_activity_id || activity.id,
          ProjectID: row.legacy_project_id || row.id,
          ActivityName: activity.name,
          OwnerName: activity.owner_name_snapshot || "",
          Status: activity.status,
          BudgetSource: activity.funding_source || "",
          ApprovedBudget: Number(activity.approved_budget || 0),
          SpentBudget: activityPaid,
          StartDate: activity.start_date || "",
          EndDate: activity.end_date || "",
        };
      });

    return {
      SupabaseID: row.id,
      ID: row.legacy_project_id || row.id,
      ProjectCode: row.project_code || "",
      FiscalYear: row.fiscal_year ? String(row.fiscal_year) : "",
      ProjectName: row.name,
      PlanName: row.plan_name || "",
      Department: row.department || row.plan_name || "",
      OwnerName: row.owner_name_snapshot || "",
      Status: calculatedStatus,
      ApprovedBudget: Number(row.approved_budget || 0),
      SpentBudget: actualPaid,
      StartDate: row.start_date || "",
      EndDate: row.end_date || "",
      UseActivities: activities.length > 0,
      ActivitiesList: activities,
      AttachmentsJSON: projectAttachments,
    };
  });

  projects.sort((a: any, b: any) => {
    const aCode = String(a.ProjectCode || a.ID || "");
    const bCode = String(b.ProjectCode || b.ID || "");

    return aCode.localeCompare(bCode, "th", {
      numeric: true,
      sensitivity: "base",
    });
  });

  return NextResponse.json({
    ok: true,
    configured: true,
    source: "supabase",
    canStartProjects,
    projects,
  });
}

export async function POST(request: Request) {
  const auth = await requireBudgetUser(request);

  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, message: auth.message },
      { status: auth.status },
    );
  }

  const allowed = await canStartBudgetProjects(auth);
  if (!allowed) {
    return NextResponse.json(
      { ok: false, message: "ไม่มีสิทธิ์เริ่มดำเนินการโครงการ" },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { action?: unknown; projectId?: unknown }
    | null;

  const action = text(body?.action);
  const projectId = text(body?.projectId);

  if (action !== "start" || !projectId) {
    return NextResponse.json(
      { ok: false, message: "ข้อมูลคำสั่งไม่ถูกต้อง" },
      { status: 400 },
    );
  }

  const { data: project, error: projectError } = await auth.admin
    .from("budget_projects")
    .select("id,status")
    .eq("id", projectId)
    .maybeSingle();

  if (projectError) {
    console.error("Load project before start error:", projectError);
    return NextResponse.json(
      { ok: false, message: "ไม่สามารถตรวจสอบโครงการได้" },
      { status: 500 },
    );
  }

  if (!project) {
    return NextResponse.json(
      { ok: false, message: "ไม่พบโครงการ" },
      { status: 404 },
    );
  }

  const currentStatus = text(project.status).toLowerCase();
  const startableStatuses = [
    "",
    "ยังไม่เริ่ม",
    "draft",
    "pending",
    "not_started",
  ];

  if (!startableStatuses.includes(currentStatus)) {
    return NextResponse.json(
      { ok: false, message: "โครงการนี้เริ่มดำเนินการแล้วหรืออยู่ในขั้นตอนถัดไป" },
      { status: 409 },
    );
  }

  const { error: updateError } = await auth.admin
    .from("budget_projects")
    .update({
      status: "กำลังดำเนินการ",
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);

  if (updateError) {
    console.error("Start budget project error:", updateError);
    return NextResponse.json(
      { ok: false, message: "ไม่สามารถเปลี่ยนสถานะโครงการได้" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    message: "เริ่มดำเนินการโครงการแล้ว",
    projectId,
    status: "กำลังดำเนินการ",
  });
}
