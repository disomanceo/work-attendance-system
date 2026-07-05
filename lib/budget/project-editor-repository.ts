import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import {
  clearBudgetProjectOverrides,
  countBudgetProjectOverrides,
  readBudgetProjectOverrides,
  saveBudgetProjectOverride,
  type BudgetProjectOverrides,
  type EditableProject,
} from "@/lib/budget/project-editor-storage";

export type BudgetProjectEditorSource = "supabase" | "gas" | "localStorage";

export type BudgetProjectEditorState = {
  source: BudgetProjectEditorSource;
  overrides: BudgetProjectOverrides;
  loadedAt: string;
};

export type UploadableBudgetAttachment = {
  name: string;
  mimeType: string;
  base64: string;
};

export type BudgetProjectSavePayload = {
  project: {
    id: string;
    projectCode: string;
    fiscalYear: string;
    name: string;
    planName: string;
    owner: string;
    status: string;
    budgetAmount: number;
    actualAmount: number;
    startDate: string;
    endDate: string;
    fundingSources: string[];
    customFundingSource: string;
    attachments: EditableProject["attachments"];
  };
  removedAttachmentIds: string[];
  newAttachments: UploadableBudgetAttachment[];
  activities: Array<{
    id: string;
    projectId: string;
    name: string;
    owner: string;
    status: string;
    fundingSource: string;
    budgetAmount: number;
    actualAmount: number;
    startDate: string;
    endDate: string;
  }>;
};

export type BudgetProjectSaveResult = {
  source: BudgetProjectEditorSource;
  overrides: BudgetProjectOverrides;
  payload: BudgetProjectSavePayload;
  verified: boolean;
  verificationMessage: string;
  savedProject: EditableProject;
  uploadedAttachmentCount: number;
  removedAttachmentCount: number;
};

type ApiResponse = {
  ok?: boolean;
  configured?: boolean;
  source?: BudgetProjectEditorSource;
  verified?: boolean;
  project?: EditableProject;
  uploadedAttachmentCount?: number;
  removedAttachmentCount?: number;
  message?: string;
};

type EditorApiResult = {
  response: ApiResponse | null;
  errorMessage: string;
};

async function fileToUploadableAttachment(
  file: File,
): Promise<UploadableBudgetAttachment> {
  const maxSize = 10 * 1024 * 1024;

  if (file.size > maxSize) {
    throw new Error(`ไฟล์ ${file.name} มีขนาดเกิน 10 MB`);
  }

  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = String(reader.result || "");
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };

    reader.onerror = () => reject(new Error(`อ่านไฟล์ ${file.name} ไม่สำเร็จ`));
    reader.readAsDataURL(file);
  });

  return {
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    base64,
  };
}

export async function createBudgetProjectSavePayload(
  project: EditableProject,
  newFiles: File[] = [],
  removedAttachmentIds: string[] = [],
): Promise<BudgetProjectSavePayload> {
  return {
    project: {
      id: project.id,
      projectCode: project.code,
      fiscalYear: project.fiscalYear,
      name: project.name,
      planName: project.owner,
      owner: project.lead,
      status: project.status,
      budgetAmount: Number(project.budget) || 0,
      actualAmount: Number(project.spent) || 0,
      startDate: project.startDate,
      endDate: project.endDate,
      fundingSources: [...project.budgetSources],
      customFundingSource: project.customBudgetSource,
      attachments: Array.isArray(project.attachments)
        ? project.attachments
        : [],
    },
    removedAttachmentIds: [...removedAttachmentIds],
    newAttachments: await Promise.all(
      newFiles.map(fileToUploadableAttachment),
    ),
    activities: project.activities.map((activity) => ({
      id: activity.id,
      projectId: project.id,
      name: activity.name,
      owner: activity.lead,
      status: activity.status,
      fundingSource: activity.budgetSource,
      budgetAmount: Number(activity.budget) || 0,
      actualAmount: Number(activity.spent) || 0,
      startDate: activity.startDate,
      endDate: activity.endDate,
    })),
  };
}

