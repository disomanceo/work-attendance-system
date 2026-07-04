import type {
  BudgetProjectActivity,
  BudgetProjectAttachment,
  BudgetProjectListItem,
} from "./types";

type Row = Record<string, unknown>;

function text(value: unknown, fallback = "") {
  const result = String(value ?? "").trim();
  return result || fallback;
}

function numberValue(value: unknown) {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function normalizeStatus(value: unknown) {
  const status = text(value, "ยังไม่เริ่ม");
  const map: Record<string, string> = {
    draft: "ยังไม่เริ่ม",
    pending: "ยังไม่เริ่ม",
    approved: "ดำเนินการ",
    active: "ดำเนินการ",
    done: "เสร็จสิ้น",
    not_started: "ยังไม่เริ่ม",
    cancelled: "ยกเลิก",
  };
  return map[status] || status;
}

function parseAttachments(value: unknown): BudgetProjectAttachment[] {
  let items: unknown[] = [];

  if (Array.isArray(value)) {
    items = value;
  } else if (value) {
    try {
      const parsed = JSON.parse(String(value));
      items = Array.isArray(parsed) ? parsed : [];
    } catch {
      items = [];
    }
  }

  return items
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
      ): item is BudgetProjectAttachment => Boolean(item?.url)
    );
}

function mapActivity(row: Row): BudgetProjectActivity {
  return {
    id: text(row.ID),
    projectId: text(row.ProjectID),
    name: text(row.ActivityName, "ยังไม่ระบุชื่อกิจกรรม"),
    lead: text(row.OwnerName, "-"),
    status: normalizeStatus(row.Status),
    budgetSource: text(row.BudgetSource),
    budget: numberValue(row.ApprovedBudget),
    spent: numberValue(row.SpentBudget),
    startDate: text(row.StartDate),
    endDate: text(row.EndDate),
  };
}

export function mapBudgetProject(value: unknown): BudgetProjectListItem {
  const row: Row =
    value && typeof value === "object" ? (value as Row) : {};

  const activities = Array.isArray(row.ActivitiesList)
    ? row.ActivitiesList.map((item) =>
        mapActivity(
          item && typeof item === "object" ? (item as Row) : {}
        )
      )
    : [];

  const useActivities =
    row.UseActivities === true ||
    row.UseActivities === "TRUE" ||
    activities.length > 0;

  const activitySpent = activities.reduce(
    (sum, item) => sum + item.spent,
    0
  );

  return {
    id: text(row.ID),
    name: text(row.ProjectName, "ยังไม่ระบุชื่อโครงการ"),
    owner: text(row.Department, "-"),
    lead: text(row.OwnerName, "-"),
    status: normalizeStatus(row.Status),
    budget: numberValue(row.ApprovedBudget),
    spent: useActivities
      ? activitySpent
      : numberValue(row.SpentBudget),
    due: text(row.EndDate, "-"),
    activities,
    attachments: parseAttachments(
      row.AttachmentsJSON ?? row.Attachments
    ),
  };
}
