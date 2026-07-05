import { mapBudgetProject } from "./project-mapper";
import type { BudgetProjectListItem } from "./types";

export function sortBudgetProjects(
  projects: BudgetProjectListItem[],
): BudgetProjectListItem[] {
  return [...projects].sort((a, b) =>
    a.code.localeCompare(b.code, "th", {
      numeric: true,
      sensitivity: "base",
    }),
  );
}

export function mapAndSortBudgetProjects(
  projects: unknown[],
): BudgetProjectListItem[] {
  return sortBudgetProjects(projects.map(mapBudgetProject));
}
