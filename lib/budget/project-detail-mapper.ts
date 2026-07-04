import { mapBudgetProject } from "./project-mapper";
import type { BudgetProjectListItem } from "./types";

export type BudgetProjectDetailItem = BudgetProjectListItem & {
  objective: string;
  targetGroup: string;
  budgetSource: string;
  startDate: string;
  attachments: Array<{
    id: string;
    name: string;
    url: string;
    mimeType: string;
  }>;
};

type Row = Record<string, unknown>;

function text(value: unknown, fallback = "") {
  const result = String(value ?? "").trim();
  return result || fallback;
}

function parseAttachments(value: unknown) {
  if (Array.isArray(value)) return value;

  if (!value) return [];

  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function mapBudgetProjectDetail(
  value: unknown
): BudgetProjectDetailItem {
  const row: Row =
    value && typeof value === "object" ? (value as Row) : {};

  const base = mapBudgetProject(row);

  const attachments = parseAttachments(
    row.AttachmentsJSON ?? row.Attachments
  )
    .map((item) => {
      if (!item || typeof item !== "object") return null;

      const file = item as Row;

      return {
        id: text(file.id ?? file.fileId),
        name: text(file.name ?? file.fileName, "ไฟล์แนบ"),
        url: text(file.url ?? file.webViewLink),
        mimeType: text(file.mimeType),
      };
    })
    .filter(
      (
        item
      ): item is {
        id: string;
        name: string;
        url: string;
        mimeType: string;
      } => Boolean(item?.url)
    );

  return {
    ...base,
    objective: text(
      row.Objective ?? row.Objectives ?? row.Description,
      "-"
    ),
    targetGroup: text(row.TargetGroup, "-"),
    budgetSource: text(row.BudgetSource, "-"),
    startDate: text(row.StartDate, "-"),
    attachments,
  };
}
