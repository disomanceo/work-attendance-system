import type {
  BudgetProjectAttachment,
  BudgetProjectListItem,
} from "@/lib/budget/types";

export type EditableActivity = {
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

export type EditableProject = {
  id: string;
  code: string;
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
  attachments: BudgetProjectAttachment[];
  activities: EditableActivity[];
};

export type BudgetProjectOverrides = Record<string, EditableProject>;

const STORAGE_KEY = "budget-project-editor-overrides-v1";

function canUseBrowserStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

export function readBudgetProjectOverrides(): BudgetProjectOverrides {
  if (!canUseBrowserStorage()) return {};

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return {};

    const parsed = JSON.parse(saved) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return parsed as BudgetProjectOverrides;
  } catch {
    return {};
  }
}

export function saveBudgetProjectOverride(
  project: EditableProject
): BudgetProjectOverrides {
  const overrides = readBudgetProjectOverrides();
  const nextOverrides = {
    ...overrides,
    [project.id]: project,
  };

  if (!canUseBrowserStorage()) return nextOverrides;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextOverrides));
  } catch {
    // Return the in-memory value even when browser storage is unavailable.
  }

  return nextOverrides;
}


export function countBudgetProjectOverrides(): number {
  return Object.keys(readBudgetProjectOverrides()).length;
}

export function clearBudgetProjectOverrides(): boolean {
  if (!canUseBrowserStorage()) return false;

  try {
    window.localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function applyBudgetProjectOverrides(
  projects: BudgetProjectListItem[],
  overrides: BudgetProjectOverrides
): BudgetProjectListItem[] {
  return projects.map((project) => {
    const override = overrides[project.id];
    if (!override) return project;

    return {
      ...project,
      code: override.code || project.code,
      name: override.name,
      owner: override.owner,
      lead: override.lead,
      status: override.status,
      budget: Number(override.budget) || 0,
      spent: Number(override.spent) || 0,
      due: override.endDate,
      attachments: Array.isArray(override.attachments)
        ? override.attachments
        : project.attachments,
      activities: override.useActivities
        ? override.activities.map((activity) => ({
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
          }))
        : [],
    };
  });
}
