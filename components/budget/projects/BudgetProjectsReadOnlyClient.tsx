"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import {
  mapAndSortBudgetProjects,
  sortBudgetProjects,
} from "@/lib/budget/project-list";
import type {
  BudgetProjectAttachment,
  BudgetProjectListItem,
} from "@/lib/budget/types";
import {
  effectiveProjectBudget,
  effectiveProjectRemaining,
  effectiveProjectSpent,
} from "@/lib/budget/project-financials";
import {
  applyBudgetProjectOverrides,
  type EditableActivity,
  type EditableProject,
} from "@/lib/budget/project-editor-storage";
import {
  loadBudgetProjectEditorState,
  saveBudgetProjectEditor,
} from "@/lib/budget/project-editor-repository";

type ApiResult = {
  ok?: boolean;
  configured?: boolean;
  projects?: unknown[];
  canStartProjects?: boolean;
  message?: string;
};

type ProjectCodeApiResult = {
  ok?: boolean;
  academicYear?: string;
  usedCodes?: string[];
  message?: string;
};

const PROJECT_GROUP_OPTIONS = [
  { code: "P1", label: "บริหารวิชาการ" },
  { code: "P2", label: "บริหารงบประมาณ" },
  { code: "P3", label: "บริหารงานบุคคล" },
  { code: "P4", label: "บริหารทั่วไป" },
] as const;

const PROJECT_SEQUENCE_OPTIONS = Array.from(
  { length: 50 },
  (_, index) => String(index + 1).padStart(2, "0"),
);

function composeProjectCode(
  groupCode: string,
  sequence: string,
  academicYear: string,
) {
  if (!groupCode || !sequence || !academicYear) return "";
  return `${groupCode}-${sequence}-${academicYear}`;
}

function sequenceFromProjectCode(code: string) {
  const match = code.trim().match(/^P[1-4]-(\d{2})-(\d{4})$/);
  return match?.[1] ?? "";
}

type MemberOption = {
  id: string;
  name: string;
  position: string;
};

type MembersApiResult = {
  ok?: boolean;
  members?: unknown[];
  profiles?: unknown[];
  users?: unknown[];
};

function normalizeMemberOptions(result: MembersApiResult): MemberOption[] {
  const rows = Array.isArray(result.members)
    ? result.members
    : Array.isArray(result.profiles)
      ? result.profiles
      : Array.isArray(result.users)
        ? result.users
        : [];

  const options = rows
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const item = row as Record<string, unknown>;
      const firstName = String(
        item.first_name ?? item.firstName ?? item.firstname ?? "",
      ).trim();
      const lastName = String(
        item.last_name ?? item.lastName ?? item.lastname ?? "",
      ).trim();
      const fullName = String(
        item.full_name ??
          item.fullName ??
          item.name ??
          [firstName, lastName].filter(Boolean).join(" "),
      ).trim();

      if (!fullName) return null;

      const status = String(
        item.status ?? item.account_status ?? item.accountStatus ?? "",
      )
        .trim()
        .toLowerCase();

      if (["inactive", "disabled", "suspended", "rejected"].includes(status)) {
        return null;
      }

      return {
        id: String(item.id ?? item.user_id ?? item.userId ?? fullName),
        name: fullName,
        position: String(
          item.position ?? item.role_name ?? item.roleName ?? item.role ?? "",
        ).trim(),
      };
    })
    .filter((item): item is MemberOption => Boolean(item));

  return Array.from(
    new Map(options.map((item) => [item.name, item])).values(),
  ).sort((a, b) => a.name.localeCompare(b.name, "th"));
}

function currentBudgetYear() {
  return String(new Date().getFullYear() + 543);
}