async function requestEditorApi(
  init?: RequestInit,
): Promise<EditorApiResult> {
  try {
    const supabase = createSupabaseClient();
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      return {
        response: null,
        errorMessage: "ไม่พบ Session กรุณาเข้าสู่ระบบใหม่",
      };
    }

    const response = await fetch("/api/budget/project-editor", {
      cache: "no-store",
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        ...(init?.headers || {}),
      },
    });

    const result = (await response.json().catch(() => ({}))) as ApiResponse;

    if (!response.ok || result.ok === false) {
      return {
        response: result,
        errorMessage:
          result.message ||
          `Budget editor API failed (HTTP ${response.status})`,
      };
    }

    return {
      response: result,
      errorMessage: "",
    };
  } catch (error) {
    return {
      response: null,
      errorMessage:
        error instanceof Error
          ? error.message
          : "ไม่สามารถเชื่อมต่อ Budget editor API ได้",
    };
  }
}

export async function loadBudgetProjectEditorState(): Promise<BudgetProjectEditorState> {
  return {
    source: "supabase",
    overrides: readBudgetProjectOverrides(),
    loadedAt: new Date().toISOString(),
  };
}

export async function saveBudgetProjectEditor(
  project: EditableProject,
  newFiles: File[] = [],
  removedAttachmentIds: string[] = [],
): Promise<BudgetProjectSaveResult> {
  const payload = await createBudgetProjectSavePayload(
    project,
    newFiles,
    removedAttachmentIds,
  );
  const localOverrides = saveBudgetProjectOverride(project);
  const apiResult = await requestEditorApi({
    method: "POST",
    body: JSON.stringify({ project, payload }),
  });
  const result = apiResult.response;

  if (result?.ok && result.configured && result.source === "supabase") {
    clearBudgetProjectOverrides();

    return {
      source: "supabase",
      overrides: {
        [project.id]: result.project || project,
      },
      payload,
      verified: result.verified !== false,
      verificationMessage:
        result.message || "บันทึกและตรวจสอบข้อมูลใน Supabase แล้ว",
      savedProject: result.project || project,
      uploadedAttachmentCount:
        Number(result.uploadedAttachmentCount) || payload.newAttachments.length,
      removedAttachmentCount:
        Number(result.removedAttachmentCount) ||
        payload.removedAttachmentIds.length,
    };
  }

  return {
    source: "localStorage",
    overrides: localOverrides,
    payload,
    verified: false,
    verificationMessage:
      apiResult.errorMessage ||
      result?.message ||
      "บันทึกไว้ในเครื่อง เนื่องจากยังเชื่อม Supabase ไม่สำเร็จ",
    savedProject: project,
    uploadedAttachmentCount: 0,
    removedAttachmentCount: 0,
  };
}

export type BudgetProjectMigrationFailure = {
  projectId: string;
  message: string;
};

export type BudgetProjectMigrationResult = {
  total: number;
  succeeded: number;
  failed: number;
  failures: BudgetProjectMigrationFailure[];
};

export async function migrateLocalBudgetProjectsToGas(): Promise<BudgetProjectMigrationResult> {
  const localProjects = Object.values(readBudgetProjectOverrides());
  const result: BudgetProjectMigrationResult = {
    total: localProjects.length,
    succeeded: 0,
    failed: 0,
    failures: [],
  };

  for (const project of localProjects) {
    const payload = await createBudgetProjectSavePayload(project);
    const apiResult = await requestEditorApi({
      method: "POST",
      body: JSON.stringify({ project, payload }),
    });
    const response = apiResult.response;

    if (response?.ok && response.configured) {
      result.succeeded += 1;
    } else {
      result.failed += 1;
      result.failures.push({
        projectId: project.id,
        message:
          apiResult.errorMessage ||
          response?.message ||
          "ไม่ทราบสาเหตุ",
      });
    }
  }

  return result;
}

export function getLocalBudgetProjectCount(): number {
  return countBudgetProjectOverrides();
}

export function clearLocalBudgetProjectData(): boolean {
  return clearBudgetProjectOverrides();
}
