import type { BudgetProjectListItem } from "./types";

export function effectiveProjectBudget(project: BudgetProjectListItem) {
  if (project.activities.length > 0) {
    return project.activities.reduce(
      (sum, activity) => sum + (Number(activity.budget) || 0),
      0,
    );
  }
  return Number(project.budget) || 0;
}

export function effectiveProjectSpent(project: BudgetProjectListItem) {
  if (project.activities.length > 0) {
    return project.activities.reduce(
      (sum, activity) => sum + (Number(activity.spent) || 0),
      0,
    );
  }
  return Number(project.spent) || 0;
}

export function effectiveProjectRemaining(project: BudgetProjectListItem) {
  return effectiveProjectBudget(project) - effectiveProjectSpent(project);
}
