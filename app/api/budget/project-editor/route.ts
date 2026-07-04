import { NextResponse } from "next/server";
import { requireBudgetUser } from "@/lib/budget/supabase-server";

export const dynamic = "force-dynamic";

type EditableActivity = {
  id: string;
  name: string;
  lead: string;
  status: string;
  budgetSource: string;
  budget: number;
  spent: number;
  startDate: string;
  endDate: string;
};

type EditableProject = {
  id: string;
  fiscalYear: string;
  name: string;
  owner: string;
  lead: string;
  status: string;
  budget: number;
  spent: number;
  startDate: string;
  endDate: string;
  useActivities: boolean;
  budgetSources: string[];
  customBudgetSource: string;
  attachments: unknown[];
  activities: EditableActivity[];
};

type UploadableAttachment = {
  name?: string;
  mimeType?: string;
  base64?: string;
};

type UploadedAttachment = {
  fileId: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  fileSize: number | null;
};

type BudgetGasResponse = {
  ok?: boolean;
  message?: string;
  files?: Array<{
    fileId?: string;
    fileName?: string;
    fileUrl?: string;
    mimeType?: string;
    fileSize?: number | string | null;
  }>;
  trashedFileIds?: string[];
};

type SavePayload = {
  project?: EditableProject;
  payload?: {
    project?: {
      id?: string;
      fiscalYear?: string;
      name?: string;
      planName?: string;
      owner?: string;
      status?: string;
      budgetAmount?: number;
      actualAmount?: number;
      startDate?: string;
      endDate?: string;
      fundingSources?: string[];
      customFundingSource?: string;
    };
    activities?: Array<{
      id?: string;
      projectId?: string;
      name?: string;
      owner?: string;
      status?: string;
      fundingSource?: string;
      budgetAmount?: number;
      actualAmount?: number;
      startDate?: string;
      endDate?: string;
    }>;
    newAttachments?: UploadableAttachment[];
    removedAttachmentIds?: string[];
  };
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function dateValue(value: unknown) {
  const normalized = text(value);
  return normalized || null;
}

function fiscalYearValue(value: unknown) {
  const normalized = Number.parseInt(text(value), 10);
  return Number.isFinite(normalized) ? normalized : null;
}

async function findProject(
  admin: any,
  projectId: string,
) {
  const legacyResult = await admin
    .from("budget_projects")
    .select("id, legacy_project_id, owner_name_snapshot")
    .eq("legacy_project_id", projectId)
    .maybeSingle();

  if (legacyResult.error) throw legacyResult.error;
  if (legacyResult.data) return legacyResult.data;

  if (!UUID_PATTERN.test(projectId)) return null;

  const idResult = await admin
    .from("budget_projects")
    .select("id, legacy_project_id, owner_name_snapshot")
    .eq("id", projectId)
    .maybeSingle();

  if (idResult.error) throw idResult.error;
  return idResult.data ?? null;
}

async function findOwnerId(admin: any, ownerName: string) {
  if (!ownerName) return null;

  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .eq("account_status", "active")
    .eq("full_name", ownerName)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.id ?? null;
}


function getBudgetGasConfiguration() {
  return {
    url: process.env.BUDGET_GAS_API_URL?.trim() || "",
    secret: process.env.BUDGET_GAS_API_SECRET?.trim() || "",
  };
}

async function callBudgetGas(
  payload: Record<string, unknown>,
): Promise<BudgetGasResponse> {
  const config = getBudgetGasConfiguration();

  if (!config.url || !config.secret) {
    throw new Error(
      "ยังไม่ได้ตั้งค่า BUDGET_GAS_API_URL หรือ BUDGET_GAS_API_SECRET",
    );
  }

  const response = await fetch(config.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...payload,
      secret: config.secret,
    }),
    cache: "no-store",
  });

  const result = (await response.json().catch(() => ({}))) as BudgetGasResponse;

  if (!response.ok || result.ok === false) {
    throw new Error(
      result.message || `Budget GAS failed (HTTP ${response.status})`,
    );
  }

  return result;
}

async function uploadProjectAttachments(
  projectId: string,
  attachments: UploadableAttachment[],
): Promise<UploadedAttachment[]> {
  if (!attachments.length) return [];

  const result = await callBudgetGas({
    action: "uploadBudgetProjectAttachments",
    projectId,
    attachments,
  });

  return (result.files ?? []).map((file) => ({
    fileId: text(file.fileId),
    fileName: text(file.fileName),
    fileUrl: text(file.fileUrl),
    mimeType: text(file.mimeType) || "application/octet-stream",
    fileSize:
      file.fileSize === null || file.fileSize === undefined
        ? null
        : numberValue(file.fileSize),
  })).filter((file) => file.fileId && file.fileName && file.fileUrl);
}