function toDateInputValue(value?: string) {
  if (!value) return "";

  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) return `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function toEditableProject(project: BudgetProjectListItem): EditableProject {
  return {
    id: project.id,
    code: project.code || "",
    fiscalYear:
      project.code?.match(/-(\d{4})$/)?.[1] || currentBudgetYear(),
    name: project.name,
    owner: project.owner,
    lead: project.lead,
    status: project.status,
    budget: project.budget,
    spent: project.spent,
    startDate: "",
    endDate: toDateInputValue(project.due),
    useActivities: project.activities.length > 0,
    budgetSources: [],
    customBudgetSource: "",
    attachments: project.attachments,
    activities: project.activities.map((activity) => ({
      id: activity.id,
      name: activity.name,
      lead: activity.lead,
      status: activity.status,
      budgetSource: activity.budgetSource,
      budget: activity.budget,
      spent: activity.spent,
      startDate: toDateInputValue(activity.startDate),
      endDate: toDateInputValue(activity.endDate),
    })),
  };
}

function emptyActivity(projectId: string, index: number): EditableActivity {
  return {
    id: `${projectId}-A${Date.now()}-${index + 1}`,
    name: "",
    lead: "",
    status: "ยังไม่เริ่ม",
    budgetSource: "",
    budget: 0,
    spent: 0,
    startDate: "",
    endDate: "",
  };
}

function money(value: number) {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return "0 KB";
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function percent(spent: number, budget: number) {
  if (budget <= 0) return 0;
  return Math.min(100, Math.round((spent / budget) * 100));
}

function rawPercent(spent: number, budget: number) {
  if (budget <= 0) return 0;
  return Math.round((spent / budget) * 100);
}

function activityStatusSummary(project: BudgetProjectListItem) {
  const statuses = project.activities.map((activity) =>
    normalizedStatus(activity.status),
  );

  const completed = statuses.filter(
    (status) =>
      status === "เสร็จสิ้น" || status === "เสร็จแล้ว" || status === "done",
  ).length;

  const active = statuses.filter(
    (status) =>
      status === "ดำเนินการ" ||
      status === "กำลังดำเนินการ" ||
      status === "active" ||
      status === "approved" ||
      status === "เบิกจ่าย" ||
      status === "กำลังเบิกจ่าย",
  ).length;

  const pending = Math.max(0, statuses.length - completed - active);
  const workProgress =
    statuses.length > 0 ? Math.round((completed / statuses.length) * 100) : 0;

  return {
    total: statuses.length,
    completed,
    active,
    pending,
    workProgress,
  };
}

function formatThaiDate(value?: string) {
  if (!value) return "-";

  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = dateOnlyMatch
    ? new Date(
        Number(dateOnlyMatch[1]),
        Number(dateOnlyMatch[2]) - 1,
        Number(dateOnlyMatch[3]),
      )
    : new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: dateOnlyMatch ? undefined : "Asia/Bangkok",
  }).format(date);
}

function formatLoadedTime(value: string) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function statusClass(status: string) {
  if (status === "เสร็จสิ้น" || status === "เสร็จแล้ว") return "done";
  if (status === "เบิกจ่าย" || status === "กำลังเบิกจ่าย") return "payment";
  if (status === "ดำเนินการ" || status === "กำลังดำเนินการ") return "active";
  if (status === "ยกเลิก") return "cancelled";
  return "pending";
}

function departmentIcon(owner: string) {
  const value = owner.toLowerCase();

  if (value.includes("วิชาการ")) return "⌁";
  if (value.includes("บุคคล")) return "♙";
  if (value.includes("งบ")) return "฿";
  if (value.includes("บริหาร")) return "▤";
  if (value.includes("ทั่วไป")) return "▦";
  return "◇";
}

function fileKind(file: BudgetProjectAttachment) {
  const mime = file.mimeType.toLowerCase();
  const name = file.name.toLowerCase();

  if (mime.includes("pdf") || name.endsWith(".pdf")) {
    return { label: "PDF", className: "filePdf", icon: "PDF" };
  }

  if (
    mime.includes("word") ||
    mime.includes("officedocument") ||
    name.endsWith(".doc") ||
    name.endsWith(".docx")
  ) {
    return { label: "Word", className: "fileWord", icon: "W" };
  }

  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(name)) {
    return { label: "รูปภาพ", className: "fileImage", icon: "JPG" };
  }

  return { label: "ไฟล์", className: "fileOther", icon: "▦" };
}

function normalizedStatus(status: string) {
  return status.trim().toLowerCase();
}

function isCompletedActivityStatus(status: string) {
  const value = normalizedStatus(status);
  return value === "เสร็จสิ้น" || value === "เสร็จแล้ว" || value === "done";
}

function isStartedActivityStatus(status: string) {
  const value = normalizedStatus(status);
  return (
    value === "ดำเนินการ" ||
    value === "กำลังดำเนินการ" ||
    value === "active" ||
    value === "approved" ||
    value === "เบิกจ่าย" ||
    value === "กำลังเบิกจ่าย" ||
    isCompletedActivityStatus(value)
  );
}

function projectWorkflowStatus(project: BudgetProjectListItem) {
  const rawStatus = normalizedStatus(project.status);

  if (rawStatus === "ยกเลิก" || rawStatus === "cancelled") return "ยกเลิก";
  if (
    rawStatus === "เสร็จสิ้น" ||
    rawStatus === "เสร็จแล้ว" ||
    rawStatus === "done"
  ) {
    return "เสร็จสิ้น";
  }
  if (rawStatus === "เบิกจ่าย" || rawStatus === "กำลังเบิกจ่าย") {
    return "เบิกจ่าย";
  }
  if (
    rawStatus === "กำลังดำเนินการ" ||
    rawStatus === "ดำเนินการ" ||
    rawStatus === "active" ||
    rawStatus === "approved"
  ) {
    return "กำลังดำเนินการ";
  }

  if (project.activities.length > 0) {
    const allCompleted = project.activities.every((activity) =>
      isCompletedActivityStatus(activity.status),
    );
    const anyStarted = project.activities.some((activity) =>
      isStartedActivityStatus(activity.status),
    );

    if (allCompleted) return "เสร็จสิ้น";
    if (anyStarted) return "กำลังดำเนินการ";
    return "ยังไม่เริ่ม";
  }

  return workflowStatusValue(project.status);
}

function projectBudgetStatus(project: BudgetProjectListItem) {
  const spent = effectiveProjectSpent(project);
  const budget = effectiveProjectBudget(project);

  if (spent <= 0) return "ยังไม่มีการเบิกจ่าย";
  if (budget > 0 && spent > budget) return "ใช้เกินงบ";
  if (budget > 0 && spent === budget) return "เบิกครบแล้ว";
  return "มีการเบิกจ่าย";
}

function budgetStatusClass(status: string) {
  if (status === "ใช้เกินงบ") return "budgetOver";
  if (status === "เบิกครบแล้ว") return "budgetComplete";
  if (status === "มีการเบิกจ่าย") return "budgetActive";
  return "budgetIdle";
}

function workflowState(status: string) {
  if (status === "เสร็จสิ้น") return 4;
  if (status === "เบิกจ่าย") return 3;
  if (status === "กำลังดำเนินการ") return 2;
  return 1;
}

function workflowStatusValue(status: string) {
  const value = normalizedStatus(status);

  if (
    value === "เสร็จสิ้น" ||
    value === "เสร็จแล้ว" ||
    value === "done"
  ) {
    return "เสร็จสิ้น";
  }

  if (value === "เบิกจ่าย" || value === "กำลังเบิกจ่าย") {
    return "เบิกจ่าย";
  }

  if (
    value === "กำลังดำเนินการ" ||
    value === "ดำเนินการ" ||
    value === "active" ||
    value === "approved"
  ) {
    return "กำลังดำเนินการ";
  }

  return "ยังไม่เริ่ม";
}

function automaticEditorProjectStatus(project: EditableProject) {
  const explicitStatus = workflowStatusValue(project.status);
  if (explicitStatus === "เสร็จสิ้น" || explicitStatus === "เบิกจ่าย") {
    return explicitStatus;
  }

  if (!project.useActivities || project.activities.length === 0) return explicitStatus;

  const allCompleted = project.activities.every((activity) =>
    isCompletedActivityStatus(activity.status),
  );
  const anyStarted = project.activities.some((activity) =>
    isStartedActivityStatus(activity.status),
  );

  if (allCompleted) return "เสร็จสิ้น";
  if (anyStarted) return "กำลังดำเนินการ";
  return "ยังไม่เริ่ม";
}

function selectedBudgetSourceOptions(project: EditableProject) {
  const standardSources = project.budgetSources.filter(
    (source) => source !== "อื่นๆ",
  );
  const customSource = project.budgetSources.includes("อื่นๆ")
    ? project.customBudgetSource.trim()
    : "";

  return Array.from(
    new Set([...standardSources, ...(customSource ? [customSource] : [])]),
  );
}

function editableProjectToListItem(
  project: EditableProject,
): BudgetProjectListItem {
  return {
    id: project.id,
    legacyId: project.id,
    code: project.code || project.id,
    name: project.name,
    owner: project.owner,
    lead: project.lead,
    status: project.status,
    budget: Number(project.budget) || 0,
    spent: Number(project.spent) || 0,
    due: project.endDate,
    attachments: Array.isArray(project.attachments)
      ? project.attachments
      : [],
    activities: project.activities.map((activity) => ({
      id: activity.id,
      projectId: project.id,
      name: activity.name,
      lead: activity.lead,
      status: activity.status,
      budgetSource: activity.budgetSource,
      budget: Number(activity.budget) || 0,
      spent: Number(activity.spent) || 0,
      startDate: activity.startDate,
      endDate: activity.endDate,
    })),
  };
}

function createNewProjectDraft(): EditableProject {
  const fiscalYear = currentBudgetYear();

  return {
    id: crypto.randomUUID(),
    code: "",
    fiscalYear,
    name: "",
    owner: "",
    lead: "",
    status: "ยังไม่เริ่ม",
    budget: 0,
    spent: 0,
    startDate: "",
    endDate: "",
    useActivities: false,
    budgetSources: [],
    customBudgetSource: "",
    attachments: [],
    activities: [],
  };
}


const BUDGET_PROJECTS_CACHE_KEY = "budget-projects-api-cache-v3";
const BUDGET_PROJECTS_CACHE_MAX_AGE_MS = 5 * 60 * 1000;

type BudgetProjectsCache = {
  savedAt: number;
  projects: unknown[];
};

function readBudgetProjectsCache(): BudgetProjectsCache | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(BUDGET_PROJECTS_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as {
      savedAt?: number;
      value?: unknown[];
    };

    if (
      typeof parsed.savedAt !== "number" ||
      !Array.isArray(parsed.value) ||
      Date.now() - parsed.savedAt > BUDGET_PROJECTS_CACHE_MAX_AGE_MS
    ) {
      window.sessionStorage.removeItem(BUDGET_PROJECTS_CACHE_KEY);
      return null;
    }

    return {
      savedAt: parsed.savedAt,
      projects: parsed.value,
    };
  } catch {
    window.sessionStorage.removeItem(BUDGET_PROJECTS_CACHE_KEY);
    return null;
  }
}

function writeBudgetProjectsCache(projects: unknown[]) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(
      BUDGET_PROJECTS_CACHE_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        value: projects,
      })
    );
  } catch {
    // Ignore storage quota/private mode failures.
  }
}

export default function BudgetProjectsReadOnlyClient() {
  const [projects, setProjects] = useState<BudgetProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [configured, setConfigured] = useState(true);
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("all");
  const [status, setStatus] = useState("all");
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(
    null,
  );
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [creatingProject, setCreatingProject] = useState(false);
  const [editor, setEditor] = useState<EditableProject | null>(null);
  const [editorMessage, setEditorMessage] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState<string[]>(
    [],
  );
  const [projectOverrides, setProjectOverrides] = useState<
    Record<string, EditableProject>
  >({});
  const [savingEditor, setSavingEditor] = useState(false);
  const [editorDataSource, setEditorDataSource] = useState<"supabase" | "gas" | "localStorage">("localStorage");
  const [lastLoadedAt, setLastLoadedAt] = useState("");
  const [memberOptions, setMemberOptions] = useState<MemberOption[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersMessage, setMembersMessage] = useState("");
  const [canStartProjects, setCanStartProjects] = useState(false);
  const [startingProjectId, setStartingProjectId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState("");
  const [projectGroupCode, setProjectGroupCode] = useState("P1");
  const [projectSequence, setProjectSequence] = useState("01");
  const [academicYear, setAcademicYear] = useState("");
  const [usedProjectCodes, setUsedProjectCodes] = useState<string[]>([]);
  const [projectCodeLoading, setProjectCodeLoading] = useState(false);
  const [showCustomBudgetSourceInput, setShowCustomBudgetSourceInput] = useState(false);
  const [customBudgetSourceDraft, setCustomBudgetSourceDraft] = useState("");

  function firstAvailableSequence(
    groupCode: string,
    year: string,
    usedCodes: string[],
  ) {
    return (
      PROJECT_SEQUENCE_OPTIONS.find(
        (sequence) =>
          !usedCodes.includes(
            composeProjectCode(groupCode, sequence, year),
          ),
      ) ?? ""
    );
  }

  async function loadProjectCodeOptions() {
    setProjectCodeLoading(true);

    try {
      const supabase = createSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("กรุณาเข้าสู่ระบบใหม่");
      }

      const response = await fetch("/api/budget/project-code", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      });

      const result = (await response.json().catch(() => ({}))) as ProjectCodeApiResult;

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "โหลดข้อมูลรหัสโครงการไม่สำเร็จ");
      }

      const nextYear = String(result.academicYear || "").trim();

      if (!/^\d{4}$/.test(nextYear)) {
        throw new Error(
          "ยังไม่ได้กำหนดปีการศึกษาในเมนูตั้งค่าระบบ",
        );
      }

      const nextUsedCodes = Array.isArray(result.usedCodes)
        ? result.usedCodes
        : [];
      const nextSequence = firstAvailableSequence(
        "P1",
        nextYear,
        nextUsedCodes,
      );

      setAcademicYear(nextYear);
      setUsedProjectCodes(nextUsedCodes);
      setProjectGroupCode("P1");
      setProjectSequence(nextSequence);

      return {
        academicYear: nextYear,
        usedCodes: nextUsedCodes,
        sequence: nextSequence,
      };
    } catch (error) {
      setAcademicYear("");
      setUsedProjectCodes([]);
      setProjectGroupCode("P1");
      setProjectSequence("");
      setEditorMessage(
        error instanceof Error
          ? error.message
          : "ไม่สามารถโหลดปีการศึกษาได้",
      );

      return null;
    } finally {
      setProjectCodeLoading(false);
    }
  }

  async function loadMemberOptions() {
    setMembersLoading(true);
    setMembersMessage("");

    try {
      const supabase = createSupabaseClient();
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error("ไม่พบ Session กรุณาเข้าสู่ระบบใหม่");
      }

      const response = await fetch("/api/budget/members", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      });
      const result = (await response.json().catch(() => ({}))) as MembersApiResult & {
        message?: string;
      };

      if (!response.ok || !result.ok) {
        setMemberOptions([]);
        setMembersMessage(
          result.message ||
            `ไม่สามารถโหลดรายชื่อบุคลากรได้ (${response.status})`,
        );
        return;
      }

      const options = normalizeMemberOptions(result);
      setMemberOptions(options);
      setMembersMessage(
        options.length === 0 ? "ไม่พบรายชื่อบุคลากรที่เปิดใช้งาน" : "",
      );
    } catch (error) {
      setMemberOptions([]);
      setMembersMessage(
        error instanceof Error
          ? error.message
          : "ไม่สามารถโหลดรายชื่อบุคลากรได้",
      );
    } finally {
      setMembersLoading(false);
    }
  }

  async function loadProjects(options?: { background?: boolean }) {
    const background = options?.background === true;

    if (background) {
      setRefreshing(true);
    } else {
      setLoading(true);
      setMessage("");
    }

    try {
      const supabase = createSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        if (!background) {
          setProjects([]);
          setMessage("กรุณาเข้าสู่ระบบใหม่");
        }
        return;
      }

      const response = await fetch("/api/budget/projects", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      });
      const result = (await response.json()) as ApiResult;

      setConfigured(result.configured !== false);
      setCanStartProjects(result.canStartProjects === true);

      if (!response.ok || !result.ok || !Array.isArray(result.projects)) {
        if (!background) {
          setProjects([]);
          setMessage(result.message || "ไม่สามารถโหลดข้อมูลโครงการได้");
        }
        return;
      }

      const mappedProjects = mapAndSortBudgetProjects(result.projects);
      writeBudgetProjectsCache(result.projects);

      const editorState = await loadBudgetProjectEditorState();
      setEditorDataSource(editorState.source);
      setLastLoadedAt(new Date().toISOString());
      setProjectOverrides(editorState.overrides);
      setProjects(mappedProjects);
    } catch (error) {
      if (!background) {
        setProjects([]);
        setMessage(
          error instanceof Error
            ? error.message
            : "ไม่สามารถโหลดข้อมูลโครงการได้",
        );
      }
    } finally {
      if (background) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }

  async function startProject(project: BudgetProjectListItem) {
    if (startingProjectId) return;

    const confirmed = window.confirm(
      `เริ่มดำเนินการโครงการ "${project.name}" ใช่หรือไม่`,
    );
    if (!confirmed) return;

    setStartingProjectId(project.id);
    setMessage("");
    setActionMessage("");

    try {
      const supabase = createSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("กรุณาเข้าสู่ระบบใหม่");
      }

      const response = await fetch("/api/budget/projects", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "start",
          projectId: project.id,
        }),
      });

      const result = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
      };

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "ไม่สามารถเริ่มดำเนินการได้");
      }

      setProjects((current) =>
        current.map((item) =>
          item.id === project.id
            ? { ...item, status: "กำลังดำเนินการ" }
            : item,
        ),
      );

      writeBudgetProjectsCache(
        projects.map((item) =>
          item.id === project.id
            ? { ...item, Status: "กำลังดำเนินการ" }
            : item,
        ),
      );

      setMessage("");
      setActionMessage("เริ่มดำเนินการโครงการแล้ว");
      window.setTimeout(() => {
        setActionMessage("");
      }, 3000);
      void loadProjects({ background: true });
    } catch (error) {
      setActionMessage("");
      setMessage(
        error instanceof Error
          ? error.message
          : "ไม่สามารถเริ่มดำเนินการได้",
      );
    } finally {
      setStartingProjectId(null);
    }
  }

  useEffect(() => {
    const cached = readBudgetProjectsCache();

    if (cached) {
      setProjects(
        mapAndSortBudgetProjects(cached.projects)
      );
      setLastLoadedAt(new Date(cached.savedAt).toISOString());
      setLoading(false);
      void loadProjects({ background: true });
    } else {
      void loadProjects();
    }

    void loadMemberOptions();
  }, []);

  const departments = useMemo(
    () =>
      Array.from(
        new Set(
          projects
            .map((project) => project.owner)
            .filter((value) => value && value !== "-"),
        ),
      ).sort((a, b) => a.localeCompare(b, "th")),
    [projects],
  );

  const statuses = useMemo(
    () =>
      Array.from(
        new Set(
          projects
            .map((project) => projectWorkflowStatus(project))
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b, "th")),
    [projects],
  );

  const filteredProjects = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    const filtered = projects.filter((project) => {
      const matchesKeyword =
        !keyword ||
        project.name.toLowerCase().includes(keyword) ||
        project.owner.toLowerCase().includes(keyword) ||
        project.lead.toLowerCase().includes(keyword) ||
        project.code.toLowerCase().includes(keyword) ||
        project.legacyId.toLowerCase().includes(keyword);

      const matchesDepartment =
        department === "all" || project.owner === department;

      const matchesStatus =
        status === "all" || projectWorkflowStatus(project) === status;

      return matchesKeyword && matchesDepartment && matchesStatus;
    });

    return sortBudgetProjects(filtered);
  }, [projects, query, department, status]);

  const totals = useMemo(
    () =>
      filteredProjects.reduce(
        (sum, project) => {
          const budget = effectiveProjectBudget(project);
          const spent = effectiveProjectSpent(project);

          return {
            budget: sum.budget + budget,
            spent: sum.spent + spent,
            remaining: sum.remaining + (budget - spent),
            activities: sum.activities + project.activities.length,
          };
        },
        { budget: 0, spent: 0, remaining: 0, activities: 0 },
      ),
    [filteredProjects],
  );

  function toggleProject(id: string) {
    setExpandedProjectId((current) => (current === id ? null : id));
  }

  async function openNewProjectEditor() {
    setEditorMessage("");
    const options = await loadProjectCodeOptions();

    if (
      !options?.academicYear ||
      !options.sequence
    ) {
      return;
    }

    const generatedCode = composeProjectCode(
      "P1",
      options.sequence,
      options.academicYear,
    );
    const draft = {
      ...createNewProjectDraft(),
      code: generatedCode,
      fiscalYear: options.academicYear,
    };

    setCreatingProject(true);
    setEditingProjectId(draft.id);
    setEditor(draft);
    setPendingFiles([]);
    setRemovedAttachmentIds([]);
    setShowCustomBudgetSourceInput(false);
    setCustomBudgetSourceDraft("");
  }

  async function openProjectEditor(project: BudgetProjectListItem) {
    const savedProject = projectOverrides[project.id];
    const existingCode = savedProject?.code || project.code || "";
    const codeMatch = existingCode.match(
      /^(P[1-4])-(\d{2})-(\d{4})$/,
    );

    let nextCode = existingCode;

    if (codeMatch) {
      setProjectGroupCode(codeMatch[1]);
      setProjectSequence(codeMatch[2]);
      setAcademicYear(codeMatch[3]);
    } else {
      const options = await loadProjectCodeOptions();
      if (!options?.academicYear || !options.sequence) return;

      setProjectGroupCode("P1");
      setProjectSequence(options.sequence);
      nextCode = composeProjectCode(
        "P1",
        options.sequence,
        options.academicYear,
      );
    }

    const editableProject = savedProject
      ? {
          ...savedProject,
          code: nextCode,
          startDate: toDateInputValue(savedProject.startDate),
          endDate: toDateInputValue(savedProject.endDate),
          attachments: Array.isArray(savedProject.attachments)
            ? savedProject.attachments
            : project.attachments,
          activities: savedProject.activities.map((activity) => ({
            ...activity,
            startDate: toDateInputValue(activity.startDate),
            endDate: toDateInputValue(activity.endDate),
          })),
        }
      : {
          ...toEditableProject(project),
          code: nextCode,
        };

    setCreatingProject(false);
    setEditingProjectId(project.id);
    setEditor(editableProject);
    setEditorMessage(
      codeMatch
        ? ""
        : "โครงการเดิมยังไม่มีรหัส กรุณาตรวจสอบรหัสที่ระบบเตรียมไว้แล้วกดบันทึก",
    );
    setPendingFiles([]);
    setRemovedAttachmentIds([]);
    setShowCustomBudgetSourceInput(false);
    setCustomBudgetSourceDraft("");
  }

  function closeProjectEditor() {
    setEditingProjectId(null);
    setCreatingProject(false);
    setEditor(null);
    setEditorMessage("");
    setPendingFiles([]);
    setRemovedAttachmentIds([]);
  }

  function updateEditor<K extends keyof EditableProject>(
    key: K,
    value: EditableProject[K],
  ) {
    setEditor((current) => (current ? { ...current, [key]: value } : current));
  }

  function updateProjectGroupCode(nextGroupCode: string) {
    const nextSequence = firstAvailableSequence(
      nextGroupCode,
      academicYear,
      usedProjectCodes,
    );

    setProjectGroupCode(nextGroupCode);
    setProjectSequence(nextSequence);
    setEditor((current) =>
      current
        ? {
            ...current,
            code: composeProjectCode(
              nextGroupCode,
              nextSequence,
              academicYear,
            ),
            fiscalYear: academicYear,
          }
        : current,
    );
  }

  function updateProjectSequence(nextSequence: string) {
    setProjectSequence(nextSequence);
    setEditor((current) =>
      current
        ? {
            ...current,
            code: composeProjectCode(
              projectGroupCode,
              nextSequence,
              academicYear,
            ),
            fiscalYear: academicYear,
          }
        : current,
    );
  }

  function updateActivity<K extends keyof EditableActivity>(
    index: number,
    key: K,
    value: EditableActivity[K],
  ) {
    setEditor((current) => {
      if (!current) return current;

      return {
        ...current,
        activities: current.activities.map((activity, activityIndex) =>
          activityIndex === index ? { ...activity, [key]: value } : activity,
        ),
      };
    });
  }

  function addActivity() {
    setEditor((current) =>
      current
        ? {
            ...current,
            useActivities: true,
            activities: [
              ...current.activities,
              emptyActivity(current.id, current.activities.length),
            ],
          }
        : current,
    );
  }

  function removeActivity(index: number) {
    setEditor((current) =>
      current
        ? {
            ...current,
            activities: current.activities.filter(
              (_, activityIndex) => activityIndex !== index,
            ),
          }
        : current,
    );
  }

  function toggleBudgetSource(source: string) {
    setEditor((current) => {
      if (!current) return current;

      const selected = current.budgetSources.includes(source);
      const nextBudgetSources = selected
        ? current.budgetSources.filter((item) => item !== source)
        : [...current.budgetSources, source];

      const nextProject = {
        ...current,
        budgetSources: nextBudgetSources,
      };
      const allowedSources = selectedBudgetSourceOptions(nextProject);

      return {
        ...nextProject,
        activities: current.activities.map((activity) => ({
          ...activity,
          budgetSource: allowedSources.includes(activity.budgetSource)
            ? activity.budgetSource
            : "",
        })),
      };
    });
  }

  function addCustomBudgetSource() {
    const source = customBudgetSourceDraft.trim();

    if (!source) return;

    setEditor((current) => {
      if (!current) return current;

      const duplicate = current.budgetSources.some(
        (item) => item.trim().toLowerCase() === source.toLowerCase(),
      );

      if (duplicate) return current;

      return {
        ...current,
        budgetSources: [...current.budgetSources, source],
      };
    });

    setCustomBudgetSourceDraft("");
    setShowCustomBudgetSourceInput(false);
  }

  function removeCustomBudgetSource(source: string) {
    toggleBudgetSource(source);
  }

  function updateCustomBudgetSource(value: string) {
    setEditor((current) => {
      if (!current) return current;

      const previousCustomSource = current.customBudgetSource.trim();
      const nextProject = {
        ...current,
        customBudgetSource: value,
      };
      const nextCustomSource = value.trim();
      const customSourceEnabled = current.budgetSources.includes("อื่นๆ");

      return {
        ...nextProject,
        activities: current.activities.map((activity) => {
          if (activity.budgetSource !== previousCustomSource) return activity;

          return {
            ...activity,
            budgetSource:
              customSourceEnabled && nextCustomSource ? nextCustomSource : "",
          };
        }),
      };
    });
  }

  function addPendingFiles(files: File[]) {
    setPendingFiles((current) => {
      const merged = [...current];

      files.forEach((file) => {
        const duplicate = merged.some(
          (item) =>
            item.name === file.name &&
            item.size === file.size &&
            item.lastModified === file.lastModified,
        );

        if (!duplicate) merged.push(file);
      });

      return merged;
    });
  }

  function removePendingFile(index: number) {
    setPendingFiles((current) =>
      current.filter((_, fileIndex) => fileIndex !== index),
    );
  }

  function toggleExistingAttachmentRemoval(attachmentId: string) {
    if (!attachmentId) return;

    setRemovedAttachmentIds((current) =>
      current.includes(attachmentId)
        ? current.filter((id) => id !== attachmentId)
        : [...current, attachmentId],
    );
  }

  function getRemovedAttachmentNames(project: EditableProject) {
    return project.attachments
      .filter((attachment) => removedAttachmentIds.includes(attachment.id))
      .map((attachment) => attachment.name);
  }

  const editorActivityBudget = editor?.useActivities
    ? editor.activities.reduce(
        (sum, activity) => sum + (Number(activity.budget) || 0),
        0,
      )
    : 0;

  const editorActivitySpent = editor?.useActivities
    ? editor.activities.reduce(
        (sum, activity) => sum + (Number(activity.spent) || 0),
        0,
      )
    : 0;

  const editorUnallocatedBudget = editor
    ? (Number(editor.budget) || 0) - editorActivityBudget
    : 0;

  const editorRemainingBudget = editor
    ? (Number(editor.budget) || 0) -
      (editor.useActivities ? editorActivitySpent : Number(editor.spent) || 0)
    : 0;

  const editorBudgetSourceOptions = editor
    ? selectedBudgetSourceOptions(editor)
    : [];

  async function saveEditor() {
    if (!editor || savingEditor) return;

    const normalizedProjectId = editor.id.trim();
    const normalizedProjectCode = editor.code.trim();

    if (
      !normalizedProjectId ||
      !normalizedProjectCode ||
      !editor.name.trim()
    ) {
      setEditorMessage(
        "กรุณาเลือกกลุ่มงาน ลำดับโครงการ และกรอกชื่อโครงการ",
      );
      return;
    }

    if (!/^P[1-4]-\d{2}-\d{4}$/.test(normalizedProjectCode)) {
      setEditorMessage("รูปแบบรหัสโครงการไม่ถูกต้อง");
      return;
    }

    if (
      projects.some(
        (project) =>
          project.id !== editor.id &&
          project.code.trim().toLowerCase() ===
            normalizedProjectCode.toLowerCase(),
      )
    ) {
      setEditorMessage(
        `รหัสโครงการ ${normalizedProjectCode} มีอยู่แล้ว กรุณาใช้รหัสอื่น`,
      );
      return;
    }

    const removedAttachmentNames = getRemovedAttachmentNames(editor);

    if (removedAttachmentNames.length > 0) {
      const confirmed = window.confirm(
        [
          `ยืนยันลบไฟล์เดิม ${removedAttachmentNames.length} ไฟล์หรือไม่`,
          "",
          ...removedAttachmentNames.map((name) => `• ${name}`),
          "",
          "ไฟล์จะถูกย้ายไปถังขยะใน Google Drive หลังบันทึกสำเร็จ",
        ].join("\n"),
      );

      if (!confirmed) {
        setEditorMessage("ยกเลิกการบันทึก ยังไม่มีไฟล์ถูกลบ");
        return;
      }
    }

    const savedEditor: EditableProject = {
      ...editor,
      id: normalizedProjectId,
      code: normalizedProjectCode,
      name: editor.name.trim(),
      status: workflowStatusValue(editor.status),
      budget: Number(editor.budget) || 0,
      spent: editor.useActivities
        ? editorActivitySpent
        : Number(editor.spent) || 0,
      activities: editor.useActivities
        ? editor.activities.map((activity, index) => ({
            ...activity,
            id:
              creatingProject || !activity.id
                ? `${normalizedProjectId}-A${index + 1}`
                : activity.id,
            name: activity.name.trim() || `กิจกรรมที่ ${index + 1}`,
            lead: activity.lead.trim() || editor.lead,
            budgetSource:
              activity.budgetSource.trim() ||
              editor.budgetSources[0] ||
              editor.customBudgetSource.trim(),
            status: workflowStatusValue(activity.status),
            budget: Number(activity.budget) || 0,
            spent: Number(activity.spent) || 0,
          }))
        : [],
    };

    setSavingEditor(true);
    setEditorMessage("กำลังบันทึกข้อมูล...");

    try {
      const result = await saveBudgetProjectEditor(
        savedEditor,
        pendingFiles,
        removedAttachmentIds,
      );
      const confirmedProject = result.savedProject;

      setProjectOverrides(result.overrides);
      setEditor({
        ...confirmedProject,
        startDate: toDateInputValue(confirmedProject.startDate),
        endDate: toDateInputValue(confirmedProject.endDate),
        activities: confirmedProject.activities.map((activity) => ({
          ...activity,
          startDate: toDateInputValue(activity.startDate),
          endDate: toDateInputValue(activity.endDate),
        })),
      });

      setProjects((currentProjects) => {
        const nextProject = editableProjectToListItem(confirmedProject);
        const existingIndex = currentProjects.findIndex(
          (project) => project.id === confirmedProject.id,
        );

        if (existingIndex < 0) {
          return [nextProject, ...currentProjects];
        }

        return currentProjects.map((project, index) =>
          index === existingIndex ? nextProject : project,
        );
      });

      setPendingFiles([]);
      setRemovedAttachmentIds([]);
      setExpandedProjectId(confirmedProject.id);

      const saveLocation =
        result.source === "supabase" ? "Supabase" : editorDataSource === "supabase" ? "Supabase" : editorDataSource === "gas" ? "Google Sheets" : "เครื่องนี้";

      const fileSummary =
        result.source === "supabase"
          ? [
              result.uploadedAttachmentCount > 0
                ? `เพิ่มไฟล์ ${result.uploadedAttachmentCount} ไฟล์`
                : "",
              result.removedAttachmentCount > 0
                ? `ลบไฟล์เดิม ${result.removedAttachmentCount} ไฟล์`
                : "",
            ]
              .filter(Boolean)
              .join(" และ ")
          : pendingFiles.length > 0 || removedAttachmentIds.length > 0
            ? "ไฟล์แนบยังไม่เปลี่ยน เพราะบันทึกไว้ในเครื่อง"
            : "";

      const verificationText =
        result.source === "supabase"
          ? result.verified
            ? " และตรวจสอบการโหลดกลับแล้ว"
            : ` แต่ยังตรวจสอบการโหลดกลับไม่ได้: ${result.verificationMessage}`
          : "";

      setEditorMessage(
        `บันทึกข้อมูลที่ ${saveLocation} แล้ว${verificationText}${
          fileSummary ? ` (${fileSummary})` : ""
        }`,
      );

      if (result.source === "supabase" && result.verified) {
        setEditorDataSource("supabase");
        setLastLoadedAt(new Date().toISOString());
      }

      window.setTimeout(closeProjectEditor, result.verified ? 1400 : 2200);
    } catch (error) {
      setEditorMessage(
        error instanceof Error
          ? error.message
          : "ไม่สามารถบันทึกข้อมูลโครงการได้",
      );
    } finally {
      setSavingEditor(false);
    }
  }

  if (loading) {
    return <section className="stateBox">กำลังโหลดข้อมูลโครงการ...</section>;
  }

  if (message) {
    return (
      <section className="stateBox warningBox">
        <h2>
          {configured
            ? "ยังโหลดข้อมูลโครงการไม่ได้"
            : "ยังไม่ได้ตั้งค่าการเชื่อมต่อ"}
        </h2>
        <p>{message}</p>
        {!configured && <code>BUDGET_GAS_WEB_APP_URL</code>}
      </section>
    );
  }

  const editorWorkflowSteps = [
    "ยังไม่เริ่ม",
    "กำลังดำเนินการ",
    "เบิกจ่าย",
    "เสร็จสิ้น",
  ];
  const currentEditorWorkflowStatus = workflowStatusValue(
    editor?.status ?? "ยังไม่เริ่ม",
  );
  const currentEditorWorkflowIndex = Math.max(
    0,
    editorWorkflowSteps.indexOf(currentEditorWorkflowStatus),
  );

  return (
    <div className="projectsRoot">
      {actionMessage && (
        <div className="actionSuccess" role="status">
          {actionMessage}
        </div>
      )}

      <section className="pageTop">
        <div>
          <h2>รายการโครงการ</h2>
          <p>ค้นหา กรอง และตรวจสอบงบประมาณของโครงการจากข้อมูลปัจจุบัน</p>
        </div>
        <div className="pageTopActions">
          <div className="sourceStatusGroup">
            <small className="lastLoadedAt">
              {refreshing ? "กำลังอัปเดตเบื้องหลัง · " : ""}
              อัปเดตล่าสุด {formatLoadedTime(lastLoadedAt)}
            </small>
          </div>

          <button
            type="button"
            className="createProjectButton"
            onClick={openNewProjectEditor}
          >
            <span aria-hidden="true">＋</span>
            สร้างโครงการใหม่
          </button>
        </div>
      </section>

      <section className="summaryGrid">
        <article>
          <span>โครงการ</span>
          <strong>{filteredProjects.length}</strong>
          <small>รายการที่แสดง</small>
        </article>
        <article>
          <span>กิจกรรม</span>
          <strong>{totals.activities}</strong>
          <small>กิจกรรมภายใต้โครงการ</small>
        </article>
        <article>
          <span>ใช้จริง</span>
          <strong>{money(totals.spent)}</strong>
          <small>{percent(totals.spent, totals.budget)}% ของงบทั้งหมด</small>
        </article>
        <article>
          <span>งบประมาณคงเหลือ</span>
          <strong className={totals.remaining < 0 ? "negative" : ""}>
            {money(totals.remaining)}
          </strong>
          <small>บาท</small>
        </article>
      </section>

      <section className="filterCard">
        <div className="searchBox">
          <span>⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ค้นหาโครงการ ผู้รับผิดชอบ หรือรหัส..."
          />
        </div>

        <select
          value={department}
          onChange={(event) => setDepartment(event.target.value)}
        >
          <option value="all">ทุกแผนงาน / หน่วยงาน</option>
          {departments.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="all">ทุกสถานะ</option>
          {statuses.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="refreshButton"
          onClick={() => void loadProjects({ background: true })}
          aria-label="รีเฟรชข้อมูล"
        >
          ↻
        </button>
      </section>

      <section className="dataCard">
        <div className="columnHeader">
          <div>#</div>
          <div>ชื่อโครงการ</div>
          <div>แผนงาน</div>
          <div>ผู้รับผิดชอบ</div>
          <div>งบจัดสรร</div>
          <div>ใช้จริง</div>
          <div>คงเหลือ</div>
          <div>สถานะ</div>
          <div>ไฟล์แนบ</div>
          <div>กิจกรรม</div>
        </div>

        <div className="projectList">
          {filteredProjects.map((project, index) => {
            const expanded = expandedProjectId === project.id;
            const projectBudget = effectiveProjectBudget(project);
            const projectSpent = effectiveProjectSpent(project);
            const remaining = projectBudget - projectSpent;
            const displayStatus = projectWorkflowStatus(project);
            const displayBudgetStatus = projectBudgetStatus(project);
            const activitySummary = activityStatusSummary(project);

            return (
              <article
                className={
                  expanded ? "projectCard expandedCard" : "projectCard"
                }
                key={project.id || `${project.name}-${index}`}
              >
                <div className="projectRow">
                  <div className="indexCell">{index + 1}</div>

                  <button
                    type="button"
                    className="projectMain"
                    onClick={() => toggleProject(project.id)}
                    aria-expanded={expanded}
                  >
                    <span
                      className={expanded ? "chevron chevronOpen" : "chevron"}
                    >
                      ›
                    </span>
                    <span className="planIcon" aria-hidden="true">
                      {departmentIcon(project.owner)}
                    </span>
                    <span className="projectText">
                      <b>{project.name}</b>
                      <small></small>
                    </span>
                  </button>

                  <div className="ownerCell">
                    <b>{project.owner}</b>
                  </div>

                  <div className="leadCell">
                    <b>{project.lead}</b>
                  </div>

                  <div className="amountCell">
                    <span>งบจัดสรร</span>
                    <b>{money(projectBudget)}</b>
                  </div>

                  <div className="amountCell">
                    <span>ใช้จริง</span>
                    <b>{money(projectSpent)}</b>
                  </div>

                  <div className="amountCell">
                    <span>คงเหลือ</span>
                    <b className={remaining < 0 ? "negative" : ""}>
                      {money(remaining)}
                    </b>
                  </div>

                  <div className="statusCell">
                    <span className={`statusBadge ${statusClass(displayStatus)}`}>
                      {displayStatus}
                    </span>
                    {canStartProjects && displayStatus === "ยังไม่เริ่ม" && (
                      <button
                        type="button"
                        className="startProjectButton"
                        onClick={() => void startProject(project)}
                        disabled={startingProjectId === project.id}
                        aria-label={`เริ่มดำเนินการ ${project.name}`}
                        title="เริ่มดำเนินการ"
                      >
                        {startingProjectId === project.id ? "…" : "▶"}
                      </button>
                    )}
                  </div>

                  <div className="fileCell">
                    {project.attachments.length === 0 ? (
                      <span className="noFile">–</span>
                    ) : (
                      <div className="fileIcons">
                        {project.attachments.slice(0, 3).map((file) => {
                          const kind = fileKind(file);
                          return (
                            <a
                              key={file.id || file.url}
                              href={file.url}
                              target="_blank"
                              rel="noreferrer"
                              className={`fileIcon ${kind.className}`}
                              title={file.name}
                              aria-label={`${kind.label}: ${file.name}`}
                            >
                              {kind.icon}
                            </a>
                          );
                        })}
                        {project.attachments.length > 3 && (
                          <span className="fileMore">
                            +{project.attachments.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    className="activityCount"
                    onClick={() => toggleProject(project.id)}
                    aria-label={`แสดงกิจกรรม ${project.name}`}
                    title="เปิดหรือปิดกิจกรรม"
                  >
                    {project.activities.length}
                  </button>
                </div>

                {expanded && (
                  <div className="activityPanel">
                    <div className="activityPanelHeader">
                      <div className="activityPanelTitle">
                        <h3>กิจกรรมภายใต้โครงการ</h3>
                        <div className="activitySummaryBadges">
                          <span className="summaryBadge summaryTotal">
                            {activitySummary.total} กิจกรรม
                          </span>
                          <span className="summaryBadge summaryDone">
                            เสร็จแล้ว {activitySummary.completed}
                          </span>
                          <span className="summaryBadge summaryActive">
                            กำลังดำเนินการ {activitySummary.active}
                          </span>
                          <span className="summaryBadge summaryPending">
                            ยังไม่เริ่ม {activitySummary.pending}
                          </span>
                        </div>
                        <div className="activityProgressSummary">
                          <span>
                            ความคืบหน้างาน{" "}
                            <b>{activitySummary.workProgress}%</b>
                          </span>
                          <span>
                            ใช้งบไป{" "}
                            <b>{rawPercent(projectSpent, projectBudget)}%</b>
                          </span>
                          <span className={`inlineBudgetStatus ${budgetStatusClass(displayBudgetStatus)}`}>
                            {displayBudgetStatus}
                          </span>
                        </div>
                      </div>

                      <div
                        className="workflowTimeline"
                        aria-label="ขั้นตอนการดำเนินงาน"
                      >
                        {[
                          {
                            label: "ยังไม่เริ่ม",
                            step: 1,
                            className: "timelinePending",
                            icon: "▤",
                          },
                          {
                            label: "กำลังดำเนินการ",
                            step: 2,
                            className: "timelineActive",
                            icon: "☷",
                          },
                          {
                            label: "เบิกจ่าย",
                            step: 3,
                            className: "timelinePayment",
                            icon: "฿",
                          },
                          {
                            label: "เสร็จสิ้น",
                            step: 4,
                            className: "timelineDone",
                            icon: "✓",
                          },
                        ].map((item, timelineIndex, timelineItems) => {
                          const currentStep = workflowState(displayStatus);
                          const reached = currentStep >= item.step;
                          const current = currentStep === item.step;

                          return (
                            <div className="timelineGroup" key={item.label}>
                              <div className="timelineNode">
                                <div
                                  className={`timelineStage ${
                                    reached ? "timelineReached" : ""
                                  } ${current ? "timelineCurrent" : ""}`}
                                >
                                  <span className="timelineNumber">
                                    {item.step}
                                  </span>
                                  <span
                                    className="timelineIcon"
                                    aria-hidden="true"
                                  >
                                    {item.icon}
                                  </span>
                                </div>

                                <span
                                  className={`timelineLabel ${
                                    reached ? "timelineLabelReached" : ""
                                  }`}
                                >
                                  {item.label}
                                </span>
                              </div>

                              {timelineIndex < timelineItems.length - 1 && (
                                <span
                                  className={`timelineConnector ${
                                    currentStep > item.step
                                      ? "timelineConnectorReached"
                                      : ""
                                  }`}
                                  aria-hidden="true"
                                >
                                  <span className="timelineConnectorTrack" />
                                  <span className="timelineConnectorFlow" />
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <button
                        type="button"
                        className="editProjectButton"
                        onClick={() => openProjectEditor(project)}
                      >
                        แก้ไขโครงการ
                      </button>
                    </div>

                    {project.activities.length === 0 ? (
                      (() => {
                        const projectDetail =
                          projectOverrides[project.id] ||
                          toEditableProject(project);
                        const projectRemaining = projectBudget - projectSpent;
                        const projectBudgetSource = [
                          ...projectDetail.budgetSources,
                          projectDetail.customBudgetSource.trim(),
                        ]
                          .filter(Boolean)
                          .join(", ");

                        return (
                          <div className="projectDetailFallback">
                            <div className="projectDetailNotice">
                              โครงการนี้ยังไม่มีกิจกรรมย่อย
                              จึงแสดงรายละเอียดของโครงการแทน
                            </div>

                            <div className="activityItem projectDetailItem">
                              <div className="activityNumber">โ</div>

                              <div className="activityTitle">
                                <b>{project.name}</b>
                                <small>
                                  {project.lead ||
                                    project.owner ||
                                    "ยังไม่ระบุผู้รับผิดชอบ"}
                                </small>
                              </div>

                              <div className="activityMetric">
                                <span>แหล่งงบประมาณ</span>
                                <b>{projectBudgetSource || "-"}</b>
                              </div>

                              <div className="activityMetric">
                                <span>ช่วงดำเนินการ</span>
                                <b>
                                  {formatThaiDate(projectDetail.startDate)}
                                  {" — "}
                                  {formatThaiDate(
                                    projectDetail.endDate || project.due,
                                  )}
                                </b>
                              </div>

                              <div className="activityMetric">
                                <span>งบประมาณ</span>
                                <b>{money(projectBudget)} บาท</b>
                              </div>

                              <div className="activityMetric">
                                <span>ใช้จริง</span>
                                <b>{money(projectSpent)} บาท</b>
                              </div>

                              <div className="activityMetric">
                                <span>คงเหลือ</span>
                                <b
                                  className={
                                    projectRemaining < 0 ? "negative" : ""
                                  }
                                >
                                  {money(projectRemaining)} บาท
                                </b>
                              </div>

                              <span
                                className={`statusBadge ${statusClass(project.status)}`}
                              >
                                {project.status}
                              </span>
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      <div className="activityList">
                        {project.activities.map((activity, activityIndex) => {
                          const activityRemaining =
                            activity.budget - activity.spent;

                          return (
                            <div
                              className="activityItem"
                              key={
                                activity.id || `${project.id}-${activityIndex}`
                              }
                            >
                              <div className="activityNumber">
                                {activityIndex + 1}
                              </div>

                              <div className="activityTitle">
                                <b>{activity.name}</b>
                                <small>
                                  {activity.lead || "ยังไม่ระบุผู้รับผิดชอบ"}
                                </small>
                              </div>

                              <div className="activityMetric">
                                <span>แหล่งงบประมาณ</span>
                                <b>{activity.budgetSource || "-"}</b>
                              </div>

                              <div className="activityMetric">
                                <span>ช่วงดำเนินการ</span>
                                <b>
                                  {formatThaiDate(activity.startDate)}
                                  {" — "}
                                  {formatThaiDate(activity.endDate)}
                                </b>
                              </div>

                              <div className="activityMetric">
                                <span>งบประมาณ</span>
                                <b>{money(activity.budget)} บาท</b>
                              </div>

                              <div className="activityMetric">
                                <span>ใช้จริง</span>
                                <b>{money(activity.spent)} บาท</b>
                              </div>

                              <div className="activityMetric activityUsageMetric">
                                <span>ใช้ไป</span>
                                <b>
                                  {rawPercent(activity.spent, activity.budget)}%
                                </b>
                                <span
                                  className="activityProgressTrack"
                                  aria-hidden="true"
                                >
                                  <span
                                    className={`activityProgressFill ${
                                      rawPercent(
                                        activity.spent,
                                        activity.budget,
                                      ) > 100
                                        ? "activityProgressOver"
                                        : rawPercent(
                                              activity.spent,
                                              activity.budget,
                                            ) >= 80
                                          ? "activityProgressHigh"
                                          : ""
                                    }`}
                                    style={{
                                      width: `${percent(activity.spent, activity.budget)}%`,
                                    }}
                                  />
                                </span>
                              </div>

                              <div className="activityMetric">
                                <span>คงเหลือ</span>
                                <b
                                  className={
                                    activityRemaining < 0 ? "negative" : ""
                                  }
                                >
                                  {money(activityRemaining)} บาท
                                </b>
                              </div>

                              <span
                                className={`statusBadge ${statusClass(activity.status)}`}
                              >
                                {activity.status}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>

        {filteredProjects.length === 0 && (
          <div className="emptyState">
            ไม่พบโครงการที่ตรงกับเงื่อนไขการค้นหา
          </div>
        )}
      </section>

      {editingProjectId && editor && (
        <div className="editorBackdrop">
          <section className="projectEditor" role="dialog" aria-modal="true">
            <header className="editorHeader">
              <div>
                <h2>
                  {creatingProject ? "สร้างโครงการใหม่" : "แก้ไขโครงการ"}
                </h2>
                <p>
                  {creatingProject
                    ? "กรอกข้อมูลโครงการ กิจกรรม และไฟล์แนบ"
                    : "ปรับข้อมูลโครงการและกิจกรรมภายใต้โครงการ"}
                </p>
              </div>
              <button
                type="button"
                className="editorClose"
                onClick={closeProjectEditor}
              >
                ×
              </button>
            </header>

            <div className="editorBody">
              <section className="editorSection">
                <div className="editorSectionTitle">ข้อมูลโครงการ</div>

                {creatingProject ? (
                  <div className="projectCodeBuilder">
                    <label>
                      <span>กลุ่มงาน</span>
                      <select
                        value={projectGroupCode}
                        onChange={(event) =>
                          updateProjectGroupCode(event.target.value)
                        }
                        disabled={projectCodeLoading}
                      >
                        {PROJECT_GROUP_OPTIONS.map((option) => (
                          <option key={option.code} value={option.code}>
                            {option.code} {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      <span>ลำดับโครงการ</span>
                      <select
                        value={projectSequence}
                        onChange={(event) =>
                          updateProjectSequence(event.target.value)
                        }
                        disabled={projectCodeLoading}
                      >
                        {PROJECT_SEQUENCE_OPTIONS.map((sequence) => {
                          const code = composeProjectCode(
                            projectGroupCode,
                            sequence,
                            academicYear,
                          );
                          const used = usedProjectCodes.includes(code);

                          return (
                            <option
                              key={sequence}
                              value={sequence}
                              disabled={used}
                            >
                              {sequence}
                              {used ? " — ใช้แล้ว" : ""}
                            </option>
                          );
                        })}
                      </select>
                    </label>

                    <label>
                      <span>ปีการศึกษา</span>
                      <input value={academicYear} readOnly />
                    </label>

                    <label>
                      <span>รหัสโครงการ</span>
                      <input
                        value={editor.code}
                        readOnly
                        className="projectCodePreview"
                      />
                    </label>
                  </div>
                ) : editor.code &&
                  /^P[1-4]-\d{2}-\d{4}$/.test(editor.code) ? (
                  <div className="editorGrid twoColumns">
                    <label>
                      <span>รหัสโครงการ</span>
                      <input value={editor.code} readOnly />
                    </label>
                    <label>
                      <span>ปีการศึกษา</span>
                      <input value={editor.fiscalYear} readOnly />
                    </label>
                  </div>
                ) : (
                  <div className="projectCodeBuilder legacyProjectCodeBuilder">
                    <label>
                      <span>กลุ่มงาน</span>
                      <select
                        value={projectGroupCode}
                        onChange={(event) =>
                          updateProjectGroupCode(event.target.value)
                        }
                      >
                        {PROJECT_GROUP_OPTIONS.map((option) => (
                          <option key={option.code} value={option.code}>
                            {option.code} {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      <span>ลำดับโครงการ</span>
                      <select
                        value={projectSequence}
                        onChange={(event) =>
                          updateProjectSequence(event.target.value)
                        }
                      >
                        {PROJECT_SEQUENCE_OPTIONS.map((sequence) => {
                          const code = composeProjectCode(
                            projectGroupCode,
                            sequence,
                            academicYear,
                          );
                          const used = usedProjectCodes.includes(code);

                          return (
                            <option
                              key={sequence}
                              value={sequence}
                              disabled={used}
                            >
                              {sequence}
                              {used ? " — ใช้แล้ว" : ""}
                            </option>
                          );
                        })}
                      </select>
                    </label>

                    <label>
                      <span>ปีการศึกษา</span>
                      <input value={academicYear} readOnly />
                    </label>

                    <label>
                      <span>กำหนดรหัสโครงการเดิม</span>
                      <input
                        value={editor.code}
                        readOnly
                        className="projectCodePreview"
                      />
                    </label>
                  </div>
                )}

                <label>
                  <span>ชื่อโครงการ</span>
                  <input
                    value={editor.name}
                    onChange={(e) => updateEditor("name", e.target.value)}
                  />
                </label>

                <div className="editorGrid twoColumns">
                  <label>
                    <span>แผนงาน</span>
                    <input
                      value={editor.owner}
                      onChange={(e) => updateEditor("owner", e.target.value)}
                    />
                  </label>
                  <label>
                    <span>ผู้รับผิดชอบ</span>
                    <select value={editor.lead} onChange={(e) => updateEditor("lead", e.target.value)} disabled={membersLoading}>
                      <option value="">{membersLoading ? "กำลังโหลดรายชื่อ..." : "เลือกผู้รับผิดชอบ"}</option>
                      {editor.lead && !memberOptions.some((member) => member.name === editor.lead) && (
                        <option value={editor.lead}>{editor.lead}</option>
                      )}
                      {memberOptions.map((member) => (
                        <option key={member.id} value={member.name}>
                          {member.name}{member.position ? ` — ${member.position}` : ""}
                        </option>
                      ))}
                    </select>
                    {membersMessage && <small className="memberLoadMessage">{membersMessage}</small>}
                  </label>
                </div>

                <div className="editorGrid twoColumns">
                  <label>
                    <span>สถานะการดำเนินงาน</span>
                    <div
                      className="editorWorkflowStepper"
                      aria-label={`สถานะปัจจุบัน ${currentEditorWorkflowStatus}`}
                    >
                      {editorWorkflowSteps.map((step, index) => {
                        const isComplete =
                          index < currentEditorWorkflowIndex;
                        const isCurrent =
                          index === currentEditorWorkflowIndex;

                        return (
                          <div
                            key={step}
                            className={`editorWorkflowStep ${
                              isComplete
                                ? "editorWorkflowStepComplete"
                                : ""
                            } ${
                              isCurrent
                                ? "editorWorkflowStepCurrent"
                                : ""
                            }`}
                            aria-current={isCurrent ? "step" : undefined}
                          >
                            <span className="editorWorkflowCircle">
                              {isComplete ? "✓" : index + 1}
                            </span>
                            <span className="editorWorkflowLabel">
                              {step}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <small className="automaticStatusNote">
                      สถานะเปลี่ยนตามขั้นตอนการทำงาน ไม่สามารถแก้ไขจากหน้านี้
                    </small>
                  </label>
                  <label>
                    <span>งบจัดสรร</span>
                    <input
                      type="number"
                      min="0"
                      inputMode="decimal"
                      value={editor.budget === 0 ? "" : editor.budget}
                      placeholder="กรอกจำนวนเงิน"
                      onChange={(e) =>
                        updateEditor(
                          "budget",
                          e.target.value === "" ? 0 : Number(e.target.value),
                        )
                      }
                    />
                  </label>
                </div>

                <div className="paymentSourceNotice">
                  ยอดใช้จริงคำนวณอัตโนมัติจากหน้า “การเบิกจ่าย”
                  และไม่สามารถกรอกจากหน้าโครงการได้
                </div>

                <div className="editorGrid twoColumns">
                  <label>
                    <span>วันที่เริ่ม</span>
                    <input
                      type="date"
                      value={editor.startDate}
                      onChange={(e) =>
                        updateEditor("startDate", e.target.value)
                      }
                    />
                  </label>
                </div>

                <div className="editorGrid twoColumns">
                  <label>
                    <span>วันที่สิ้นสุด</span>
                    <input
                      type="date"
                      value={editor.endDate}
                      onChange={(e) => updateEditor("endDate", e.target.value)}
                    />
                  </label>
                  <label className="checkRow">
                    <input
                      type="checkbox"
                      checked={editor.useActivities}
                      onChange={(e) =>
                        updateEditor("useActivities", e.target.checked)
                      }
                    />
                    <span>แยกงบตามกิจกรรมภายใต้โครงการ</span>
                  </label>
                </div>
              </section>

              <section className="editorSection fileSection">
                <div className="sectionHeading">
                  <div>
                    <div className="editorSectionTitle">ไฟล์แนบโครงการ</div>
                    <p>เพิ่มได้หลายไฟล์ และเลือกไฟล์เดิมที่ต้องการลบได้</p>
                  </div>
                  <label className="filePicker">
                    + เพิ่มไฟล์
                    <input
                      type="file"
                      multiple
                      accept=".jpg,.jpeg,.png,.pdf,.doc,.docx"
                      onChange={(event) => {
                        addPendingFiles(Array.from(event.target.files || []));
                        event.target.value = "";
                      }}
                    />
                  </label>
                </div>

                {removedAttachmentIds.length > 0 && (
                  <div className="attachmentDeleteSummary" role="status">
                    เลือกลบไฟล์เดิม {removedAttachmentIds.length} ไฟล์
                    <button
                      type="button"
                      onClick={() => setRemovedAttachmentIds([])}
                    >
                      ยกเลิกทั้งหมด
                    </button>
                  </div>
                )}

                {editor.attachments.length > 0 && (
                  <div className="existingAttachmentList">
                    {editor.attachments.map((attachment) => {
                      const markedForRemoval = removedAttachmentIds.includes(
                        attachment.id,
                      );

                      return (
                        <div
                          className={`attachmentManageRow ${
                            markedForRemoval ? "attachmentMarkedForRemoval" : ""
                          }`}
                          key={attachment.id || attachment.url}
                        >
                          <a
                            href={attachment.url}
                            target="_blank"
                            rel="noreferrer"
                            title={attachment.name}
                          >
                            {attachment.name}
                          </a>
                          <button
                            type="button"
                            onClick={() =>
                              toggleExistingAttachmentRemoval(attachment.id)
                            }
                          >
                            {markedForRemoval ? "ยกเลิกการลบ" : "เลือกเพื่อลบ"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="dropZone">
                  <strong>
                    {pendingFiles.length
                      ? `ไฟล์ใหม่ ${pendingFiles.length} ไฟล์`
                      : "ยังไม่มีไฟล์แนบใหม่"}
                  </strong>

                  {pendingFiles.length > 0 ? (
                    <div className="pendingFileList">
                      {pendingFiles.map((file, index) => (
                        <div
                          className="attachmentManageRow"
                          key={`${file.name}-${file.lastModified}`}
                        >
                          <span>
                            {file.name}
                            <small className="pendingFileSize">
                              {formatFileSize(file.size)}
                            </small>
                          </span>
                          <button
                            type="button"
                            onClick={() => removePendingFile(index)}
                          >
                            เอาออก
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span>
                      รองรับ JPG, PNG, PDF, DOC และ DOCX ไฟล์ละไม่เกิน 10 MB
                    </span>
                  )}
                </div>
              </section>

              <section className="editorSection">
                <div className="editorSectionTitle">
                  แหล่งเงินของโครงการ
                </div>

                <div className="budgetSourceQuickActions">
                  {["เงินอุดหนุน", "เงินรายได้สถานศึกษา"].map((source) => {
                    const selected = editor.budgetSources.includes(source);

                    return (
                      <button
                        key={source}
                        type="button"
                        className={`budgetSourceButton ${selected ? "selected" : ""}`}
                        onClick={() => toggleBudgetSource(source)}
                      >
                        {selected ? "✓ " : ""}
                        {source}
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    className="addBudgetSourceButton"
                    aria-label="เพิ่มแหล่งเงิน"
                    title="เพิ่มแหล่งเงิน"
                    onClick={() =>
                      setShowCustomBudgetSourceInput((current) => !current)
                    }
                  >
                    +
                  </button>
                </div>

                {showCustomBudgetSourceInput && (
                  <div className="customBudgetSourceRow">
                    <input
                      autoFocus
                      value={customBudgetSourceDraft}
                      placeholder="กรอกชื่อแหล่งเงิน เช่น เงินบริจาค"
                      onChange={(event) =>
                        setCustomBudgetSourceDraft(event.target.value)
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addCustomBudgetSource();
                        }

                        if (event.key === "Escape") {
                          setCustomBudgetSourceDraft("");
                          setShowCustomBudgetSourceInput(false);
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={addCustomBudgetSource}
                      disabled={!customBudgetSourceDraft.trim()}
                    >
                      เพิ่ม
                    </button>
                    <button
                      type="button"
                      className="cancelCustomSourceButton"
                      onClick={() => {
                        setCustomBudgetSourceDraft("");
                        setShowCustomBudgetSourceInput(false);
                      }}
                    >
                      ยกเลิก
                    </button>
                  </div>
                )}

                {editor.budgetSources.filter(
                  (source) =>
                    !["เงินอุดหนุน", "เงินรายได้สถานศึกษา", "อื่นๆ"].includes(
                      source,
                    ),
                ).length > 0 && (
                  <div className="customBudgetSourceList">
                    {editor.budgetSources
                      .filter(
                        (source) =>
                          ![
                            "เงินอุดหนุน",
                            "เงินรายได้สถานศึกษา",
                            "อื่นๆ",
                          ].includes(source),
                      )
                      .map((source) => (
                        <span className="customBudgetSourceChip" key={source}>
                          {source}
                          <button
                            type="button"
                            aria-label={`ลบ ${source}`}
                            title={`ลบ ${source}`}
                            onClick={() => removeCustomBudgetSource(source)}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                  </div>
                )}

                <label>
                  <span>แหล่งเงินที่เลือก</span>
                  <input
                    className="selectedBudgetSourcesField"
                    value={editorBudgetSourceOptions.join(", ")}
                    placeholder="ยังไม่ได้เลือกแหล่งงบประมาณ"
                    readOnly
                  />
                  <small className="fieldHelp">
                    กิจกรรมย่อยจะเลือกได้เฉพาะแหล่งงบประมาณในช่องนี้
                  </small>
                </label>
              </section>

              <section className="editorSection">
                <div className="sectionHeading">
                  <div>
                    <div className="editorSectionTitle">
                      กิจกรรมภายใต้โครงการ
                    </div>
                    <p>เพิ่มผู้รับผิดชอบ สถานะ แหล่งงบ งบประมาณ และช่วงเวลา</p>
                  </div>
                  <button
                    type="button"
                    className="addActivityButton"
                    onClick={addActivity}
                  >
                    + เพิ่มกิจกรรม
                  </button>
                </div>

                {editor.useActivities && (
                  <div className="editorBudgetOverview">
                    <div>
                      <span>งบโครงการ</span>
                      <b>{money(Number(editor.budget) || 0)} บาท</b>
                    </div>
                    <div>
                      <span>จัดสรรให้กิจกรรมแล้ว</span>
                      <b>{money(editorActivityBudget)} บาท</b>
                    </div>
                    <div>
                      <span>ใช้จริงจากกิจกรรม</span>
                      <b>{money(editorActivitySpent)} บาท</b>
                    </div>
                    <div
                      className={
                        editorUnallocatedBudget < 0
                          ? "budgetOverviewDanger"
                          : ""
                      }
                    >
                      <span>งบที่ยังไม่จัดสรร</span>
                      <b>{money(editorUnallocatedBudget)} บาท</b>
                    </div>
                    <div
                      className={
                        editorRemainingBudget < 0 ? "budgetOverviewDanger" : ""
                      }
                    >
                      <span>คงเหลือโครงการ</span>
                      <b>{money(editorRemainingBudget)} บาท</b>
                    </div>
                  </div>
                )}

                {editor.useActivities && editorUnallocatedBudget < 0 && (
                  <div className="budgetWarningBox" role="status">
                    จัดสรรงบให้กิจกรรมเกินงบโครงการ{" "}
                    {money(Math.abs(editorUnallocatedBudget))} บาท
                    ระบบยังอนุญาตให้บันทึกและจะแสดงยอดติดลบ
                  </div>
                )}

                {editor.useActivities && editorRemainingBudget < 0 && (
                  <div
                    className="budgetWarningBox budgetWarningDanger"
                    role="status"
                  >
                    ใช้จริงรวมเกินงบโครงการ{" "}
                    {money(Math.abs(editorRemainingBudget))} บาท
                  </div>
                )}

                {!editor.useActivities ? (
                  <div className="editorEmpty">
                    เปิด “แยกงบตามกิจกรรมภายใต้โครงการ” เพื่อเพิ่มกิจกรรม
                  </div>
                ) : editor.activities.length === 0 ? (
                  <div className="editorEmpty">ยังไม่มีกิจกรรม</div>
                ) : (
                  <div className="activityEditorList">
                    {editor.activities.map((activity, index) => (
                      <article className="activityEditorCard" key={activity.id}>
                        <div className="activityEditorHeader">
                          <strong>กิจกรรมที่ {index + 1}</strong>
                          <button
                            type="button"
                            onClick={() => removeActivity(index)}
                          >
                            ลบ
                          </button>
                        </div>

                        <label>
                          <span>ชื่อกิจกรรม</span>
                          <input
                            value={activity.name}
                            onChange={(e) =>
                              updateActivity(index, "name", e.target.value)
                            }
                          />
                        </label>

                        <div className="editorGrid twoColumns">
                          <label>
                            <span>ผู้รับผิดชอบ</span>
                            <select value={activity.lead} onChange={(e) => updateActivity(index, "lead", e.target.value)} disabled={membersLoading}>
                              <option value="">{membersLoading ? "กำลังโหลดรายชื่อ..." : "เลือกผู้รับผิดชอบ"}</option>
                              {activity.lead && !memberOptions.some((member) => member.name === activity.lead) && (
                                <option value={activity.lead}>{activity.lead}</option>
                              )}
                              {memberOptions.map((member) => (
                                <option key={member.id} value={member.name}>
                                  {member.name}{member.position ? ` — ${member.position}` : ""}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            <span>สถานะการดำเนินงาน</span>
                            <div
                              className="workflowChoiceGroup activityWorkflowChoiceGroup"
                              role="group"
                              aria-label={`สถานะกิจกรรมที่ ${index + 1}`}
                            >
                              {["ยังไม่เริ่ม", "กำลังดำเนินการ", "เสร็จสิ้น"].map(
                                (item) => {
                                  const currentStatus =
                                    workflowStatusValue(activity.status);

                                  return (
                                    <button
                                      type="button"
                                      key={item}
                                      className={`workflowChoiceButton ${
                                        currentStatus === item
                                          ? "workflowChoiceButtonActive"
                                          : ""
                                      }`}
                                      onClick={() =>
                                        updateActivity(index, "status", item)
                                      }
                                      aria-pressed={currentStatus === item}
                                    >
                                      {item}
                                    </button>
                                  );
                                },
                              )}
                            </div>
                          </label>
                        </div>

                        <div className="editorGrid twoColumns">
                          <label>
                            <span>แหล่งงบประมาณ</span>
                            <select
                              value={activity.budgetSource}
                              disabled={editorBudgetSourceOptions.length === 0}
                              onChange={(e) =>
                                updateActivity(
                                  index,
                                  "budgetSource",
                                  e.target.value,
                                )
                              }
                            >
                              <option value="">
                                {editorBudgetSourceOptions.length === 0
                                  ? "กรุณาเลือกแหล่งงบของโครงการก่อน"
                                  : "เลือกแหล่งงบประมาณ"}
                              </option>
                              {editorBudgetSourceOptions.map((source) => (
                                <option key={source} value={source}>
                                  {source}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            <span>งบประมาณ</span>
                            <input
                              type="number"
                              min="0"
                              inputMode="decimal"
                              value={
                                activity.budget === 0 ? "" : activity.budget
                              }
                              placeholder="กรอกจำนวนเงิน"
                              onChange={(e) =>
                                updateActivity(
                                  index,
                                  "budget",
                                  e.target.value === ""
                                    ? 0
                                    : Number(e.target.value),
                                )
                              }
                            />
                          </label>
                        </div>

                        <div className="activityPaymentSourceNotice">
                          ยอดใช้จริงของกิจกรรมคำนวณจากรายการเบิกจ่ายที่เลือกกิจกรรมนี้
                        </div>

                        <div className="editorGrid threeColumns">
                          <label>
                            <span>วันที่เริ่ม</span>
                            <input
                              type="date"
                              value={activity.startDate}
                              onChange={(e) =>
                                updateActivity(
                                  index,
                                  "startDate",
                                  e.target.value,
                                )
                              }
                            />
                          </label>
                          <label>
                            <span>วันที่สิ้นสุด</span>
                            <input
                              type="date"
                              value={activity.endDate}
                              onChange={(e) =>
                                updateActivity(index, "endDate", e.target.value)
                              }
                            />
                          </label>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <footer className="editorFooter">
              <span className="editorMessage">{editorMessage}</span>
              <div>
                <button
                  type="button"
                  className="cancelEditorButton"
                  onClick={closeProjectEditor}
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  className="saveEditorButton"
                  onClick={() => void saveEditor()}
                  disabled={savingEditor}
                >
                  {savingEditor
                    ? "กำลังบันทึก..."
                    : creatingProject
                      ? "สร้างโครงการ"
                      : "บันทึกการแก้ไข"}
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}

      <style>{`
        .projectsRoot {
          display: grid;
          gap: 16px;
          min-width: 0;
          font-family: "Sarabun", "Noto Sans Thai", "Leelawadee UI", Tahoma, Arial, sans-serif;
        }
        .stateBox { padding: 28px; border: 1px solid #dcfce7; border-radius: 18px; background: #fff; text-align: center; }
        .warningBox { border-color: #fde68a; background: #fffbeb; }
        .warningBox h2 { margin: 0; color: #92400e; }
        .warningBox p, .warningBox code { display: block; margin-top: 10px; }

        .pageTop {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 16px 18px;
          border: 1px solid #86efac;
          border-left: 7px solid #16a34a;
          border-radius: 16px;
          background: linear-gradient(90deg, #dcfce7 0%, #f0fdf4 58%, #ffffff 100%);
          box-shadow: 0 8px 20px rgba(22, 101, 52, .08);
        }
        .pageTop h2 { margin: 0; color: #14532d; font-size: 26px; font-weight: 900; }
        .pageTop p { margin: 5px 0 0; color: #3f6212; font-size: 13px; font-weight: 600; }
        .readOnlyBadge { padding: 7px 11px; border-radius: 999px; color: #166534; background: #dcfce7; font-size: 11px; font-weight: 800; }

        .createProjectButton {
          display: inline-flex;
          min-height: 39px;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 8px 14px;
          border: 1px solid #15803d;
          border-radius: 11px;
          color: #ffffff;
          background: linear-gradient(135deg, #22c55e, #15803d);
          box-shadow: 0 6px 14px rgba(22, 163, 74, .2);
          font: inherit;
          font-size: 12px;
          font-weight: 900;
          white-space: nowrap;
          cursor: pointer;
        }

        .createProjectButton:hover {
          background: linear-gradient(135deg, #16a34a, #166534);
          transform: translateY(-1px);
        }

        .createProjectButton span {
          font-size: 18px;
          line-height: 1;
        }

        .summaryGrid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
        .summaryGrid article { padding: 15px; border: 1px solid #dcfce7; border-radius: 15px; background: linear-gradient(180deg, #fff, #f8fffb); }
        .summaryGrid span, .summaryGrid small { display: block; color: #6b7280; font-size: 11px; }
        .summaryGrid strong { display: block; margin-top: 7px; color: #166534; font-size: 21px; }
        .summaryGrid small { margin-top: 5px; }
        .summaryGrid .negative { color: #dc2626 !important; }

        .filterCard { display: grid; grid-template-columns: minmax(260px, 1fr) minmax(170px, 220px) minmax(150px, 190px) 42px; gap: 10px; padding: 13px; border: 1px solid #e5e7eb; border-radius: 15px; background: #fff; }
        .searchBox { display: flex; min-height: 40px; align-items: center; gap: 8px; padding: 0 11px; border: 1px solid #d1d5db; border-radius: 10px; }
        .searchBox input { width: 100%; min-width: 0; border: 0; outline: none; font: inherit; }
        .filterCard select, .refreshButton { min-height: 40px; border: 1px solid #d1d5db; border-radius: 10px; background: #fff; font: inherit; }
        .filterCard select { width: 100%; min-width: 0; padding: 0 9px; }
        .refreshButton { color: #0284c7; border-color: #38bdf8; font-size: 19px; cursor: pointer; }

        .dataCard { overflow: hidden; border: 1px solid #e5e7eb; border-radius: 15px; background: #fff; box-shadow: 0 8px 26px rgba(15,23,42,.05); }
        .dataNotice { padding: 9px 13px; color: #166534; background: linear-gradient(90deg, #ecfdf5, #f0fdf4); font-size: 11px; font-weight: 700; }
        .dataCard {
          --project-grid:
            30px
            minmax(380px, 2.75fr)
            minmax(105px, .62fr)
            minmax(150px, .88fr)
            minmax(80px, .46fr)
            minmax(80px, .46fr)
            minmax(80px, .46fr)
            minmax(82px, .48fr)
            minmax(74px, .42fr)
            52px;
        }

        .columnHeader {
          display: grid;
          grid-template-columns: var(--project-grid);
          gap: 8px;
          align-items: center;
          padding: 10px 12px;
          color: #0f172a;
          background: linear-gradient(90deg, #e0f2fe 0%, #ecfeff 48%, #ecfdf5 100%);
          border-top: 1px solid #dbeafe;
          border-bottom: 1px solid #cbd5e1;
          font-size: 12px;
          font-weight: 900;
          line-height: 1.35;
        }

        .columnHeader > div:nth-child(n + 5):nth-child(-n + 7) {
          text-align: right;
        }

        .columnHeader > div:nth-child(n + 8) {
          text-align: center;
        }

        .projectList { display: grid; }

        .projectCard {
          position: relative;
          border-bottom: 1px solid #e5e7eb;
          background: #ffffff;
          transition:
            background .18s ease,
            box-shadow .18s ease,
            border-color .18s ease;
        }

        .projectCard:last-child { border-bottom: 0; }

        .expandedCard {
          z-index: 1;
          margin: 5px 7px;
          overflow: hidden;
          border: 1px solid #86efac;
          border-left: 5px solid #16a34a;
          border-radius: 14px;
          background: #f0fdf4;
          box-shadow: 0 10px 24px rgba(22, 101, 52, .12);
        }

        .expandedCard .projectRow {
          background: linear-gradient(90deg, #dcfce7 0%, #f0fdf4 48%, #ffffff 100%);
        }

        .expandedCard .projectText b {
          color: #14532d;
        }

        .expandedCard .planIcon {
          border-color: #4ade80;
          color: #ffffff;
          background: linear-gradient(135deg, #22c55e, #15803d);
        }

        .projectRow {
          display: grid;
          font-family: inherit;
          font-size: 13px;
          line-height: 1.32;
          grid-template-columns: var(--project-grid);
          gap: 8px;
          align-items: center;
          padding: 8px 12px;
        }

        .projectRow:hover { background: #f8fafc; }
        .indexCell { color: #475569; font-size: 13px; line-height: 1.32; text-align: center; }

        .projectMain {
          display: grid;
          grid-template-columns: 16px 28px minmax(0, 1fr);
          align-items: center;
          gap: 8px;
          padding: 0;
          border: 0;
          background: transparent;
          text-align: left;
          cursor: pointer;
          min-width: 0;
        }

        .chevron { color: #0ea5e9; font-size: 18px; font-weight: 900; transition: transform .18s ease; }
        .chevronOpen { transform: rotate(90deg); }

        .planIcon {
          display: grid;
          width: 25px;
          height: 25px;
          place-items: center;
          border: 1px solid #bbf7d0;
          border-radius: 8px;
          color: #15803d;
          background: #f0fdf4;
          font-size: 13px;
          font-weight: 900;
        }

        .projectText {
          display: flex;
          min-width: 0;
          align-items: center;
        }

        .projectText b {
          display: block;
          color: #1d4ed8;
          font-size: 13px;
          line-height: 1.32;
          white-space: normal;
          overflow-wrap: anywhere;
        }

        .ownerCell, .leadCell, .amountCell {
          min-width: 0;
          font-size: 13px;
          line-height: 1.32;
        }

        .ownerCell span,
        .leadCell span,
        .amountCell span {
          display: none;
        }

        .ownerCell b,
        .leadCell b,
        .amountCell b {
          display: block;
          margin-top: 0;
          color: #1f2937;
          font-family: inherit;
          font-size: 13px;
          font-weight: 600;
          line-height: 1.32;
          white-space: normal;
          word-break: normal;
          overflow-wrap: break-word;
        }

        .leadCell b {
          font-weight: 600;
        }

        .amountCell {
          text-align: right;
        }

        .amountCell b {
          color: #0284c7;
          white-space: nowrap;
          font-variant-numeric: tabular-nums;
        }
        .negative { color: #dc2626 !important; }

        .projectRow .projectText b,
        .projectRow .ownerCell b,
        .projectRow .leadCell b,
        .projectRow .amountCell b,
        .projectRow .statusBadge,
        .projectRow .activityCountButton {
          font-family: inherit;
          font-size: 13px;
          line-height: 1.32;
        }

        .statusCell,
        .fileCell {
          min-width: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .statusBadge {
          display: inline-flex;
          min-width: 68px;
          min-height: 28px;
          align-items: center;
          justify-content: center;
          padding: 4px 8px;
          border-radius: 999px;
          font-size: 13px;
          font-weight: 700;
          white-space: nowrap;
        }
        .done { color: #166534; background: #dcfce7; }
        .payment { color: #7c2d12; background: #ffedd5; }
        .active { color: #1d4ed8; background: #dbeafe; }
        .pending { color: #475569; background: #f1f5f9; }
        .cancelled { color: #991b1b; background: #fee2e2; }

        .fileIcons { display: flex; flex-wrap: wrap; gap: 4px; }
        .fileIcon {
          display: inline-grid;
          width: 27px;
          height: 27px;
          place-items: center;
          border: 1px solid;
          border-radius: 7px;
          font-size: 9px;
          font-weight: 900;
          text-decoration: none;
        }
        .filePdf {
          color: #ffffff;
          border-color: #dc2626;
          background: linear-gradient(135deg, #ef4444, #b91c1c);
          box-shadow: 0 3px 8px rgba(220, 38, 38, .22);
        }
        .fileWord {
          color: #ffffff;
          border-color: #2563eb;
          background: linear-gradient(135deg, #3b82f6, #1d4ed8);
          box-shadow: 0 3px 8px rgba(37, 99, 235, .22);
        }
        .fileImage {
          color: #ffffff;
          border-color: #f97316;
          background: linear-gradient(135deg, #fb923c, #ea580c);
          box-shadow: 0 3px 8px rgba(234, 88, 12, .22);
        }
        .fileOther {
          color: #ffffff;
          border-color: #7c3aed;
          background: linear-gradient(135deg, #8b5cf6, #6d28d9);
          box-shadow: 0 3px 8px rgba(109, 40, 217, .2);
        }
        .fileMore { display: inline-grid; min-width: 27px; height: 27px; place-items: center; padding: 0 4px; border-radius: 7px; color: #475569; background: #f1f5f9; font-size: 9px; font-weight: 800; }
        .noFile { color: #cbd5e1; }

        .activityCount {
          display: inline-grid;
          width: 30px;
          height: 30px;
          place-items: center;
          justify-self: center;
          border: 1px solid #bbf7d0;
          border-radius: 8px;
          color: #166534;
          background: #f0fdf4;
          font-size: 10px;
          font-weight: 900;
          cursor: pointer;
        }

        .activityCount:hover {
          border-color: #4ade80;
          background: #dcfce7;
        }

        .expandedCard .activityCount {
          border-color: #16a34a;
          color: #ffffff;
          background: #16a34a;
          box-shadow: 0 4px 10px rgba(22, 163, 74, .22);
        }

        .activityPanel {
          padding: 13px 15px 15px 46px;
          border-top: 1px solid #86efac;
          background:
            linear-gradient(180deg, rgba(240, 253, 244, .96), #ffffff 72%);
          box-shadow: inset 0 8px 16px rgba(22, 101, 52, .04);
        }
        .activityPanelHeader {
          display: grid;
          grid-template-columns:
            minmax(310px, 1.15fr)
            minmax(430px, 1.7fr)
            auto;
          align-items: center;
          gap: 18px;
          margin-bottom: 14px;
        }

        .activityPanelTitle h3 {
          margin: 0;
          color: #14532d;
          font-size: 17px;
          font-weight: 900;
        }

        .activitySummaryBadges {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 8px;
        }

        .summaryBadge {
          display: inline-flex;
          min-height: 26px;
          align-items: center;
          padding: 4px 9px;
          border: 1px solid transparent;
          border-radius: 999px;
          font-size: 10px;
          font-weight: 900;
          white-space: nowrap;
        }

        .summaryTotal { color: #075985; border-color: #bae6fd; background: #e0f2fe; }
        .summaryDone { color: #166534; border-color: #bbf7d0; background: #dcfce7; }
        .summaryActive { color: #1d4ed8; border-color: #bfdbfe; background: #dbeafe; }
        .summaryPending { color: #475569; border-color: #cbd5e1; background: #f1f5f9; }

        .activityProgressSummary {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
          margin-top: 8px;
        }

        .activityProgressSummary > span {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 9px;
          border-radius: 9px;
          color: #334155;
          background: #ffffff;
          box-shadow: inset 0 0 0 1px #dbeafe;
          font-size: 11px;
          font-weight: 700;
        }

        .activityProgressSummary b {
          color: #15803d;
          font-size: 13px;
          font-weight: 900;
        }

        .workflowTimeline {
          display: flex;
          align-items: flex-start;
          justify-content: center;
          min-width: 0;
          padding: 7px 9px 8px;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          background: linear-gradient(180deg, #ffffff, #f8fafc);
          box-shadow: 0 4px 10px rgba(15, 23, 42, .04);
        }

        .timelineGroup {
          display: contents;
        }

        .timelineNode {
          display: flex;
          width: 74px;
          flex: 0 0 74px;
          align-items: center;
          flex-direction: column;
          text-align: center;
        }

        .timelineStage {
          position: relative;
          display: grid;
          width: 40px;
          height: 40px;
          place-items: center;
          border: 2px solid #d1d5db;
          border-radius: 50%;
          color: #9ca3af;
          background: linear-gradient(180deg, #ffffff, #f3f4f6);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.6);
          transition:
            transform .18s ease,
            box-shadow .18s ease,
            border-color .18s ease,
            background .18s ease,
            color .18s ease;
        }

        .timelineNumber {
          position: absolute;
          top: -6px;
          left: -4px;
          display: grid;
          width: 17px;
          height: 17px;
          place-items: center;
          border-radius: 50%;
          color: #ffffff;
          background: #9ca3af;
          font-size: 8px;
          font-weight: 900;
          box-shadow: 0 2px 5px rgba(15, 23, 42, .14);
        }

        .timelineIcon {
          font-size: 18px;
          font-weight: 900;
          line-height: 1;
        }

        .timelineConnector {
          position: relative;
          display: block;
          width: 38px;
          height: 4px;
          flex: 0 0 38px;
          overflow: hidden;
          margin-top: 18px;
          border-radius: 999px;
        }

        .timelineConnectorTrack,
        .timelineConnectorFlow {
          position: absolute;
          inset: 0;
          display: block;
          border-radius: inherit;
        }

        .timelineConnectorTrack {
          background: #d1d5db;
        }

        .timelineConnectorFlow {
          opacity: 0;
          background:
            linear-gradient(
              90deg,
              transparent 0%,
              rgba(255,255,255,.9) 50%,
              transparent 100%
            );
          transform: translateX(-100%);
        }

        .timelineConnectorReached .timelineConnectorFlow {
          opacity: 1;
          animation: workflowFlow 1.8s linear infinite;
        }

        @keyframes workflowFlow {
          from { transform: translateX(-100%); }
          to { transform: translateX(100%); }
        }

        .timelineReached {
          border-color: #22c55e;
          color: #15803d;
          background: linear-gradient(180deg, #ffffff, #dcfce7);
        }

        .timelineReached .timelineNumber {
          background: #16a34a;
        }

        .timelineCurrent {
          transform: scale(1.08);
          box-shadow:
            0 0 0 4px rgba(34, 197, 94, .14),
            0 6px 13px rgba(15, 23, 42, .08);
        }

        .timelineConnectorReached .timelineConnectorTrack {
          background: #22c55e;
        }

        .timelineLabel {
          display: flex;
          width: 100%;
          min-height: 24px;
          align-items: center;
          justify-content: center;
          margin-top: 6px;
          padding: 3px 4px;
          border-radius: 999px;
          color: #9ca3af;
          background: #f3f4f6;
          font-size: 9px;
          font-weight: 800;
          line-height: 1.2;
          text-align: center;
          white-space: nowrap;
        }

        .timelineLabelReached {
          color: #166534;
          background: #dcfce7;
        }

        .timelineGroup:nth-child(1) .timelineLabelReached {
          color: #475569;
          background: #e2e8f0;
        }

        .timelineGroup:nth-child(2) .timelineLabelReached {
          color: #6d28d9;
          background: #ede9fe;
        }

        .timelineGroup:nth-child(3) .timelineLabelReached {
          color: #1d4ed8;
          background: #dbeafe;
        }

        .timelineGroup:nth-child(4) .timelineLabelReached {
          color: #15803d;
          background: #dcfce7;
        }

        .editProjectButton {
          min-height: 34px;
          padding: 6px 11px;
          border: 1px solid #bbf7d0;
          border-radius: 9px;
          color: #166534;
          background: #ecfdf5;
          font: inherit;
          font-size: 10px;
          font-weight: 900;
        }

        .editProjectButton:hover {
          color: #ffffff;
          border-color: #16a34a;
          background: #16a34a;
        }

        .activityList { display: grid; gap: 8px; }

        .activityItem {
          display: grid;
          grid-template-columns:
            28px
            minmax(220px, 1.35fr)
            minmax(120px, .8fr)
            minmax(140px, .9fr)
            repeat(4, minmax(95px, .58fr))
            auto;
          gap: 10px;
          align-items: center;
          padding: 11px 12px;
          border: 1px solid #e5e7eb;
          border-radius: 11px;
          background: #fff;
          font-family: "Sarabun", "Noto Sans Thai", "Leelawadee UI", Tahoma, Arial, sans-serif;
          font-size: 13px;
          line-height: 1.38;
        }

        .activityNumber {
          display: grid;
          width: 25px;
          height: 25px;
          place-items: center;
          border-radius: 7px;
          color: #166534;
          background: #dcfce7;
          font-size: 11px;
          font-weight: 900;
        }

        .activityTitle,
        .activityMetric {
          min-width: 0;
        }

        .activityTitle b,
        .activityTitle small,
        .activityMetric span,
        .activityMetric b {
          display: block;
          font-family: inherit;
        }

        .activityTitle b {
          color: #1f2937;
          font-size: 14px;
          font-weight: 700;
          line-height: 1.4;
          white-space: normal;
          overflow-wrap: anywhere;
        }

        .activityTitle small,
        .activityMetric span {
          margin-top: 3px;
          color: #64748b;
          font-size: 11px;
          line-height: 1.35;
        }

        .activityMetric b {
          margin-top: 4px;
          color: #0369a1;
          font-size: 13px;
          font-weight: 600;
          line-height: 1.4;
          white-space: normal;
          overflow-wrap: anywhere;
        }

        .activityUsageMetric b {
          color: #15803d;
          font-size: 14px;
          font-weight: 900;
        }

        .activityProgressTrack {
          display: block;
          width: 100%;
          height: 6px;
          overflow: hidden;
          margin-top: 6px;
          border-radius: 999px;
          background: #e2e8f0;
        }

        .activityProgressFill {
          display: block;
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, #22c55e, #16a34a);
        }

        .activityProgressHigh {
          background: linear-gradient(90deg, #f59e0b, #ea580c);
        }

        .activityProgressOver {
          background: linear-gradient(90deg, #ef4444, #b91c1c);
        }

        .projectDetailFallback { display: grid; gap: 8px; }

        .projectDetailNotice {
          padding: 8px 12px;
          border: 1px dashed #bbf7d0;
          border-radius: 9px;
          color: #166534;
          background: #f0fdf4;
          font-size: 11px;
          font-weight: 700;
          text-align: center;
        }

        .projectDetailItem {
          border-color: #bbf7d0;
          background: linear-gradient(180deg, #ffffff, #f8fff9);
        }

        .projectDetailItem .activityNumber {
          color: #ffffff;
          background: #16a34a;
        }

        .emptyActivities, .emptyState { padding: 24px; color: #9ca3af; text-align: center; }

        .editorBackdrop {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: grid;
          place-items: center;
          padding: 20px;
          background: rgba(15, 23, 42, .58);
          backdrop-filter: blur(4px);
        }

        .projectEditor {
          display: grid;
          grid-template-rows: auto minmax(0, 1fr) auto;
          width: min(1040px, 100%);
          max-height: calc(100vh - 40px);
          overflow: hidden;
          border: 1px solid #dbe3ef;
          border-radius: 18px;
          background: #f8fafc;
          box-shadow: 0 24px 70px rgba(15, 23, 42, .28);
          font-family: "Sarabun", "Noto Sans Thai", "Leelawadee UI", Tahoma, Arial, sans-serif;
        }

        .editorHeader {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 18px 20px;
          border-bottom: 1px solid #dbe3ef;
          background: #ffffff;
        }

        .editorHeader h2 { margin: 0; color: #0f172a; font-size: 22px; }
        .editorHeader p, .sectionHeading p { margin: 4px 0 0; color: #64748b; font-size: 12px; }

        .editorClose {
          display: grid;
          width: 36px;
          height: 36px;
          place-items: center;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          color: #475569;
          background: #ffffff;
          font-size: 23px;
          cursor: pointer;
        }

        .editorBody {
          display: grid;
          gap: 14px;
          overflow-y: auto;
          padding: 16px 20px 24px;
        }

        .editorSection {
          display: grid;
          gap: 12px;
          padding: 16px;
          border: 1px solid #dbe3ef;
          border-radius: 14px;
          background: #ffffff;
        }

        .editorSectionTitle {
          padding-left: 10px;
          border-left: 4px solid #6366f1;
          color: #172554;
          font-size: 15px;
          font-weight: 800;
        }


        .paymentSourceNotice,
        .activityPaymentSourceNotice {
          margin: 2px 0 14px;
          padding: 10px 12px;
          border: 1px solid #ddd6fe;
          border-radius: 10px;
          background: #f5f3ff;
          color: #5b21b6;
          font-size: 0.86rem;
          line-height: 1.5;
        }

        .activityPaymentSourceNotice {
          margin-top: 8px;
          margin-bottom: 10px;
        }

        .editorGrid { display: grid; gap: 12px; }
        .twoColumns { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .threeColumns { grid-template-columns: repeat(3, minmax(0, 1fr)); }

        .projectEditor label {
          display: grid;
          gap: 6px;
          min-width: 0;
          color: #334155;
          font-size: 12px;
          font-weight: 700;
        }

        .projectEditor input,
        .projectEditor select {
          width: 100%;
          min-height: 42px;
          box-sizing: border-box;
          border: 1px solid #cbd5e1;
          border-radius: 9px;
          padding: 8px 10px;
          color: #0f172a;
          background: #ffffff;
          font: inherit;
          font-size: 14px;
          outline: none;
        }

        .projectEditor input:focus,
        .projectEditor select:focus {
          border-color: #6366f1;
          box-shadow: 0 0 0 3px rgba(99, 102, 241, .12);
        }

        .checkRow {
          display: flex !important;
          min-height: 42px;
          align-items: center;
          align-self: end;
          gap: 9px !important;
          padding: 8px 11px;
          border: 1px solid #cbd5e1;
          border-radius: 9px;
          background: #f8fafc;
        }

        .checkRow input,
        .clearLocalButton {
          min-height: 34px;
          padding: 7px 11px;
          border: 1px solid #fecaca;
          border-radius: 10px;
          color: #b91c1c;
          background: #fff;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
        }

        .clearLocalButton:hover {
          background: #fef2f2;
        }

        .clearLocalButton:disabled {
          cursor: wait;
          opacity: 0.65;
        }

        .sourceStatusGroup {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 3px;
        }

        .lastLoadedAt {
          color: #64748b;
          font-size: 10px;
          font-weight: 700;
          white-space: nowrap;
        }

        .dataSourceBadge {
          display: inline-flex;
          align-items: center;
          min-height: 34px;
          padding: 6px 11px;
          border-radius: 999px;
          border: 1px solid;
          font-size: 12px;
          font-weight: 800;
          white-space: nowrap;
        }

        .gasSource {
          color: #166534;
          background: #f0fdf4;
          border-color: #bbf7d0;
        }

        .localSource {
          color: #9a3412;
          background: #fff7ed;
          border-color: #fed7aa;
        }

        .attachmentDeleteSummary {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-top: 10px;
          padding: 9px 11px;
          border: 1px solid #fecaca;
          border-radius: 10px;
          color: #991b1b;
          background: #fef2f2;
          font-size: 12px;
          font-weight: 800;
        }

        .attachmentDeleteSummary button {
          flex: 0 0 auto;
          border: 1px solid #fca5a5;
          border-radius: 8px;
          padding: 5px 8px;
          color: #991b1b;
          background: #ffffff;
          font: inherit;
          font-size: 11px;
          cursor: pointer;
        }

        .existingAttachmentList,
        .pendingFileList {
          display: grid;
          gap: 7px;
          margin-top: 10px;
        }

        .attachmentManageRow {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 8px 10px;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          background: #ffffff;
          font-size: 12px;
        }

        .attachmentManageRow a,
        .attachmentManageRow span {
          min-width: 0;
          overflow: hidden;
          color: #334155;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .pendingFileSize {
          display: block;
          margin-top: 2px;
          color: #94a3b8;
          font-size: 10px;
          font-weight: 700;
        }

        .attachmentManageRow button {
          flex: 0 0 auto;
          border: 1px solid #fecaca;
          border-radius: 8px;
          padding: 5px 8px;
          color: #b91c1c;
          background: #fff;
          font: inherit;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
        }

        .attachmentMarkedForRemoval {
          border-color: #fecaca;
          background: #fef2f2;
          opacity: .72;
        }

        .attachmentMarkedForRemoval a {
          text-decoration: line-through;
        }

        .sourceOption input {
          width: 16px;
          min-height: auto;
          height: 16px;
          padding: 0;
        }

        .sectionHeading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
        }

        .fileSection {
          border-color: #bbf7d0;
          background: linear-gradient(180deg, #ffffff, #f7fff9);
        }

        .filePicker,
        .addActivityButton {
          display: inline-flex !important;
          min-height: 38px;
          align-items: center;
          justify-content: center;
          padding: 0 13px;
          border: 1px solid #cbd5e1;
          border-radius: 9px;
          color: #334155;
          background: #ffffff;
          font-size: 12px !important;
          font-weight: 800 !important;
          cursor: pointer;
        }

        .filePicker input { display: none; }

        .dropZone {
          display: grid;
          min-height: 92px;
          place-items: center;
          align-content: center;
          gap: 6px;
          border: 1px dashed #86efac;
          border-radius: 11px;
          color: #15803d;
          background: #fbfffc;
          text-align: center;
        }

        .dropZone span { color: #64748b; font-size: 11px; }

        .budgetSourceOptions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .budgetSourceQuickActions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
        }

        .budgetSourceButton,
        .addBudgetSourceButton {
          min-height: 38px;
          border: 1px solid #d1d5db;
          border-radius: 11px;
          background: #ffffff;
          color: #344054;
          font-weight: 800;
          cursor: pointer;
          transition:
            border-color 0.15s ease,
            background 0.15s ease,
            color 0.15s ease,
            transform 0.15s ease;
        }

        .budgetSourceButton {
          padding: 8px 14px;
        }

        .budgetSourceButton:hover,
        .addBudgetSourceButton:hover {
          transform: translateY(-1px);
          border-color: #8b5cf6;
        }

        .budgetSourceButton.selected {
          border-color: #7c3aed;
          background: #f5f3ff;
          color: #5b21b6;
        }

        .addBudgetSourceButton {
          width: 38px;
          padding: 0;
          border-style: dashed;
          border-color: #7c3aed;
          color: #6d28d9;
          font-size: 23px;
          line-height: 1;
        }

        .customBudgetSourceRow {
          display: grid;
          grid-template-columns: minmax(220px, 1fr) auto auto;
          gap: 8px;
          align-items: center;
          margin-top: 10px;
        }

        .customBudgetSourceRow button {
          min-height: 38px;
          padding: 0 13px;
          border: 0;
          border-radius: 9px;
          color: #ffffff;
          background: #7c3aed;
          font-weight: 800;
          cursor: pointer;
        }

        .customBudgetSourceRow button:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }

        .customBudgetSourceRow .cancelCustomSourceButton {
          color: #475467;
          background: #f2f4f7;
        }

        .customBudgetSourceList {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
          margin-top: 10px;
        }

        .customBudgetSourceChip {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          min-height: 32px;
          padding: 5px 7px 5px 11px;
          border: 1px solid #c4b5fd;
          border-radius: 999px;
          color: #5b21b6;
          background: #f5f3ff;
          font-size: 13px;
          font-weight: 800;
        }

        .customBudgetSourceChip button {
          display: grid;
          width: 21px;
          height: 21px;
          padding: 0;
          place-items: center;
          border: 0;
          border-radius: 50%;
          color: #7c3aed;
          background: #ede9fe;
          font-size: 16px;
          line-height: 1;
          cursor: pointer;
        }

        @media (max-width: 560px) {
          .customBudgetSourceRow {
            grid-template-columns: 1fr 1fr;
          }

          .customBudgetSourceRow input {
            grid-column: 1 / -1;
          }
        }

        .selectedBudgetSourcesField {
          color: #166534 !important;
          border-color: #86efac !important;
          background: #f0fdf4 !important;
          font-weight: 800 !important;
          cursor: default;
        }

        .fieldHelp {
          display: block;
          margin-top: 5px;
          color: #64748b;
          font-size: 11px;
          line-height: 1.4;
        }


        .sourceOption {
          display: inline-flex !important;
          min-height: 36px;
          align-items: center;
          gap: 7px !important;
          padding: 7px 10px;
          border: 1px solid #cbd5e1;
          border-radius: 9px;
          background: #ffffff;
          cursor: pointer;
        }

        .activityEditorList { display: grid; gap: 12px; }

        .activityEditorCard {
          display: grid;
          gap: 11px;
          padding: 14px;
          border: 1px solid #cbd5e1;
          border-radius: 12px;
          background: #f8fafc;
        }

        .activityEditorHeader {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .activityEditorHeader strong { color: #1e3a8a; font-size: 14px; }

        .activityEditorHeader button {
          border: 1px solid #fecaca;
          border-radius: 8px;
          padding: 6px 10px;
          color: #b91c1c;
          background: #fff1f2;
          font: inherit;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
        }

        .addActivityButton {
          border-color: #bbf7d0;
          color: #166534;
          background: #f0fdf4;
        }

        .budgetWarningBox {
          margin-top: 10px;
          padding: 9px 12px;
          border: 1px solid #fbbf24;
          border-radius: 10px;
          color: #92400e;
          background: #fffbeb;
          font-size: 12px;
          font-weight: 700;
          line-height: 1.45;
        }

        .budgetWarningDanger {
          border-color: #fca5a5;
          color: #991b1b;
          background: #fef2f2;
        }

        .budgetWarningText {
          display: block;
          margin-top: 5px;
          color: #dc2626;
          font-size: 11px;
          font-weight: 800;
        }

        .editorBudgetOverview {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 9px;
          margin-bottom: 12px;
        }

        .editorBudgetOverview > div {
          padding: 11px 12px;
          border: 1px solid #dbeafe;
          border-radius: 11px;
          background: linear-gradient(180deg, #ffffff, #f8fafc);
        }

        .editorBudgetOverview span,
        .editorBudgetOverview b {
          display: block;
        }

        .editorBudgetOverview span {
          color: #64748b;
          font-size: 10px;
          font-weight: 700;
        }

        .editorBudgetOverview b {
          margin-top: 5px;
          color: #166534;
          font-size: 13px;
          font-weight: 900;
        }

        .editorBudgetOverview .budgetOverviewDanger {
          border-color: #fecaca;
          background: #fff1f2;
        }

        .editorBudgetOverview .budgetOverviewDanger b {
          color: #b91c1c;
        }

        .fieldHint {
          display: block;
          margin-top: 5px;
          color: #15803d;
          font-size: 10px;
          font-weight: 700;
        }

        .editorEmpty {
          padding: 24px;
          border: 1px dashed #cbd5e1;
          border-radius: 10px;
          color: #64748b;
          background: #f8fafc;
          text-align: center;
          font-size: 13px;
        }

        .editorFooter {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 14px 20px;
          border-top: 1px solid #dbe3ef;
          background: #ffffff;
        }

        .editorFooter > div { display: flex; gap: 9px; }
        .editorMessage { color: #15803d; font-size: 12px; font-weight: 700; }

        .cancelEditorButton,
        .saveEditorButton {
          min-height: 40px;
          border-radius: 9px;
          padding: 0 16px;
          font: inherit;
          font-size: 13px;
          font-weight: 800;
          cursor: pointer;
        }

        .cancelEditorButton { border: 1px solid #cbd5e1; color: #475569; background: #ffffff; }
        .saveEditorButton { border: 1px solid #4f46e5; color: #ffffff; background: linear-gradient(135deg, #6366f1, #4f46e5); }
        .saveEditorButton:disabled { cursor: wait; opacity: 0.65; }

        @media (max-width: 1180px) {
          .dataCard {
            --project-grid:
              28px
              minmax(330px, 2.35fr)
              minmax(96px, .58fr)
              minmax(142px, .84fr)
              minmax(74px, .44fr)
              minmax(74px, .44fr)
              minmax(74px, .44fr)
              minmax(78px, .46fr)
              minmax(68px, .4fr)
              48px;
          }
        }

        @media (max-width: 980px) {
          .summaryGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .filterCard { grid-template-columns: 1fr 1fr; }

          .dataCard {
            --project-grid:
              28px
              minmax(240px, 1.6fr)
              minmax(180px, 1.15fr)
              minmax(100px, .62fr)
              minmax(82px, .52fr)
              54px;
          }

          .ownerCell, .amountCell:nth-of-type(5), .amountCell:nth-of-type(6), .statusCell {
            display: none;
          }

          .columnHeader > div:nth-child(3),
          .columnHeader > div:nth-child(6),
          .columnHeader > div:nth-child(7),
          .columnHeader > div:nth-child(8) {
            display: none;
          }

          .activityPanel { padding-left: 14px; }

          .activityItem {
            grid-template-columns: 28px minmax(180px, 1fr) minmax(100px, .45fr) auto;
          }

          .activityMetric:nth-of-type(4),
          .activityMetric:nth-of-type(5) {
            display: none;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .timelineConnectorFlow {
            animation: none !important;
          }

          .timelineStage {
            transition: none;
          }
        }

        @media (max-width: 860px) {
          .activityItem {
            grid-template-columns:
              28px
              minmax(180px, 1.35fr)
              minmax(110px, .8fr)
              minmax(130px, .9fr)
              repeat(3, minmax(95px, .65fr))
              auto;
            overflow-x: auto;
          }

          .editorBackdrop { padding: 10px; }
          .projectEditor { max-height: calc(100vh - 20px); }
          .twoColumns, .threeColumns { grid-template-columns: 1fr; }
        }

        @media (max-width: 680px) {
          .pageTop { align-items: stretch; flex-direction: column; }
          .readOnlyBadge { align-self: flex-start; }
          .summaryGrid, .filterCard { grid-template-columns: 1fr; }

          .dataCard {
            --project-grid: 24px minmax(0, 1fr) auto auto;
          }

          .columnHeader,
          .projectRow {
            align-items: start;
          }

          .columnHeader > div:nth-child(3),
          .columnHeader > div:nth-child(4),
          .columnHeader > div:nth-child(5),
          .columnHeader > div:nth-child(6),
          .columnHeader > div:nth-child(7),
          .columnHeader > div:nth-child(8) {
            display: none;
          }

          .columnHeader {
            padding-top: 8px;
            padding-bottom: 8px;
          }

          .leadCell, .amountCell, .statusCell {
            display: none;
          }

          .fileCell { padding-top: 1px; }

          .projectMain {
            grid-template-columns: 14px 26px minmax(0, 1fr);
          }

          .activityPanelHeader {
            grid-template-columns: 1fr;
            align-items: stretch;
          }

          .workflowTimeline {
            justify-content: flex-start;
            overflow-x: auto;
            padding: 6px;
          }

          .timelineNode {
            width: 64px;
            flex-basis: 64px;
          }

          .timelineStage {
            width: 36px;
            height: 36px;
          }

          .timelineNumber {
            width: 15px;
            height: 15px;
            font-size: 7px;
          }

          .timelineIcon {
            font-size: 16px;
          }

          .timelineConnector {
            width: 26px;
            flex-basis: 26px;
            height: 3px;
            margin-top: 16px;
          }

          .timelineLabel {
            min-height: 22px;
            font-size: 8px;
            white-space: normal;
          }

          .editProjectButton {
            width: 100%;
          }

          .activityItem {
            grid-template-columns: 26px minmax(0, 1fr);
          }

          .activityMetric,
          .activityItem > .statusBadge {
            grid-column: 2;
          }
        }
        @media (max-width: 1100px) {
          .editorBudgetOverview {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        .statusStack { display: grid; justify-items: center; gap: 4px; }
        .budgetStatusBadge, .inlineBudgetStatus { display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; font-weight: 800; white-space: nowrap; }
        .budgetStatusBadge { min-height: 22px; padding: 3px 7px; font-size: 9px; }
        .inlineBudgetStatus { padding: 4px 8px; font-size: 10px; }
        .budgetIdle { color: #64748b; background: #f1f5f9; }
        .budgetActive { color: #1d4ed8; background: #dbeafe; }
        .budgetComplete { color: #166534; background: #dcfce7; }
        .budgetOver { color: #991b1b; background: #fee2e2; }
        .workflowChoiceGroup {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 7px;
          margin-top: 7px;
        }

        .workflowChoiceButton {
          min-height: 40px;
          padding: 7px 10px;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          color: #475569;
          background: #ffffff;
          font: inherit;
          font-size: 12px;
          font-weight: 800;
          line-height: 1.25;
          cursor: pointer;
          transition:
            color .16s ease,
            border-color .16s ease,
            background .16s ease,
            box-shadow .16s ease,
            transform .16s ease;
        }

        .workflowChoiceButton:hover:not(:disabled) {
          border-color: #22c55e;
          color: #166534;
          background: #f0fdf4;
          transform: translateY(-1px);
        }

        .workflowChoiceButtonActive {
          border-color: #16a34a;
          color: #ffffff;
          background: linear-gradient(135deg, #22c55e, #15803d);
          box-shadow: 0 5px 12px rgba(22, 163, 74, .2);
        }

        .workflowChoiceButton:focus-visible {
          outline: 3px solid rgba(34, 197, 94, .22);
          outline-offset: 2px;
        }

        .workflowChoiceGroupLocked .workflowChoiceButton {
          cursor: default;
        }

        .workflowChoiceGroupLocked .workflowChoiceButton:not(.workflowChoiceButtonActive) {
          opacity: .52;
          background: #f8fafc;
        }

        .workflowChoiceButton:disabled {
          cursor: not-allowed;
        }

        .activityWorkflowChoiceGroup .workflowChoiceButton {
          min-height: 38px;
          padding-inline: 7px;
          font-size: 11px;
        }

        .memberLoadMessage, .automaticStatusNote { display: block; margin-top: 5px; color: #b45309; font-size: 11px; font-weight: 700; }

        .statusCell {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          min-width: 0;
        }

        .startProjectButton {
          width: 27px;
          height: 27px;
          flex: 0 0 27px;
          display: inline-grid;
          place-items: center;
          padding: 0;
          border: 0;
          border-radius: 50%;
          color: #fff;
          background: #16a34a;
          box-shadow: 0 3px 8px rgba(22, 163, 74, 0.24);
          font-size: 11px;
          line-height: 1;
          cursor: pointer;
        }

        .startProjectButton:hover {
          background: #15803d;
        }

        .startProjectButton:disabled {
          cursor: wait;
          opacity: 0.65;
        }

        .actionSuccess {
          position: fixed;
          top: 18px;
          left: 50%;
          z-index: 1200;
          transform: translateX(-50%);
          padding: 9px 14px;
          border: 1px solid #86efac;
          border-radius: 10px;
          color: #166534;
          background: #f0fdf4;
          box-shadow: 0 10px 28px rgba(22, 101, 52, 0.18);
          font-size: 13px;
          font-weight: 800;
        }

        .editorWorkflowStepper {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          align-items: start;
          min-height: 58px;
          padding: 8px 7px 6px;
          border: 1px solid #d8dee8;
          border-radius: 10px;
          background: #f8fafc;
          pointer-events: none;
          user-select: none;
        }

        .editorWorkflowStep {
          position: relative;
          display: grid;
          justify-items: center;
          gap: 4px;
          min-width: 0;
          color: #98a2b3;
          text-align: center;
        }

        .editorWorkflowStep:not(:last-child)::after {
          content: "";
          position: absolute;
          top: 12px;
          left: calc(50% + 15px);
          right: calc(-50% + 15px);
          height: 2px;
          border-radius: 999px;
          background: #d8dee8;
        }

        .editorWorkflowCircle {
          position: relative;
          z-index: 1;
          width: 25px;
          height: 25px;
          display: grid;
          place-items: center;
          border: 2px solid #cbd5e1;
          border-radius: 50%;
          color: #64748b;
          background: #fff;
          font-size: 10px;
          font-weight: 900;
          line-height: 1;
        }

        .editorWorkflowLabel {
          max-width: 100%;
          color: inherit;
          font-size: 9px;
          font-weight: 700;
          line-height: 1.2;
          white-space: nowrap;
        }

        .editorWorkflowStepComplete {
          color: #15803d;
        }

        .editorWorkflowStepComplete .editorWorkflowCircle {
          border-color: #22c55e;
          color: #fff;
          background: #22c55e;
        }

        .editorWorkflowStepComplete:not(:last-child)::after {
          background: #86efac;
        }

        .editorWorkflowStepCurrent {
          color: #6d28d9;
        }

        .editorWorkflowStepCurrent .editorWorkflowCircle {
          border-color: #7c3aed;
          color: #fff;
          background: #7c3aed;
          box-shadow: 0 0 0 3px #ede9fe;
        }

        @media (max-width: 640px) {
          .editorWorkflowStepper {
            padding-inline: 4px;
          }

          .editorWorkflowCircle {
            width: 23px;
            height: 23px;
          }

          .editorWorkflowStep:not(:last-child)::after {
            top: 11px;
            left: calc(50% + 14px);
            right: calc(-50% + 14px);
          }

          .editorWorkflowLabel {
            font-size: 8px;
          }
        }

        .projectCodeBuilder {
          display: grid;
          grid-template-columns:
            minmax(160px, 1.2fr)
            minmax(120px, 0.8fr)
            minmax(120px, 0.8fr)
            minmax(170px, 1.1fr);
          gap: 10px;
          align-items: end;
        }

        .projectCodePreview {
          color: #5b21b6 !important;
          background: #f5f3ff !important;
          font-weight: 900 !important;
          letter-spacing: 0.04em;
        }

        @media (max-width: 900px) {
          .projectCodeBuilder {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 560px) {
          .projectCodeBuilder {
            grid-template-columns: 1fr;
          }
        }

      `}</style>
    </div>
  );
}