async function cleanupUploadedFiles(fileIds: string[]) {
  if (!fileIds.length) return;

  await callBudgetGas({
    action: "trashBudgetFiles",
    fileIds,
  }).catch((error) => {
    console.error("Budget attachment cleanup failed:", error);
  });
}

export async function GET(request: Request) {
  const auth = await requireBudgetUser(request);

  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, configured: true, projects: [], message: auth.message },
      { status: auth.status },
    );
  }

  return NextResponse.json({
    ok: true,
    configured: true,
    source: "supabase",
    projects: [],
  });
}

export async function POST(request: Request) {
  const auth = await requireBudgetUser(request);

  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, configured: true, message: auth.message },
      { status: auth.status },
    );
  }

  let uploadedFiles: UploadedAttachment[] = [];

  try {
    const body = (await request.json()) as SavePayload;
    const project = body.project;
    const payload = body.payload;

    if (!project || !payload?.project) {
      return NextResponse.json(
        { ok: false, configured: true, message: "รูปแบบข้อมูลโครงการไม่ถูกต้อง" },
        { status: 400 },
      );
    }

    const projectId = text(payload.project.id || project.id);
    const projectName = text(payload.project.name || project.name);

    if (!projectId || !projectName) {
      return NextResponse.json(
        { ok: false, configured: true, message: "กรุณาระบุรหัสและชื่อโครงการ" },
        { status: 400 },
      );
    }

    const existingProject = await findProject(auth.admin, projectId);
    const manager = ["admin", "director"].includes(auth.profile.role);
    const currentName = text(auth.profile.full_name);
    const existingOwner = text(existingProject?.owner_name_snapshot);

    if (!existingProject && !manager) {
      return NextResponse.json(
        {
          ok: false,
          configured: true,
          message: "เฉพาะผู้บริหารหรือผู้ดูแลระบบเท่านั้นที่สร้างโครงการใหม่ได้",
        },
        { status: 403 },
      );
    }

    if (existingProject && !manager && existingOwner !== currentName) {
      return NextResponse.json(
        {
          ok: false,
          configured: true,
          message: "คุณไม่มีสิทธิ์แก้ไขโครงการนี้",
        },
        { status: 403 },
      );
    }

    const ownerName = text(payload.project.owner || project.lead);
    const ownerId = await findOwnerId(auth.admin, ownerName);

    const projectRow = {
      legacy_project_id:
        existingProject?.legacy_project_id || projectId,
      project_code: projectId,
      fiscal_year: fiscalYearValue(payload.project.fiscalYear),
      name: projectName,
      plan_name: text(payload.project.planName || project.owner) || null,
      department: text(payload.project.planName || project.owner) || null,
      owner_id: ownerId,
      owner_name_snapshot: ownerName || null,
      status: text(payload.project.status || project.status) || "ยังไม่เริ่ม",
      approved_budget: numberValue(payload.project.budgetAmount),
      legacy_actual_amount: numberValue(payload.project.actualAmount),
      start_date: dateValue(payload.project.startDate),
      end_date: dateValue(payload.project.endDate),
      funding_sources: Array.isArray(payload.project.fundingSources)
        ? payload.project.fundingSources
        : [],
      custom_funding_source:
        text(payload.project.customFundingSource) || null,
      source_system: "supabase",
      updated_by: auth.profile.id,
    };

    let savedProjectId: string;

    if (existingProject) {
      const { data, error } = await auth.admin
        .from("budget_projects")
        .update(projectRow)
        .eq("id", existingProject.id)
        .select("id")
        .single();

      if (error) throw error;
      savedProjectId = data.id;
    } else {
      const { data, error } = await auth.admin
        .from("budget_projects")
        .insert({
          ...projectRow,
          created_by: auth.profile.id,
        })
        .select("id")
        .single();

      if (error) throw error;
      savedProjectId = data.id;
    }

    const { data: existingActivities, error: existingActivitiesError } =
      await auth.admin
        .from("budget_activities")
        .select("id, legacy_activity_id")
        .eq("project_id", savedProjectId);

    if (existingActivitiesError) throw existingActivitiesError;

    const retainedActivityIds = new Set<string>();
    const activities = Array.isArray(payload.activities)
      ? payload.activities
      : [];

    for (let index = 0; index < activities.length; index += 1) {
      const activity = activities[index];
      const legacyActivityId = text(activity.id) || `${projectId}-A${index + 1}`;
      const existingActivity = (existingActivities ?? []).find(
        (row: any) =>
          row.legacy_activity_id === legacyActivityId ||
          row.id === legacyActivityId,
      );
      const activityOwnerName = text(activity.owner);
      const activityOwnerId = await findOwnerId(auth.admin, activityOwnerName);

      const activityRow = {
        project_id: savedProjectId,
        legacy_activity_id: legacyActivityId,
        name: text(activity.name) || `กิจกรรมที่ ${index + 1}`,
        owner_id: activityOwnerId,
        owner_name_snapshot: activityOwnerName || null,
        status: text(activity.status) || "ยังไม่เริ่ม",
        funding_source: text(activity.fundingSource) || null,
        approved_budget: numberValue(activity.budgetAmount),
        legacy_actual_amount: numberValue(activity.actualAmount),
        start_date: dateValue(activity.startDate),
        end_date: dateValue(activity.endDate),
        sort_order: index,
        updated_by: auth.profile.id,
      };

      if (existingActivity) {
        const { error } = await auth.admin
          .from("budget_activities")
          .update(activityRow)
          .eq("id", existingActivity.id);

        if (error) throw error;
        retainedActivityIds.add(existingActivity.id);
      } else {
        const { data, error } = await auth.admin
          .from("budget_activities")
          .insert({
            ...activityRow,
            created_by: auth.profile.id,
          })
          .select("id")
          .single();

        if (error) throw error;
        retainedActivityIds.add(data.id);
      }
    }

    for (const existingActivity of existingActivities ?? []) {
      if (retainedActivityIds.has(existingActivity.id)) continue;

      const { error } = await auth.admin
        .from("budget_activities")
        .delete()
        .eq("id", existingActivity.id);

      if (error) throw error;
    }

    const removedAttachmentIds = Array.isArray(
      payload.removedAttachmentIds,
    )
      ? payload.removedAttachmentIds.map(text).filter(Boolean)
      : [];

    if (removedAttachmentIds.length > 0) {
      const removedAt = new Date().toISOString();
      const { error } = await auth.admin
        .from("budget_project_attachments")
        .update({
          is_active: false,
          removed_at: removedAt,
          removed_by: auth.profile.id,
        })
        .eq("project_id", savedProjectId)
        .eq("is_active", true)
        .in("drive_file_id", removedAttachmentIds);

      if (error) throw error;
    }

    const newAttachments = Array.isArray(payload.newAttachments)
      ? payload.newAttachments
      : [];

    uploadedFiles = await uploadProjectAttachments(
      projectId,
      newAttachments,
    );

    if (uploadedFiles.length > 0) {
      const rows = uploadedFiles.map((file) => ({
        project_id: savedProjectId,
        activity_id: null,
        drive_file_id: file.fileId,
        file_name: file.fileName,
        file_url: file.fileUrl,
        mime_type: file.mimeType,
        file_size: file.fileSize,
        attachment_type: "project",
        uploaded_by: auth.profile.id,
        is_active: true,
      }));

      const { error } = await auth.admin
        .from("budget_project_attachments")
        .insert(rows);

      if (error) throw error;
    }

    const { data: attachmentRows, error: attachmentReadError } =
      await auth.admin
        .from("budget_project_attachments")
        .select(
          "id, drive_file_id, file_name, file_url, mime_type, file_size",
        )
        .eq("project_id", savedProjectId)
        .is("activity_id", null)
        .eq("is_active", true)
        .order("uploaded_at", { ascending: true });

    if (attachmentReadError) throw attachmentReadError;

    const savedAttachments = (attachmentRows ?? []).map((file: any) => ({
      id: file.drive_file_id || file.id,
      fileId: file.drive_file_id,
      name: file.file_name,
      fileName: file.file_name,
      url: file.file_url,
      webViewLink: file.file_url,
      mimeType: file.mime_type || "",
      size: numberValue(file.file_size),
    }));

    const savedProject = {
      ...project,
      attachments: savedAttachments,
    };

    return NextResponse.json({
      ok: true,
      configured: true,
      source: "supabase",
      verified: true,
      project: savedProject,
      uploadedAttachmentCount: uploadedFiles.length,
      removedAttachmentCount: removedAttachmentIds.length,
      message:
        uploadedFiles.length > 0 || removedAttachmentIds.length > 0
          ? "บันทึกข้อมูลและไฟล์แนบที่ Supabase แล้ว"
          : "บันทึกข้อมูลโครงการและกิจกรรมลง Supabase แล้ว",
    });
  } catch (error) {
    console.error("Save Supabase budget project error:", error);

    await cleanupUploadedFiles(uploadedFiles.map((file) => file.fileId));

    return NextResponse.json(
      {
        ok: false,
        configured: true,
        message:
          error instanceof Error
            ? error.message
            : "ไม่สามารถบันทึกข้อมูลโครงการลง Supabase ได้",
      },
      { status: 500 },
    );
  }
}
