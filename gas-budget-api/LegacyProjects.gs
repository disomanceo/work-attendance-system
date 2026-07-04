function getLegacyBudgetProjects_() {
  const spreadsheet = getBudgetSpreadsheet_();
  const projectSheet = spreadsheet.getSheetByName("Projects");
  const activitySheet = spreadsheet.getSheetByName("Activities");

  if (!projectSheet) {
    throw new Error("ไม่พบชีต Projects");
  }

  const projects = readLegacySheetObjects_(projectSheet);
  const activities = activitySheet
    ? readLegacySheetObjects_(activitySheet)
    : [];

  const activitiesByProject = {};

  activities.forEach(function (row) {
    const projectId = legacyText_(row.ProjectID);

    if (!projectId) return;

    if (!activitiesByProject[projectId]) {
      activitiesByProject[projectId] = [];
    }

    activitiesByProject[projectId].push({
      ID: legacyText_(row.ID),
      ProjectID: projectId,
      ActivityName: legacyText_(row.ActivityName),
      OwnerName: legacyText_(row.OwnerName),
      Status: legacyText_(row.Status) || "ยังไม่เริ่ม",
      BudgetSource: legacyText_(row.BudgetSource),
      ApprovedBudget: legacyNumber_(row.ApprovedBudget),
      SpentBudget: legacyNumber_(row.SpentBudget),
      StartDate: legacyDate_(row.StartDate),
      EndDate: legacyDate_(row.EndDate),
      Objectives: legacyText_(row.Objectives),
      QuantityTarget: legacyText_(row.QuantityTarget),
      QualityTarget: legacyText_(row.QualityTarget),
      ResultSummary: legacyText_(row.ResultSummary),
      Problems: legacyText_(row.Problems),
    });
  });

  return projects
    .map(function (row) {
      const projectId = legacyText_(row.ID);

      if (!projectId) return null;

      const projectActivities = activitiesByProject[projectId] || [];
      const attachments = legacyJsonArray_(row.AttachmentsJSON);
      const budgetSources = legacyBudgetSources_(row.BudgetSource);

      return {
        ID: projectId,
        ProjectName: legacyText_(row.ProjectName),
        FiscalYear: legacyText_(row.FiscalYear),
        Department: legacyText_(row.Department),
        OwnerName: legacyText_(row.OwnerName),
        Status: legacyText_(row.Status) || "ยังไม่เริ่ม",
        BudgetSource: legacyText_(row.BudgetSource),
        BudgetSources: budgetSources,
        ApprovedBudget: legacyNumber_(row.ApprovedBudget),
        SpentBudget: legacyNumber_(row.SpentBudget),
        StartDate: legacyDate_(row.StartDate),
        EndDate: legacyDate_(row.EndDate),
        Objectives: legacyText_(row.Objectives),
        QuantityTarget: legacyText_(row.QuantityTarget),
        QualityTarget: legacyText_(row.QualityTarget),
        ResultSummary: legacyText_(row.ResultSummary),
        Problems: legacyText_(row.Problems),
        UseActivities:
          legacyBoolean_(row.UseActivities) ||
          projectActivities.length > 0,
        ActivitiesList: projectActivities,
        AttachmentsJSON: attachments,
        Attachments: attachments,
      };
    })
    .filter(function (project) {
      return Boolean(project);
    });
}

function readLegacySheetObjects_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();

  if (lastRow < 2 || lastColumn < 1) return [];

  const values = sheet
    .getRange(1, 1, lastRow, lastColumn)
    .getValues();

  const headers = values[0].map(function (value) {
    return String(value || "").trim();
  });

  return values.slice(1).map(function (row) {
    const result = {};

    headers.forEach(function (header, index) {
      if (!header) return;
      result[header] = row[index];
    });

    return result;
  });
}

function legacyText_(value) {
  return value === null || value === undefined
    ? ""
    : String(value).trim();
}

function legacyNumber_(value) {
  if (value === null || value === undefined || value === "") return 0;

  const normalized = String(value).replace(/,/g, "").trim();
  const numberValue = Number(normalized);

  return Number.isFinite(numberValue) ? numberValue : 0;
}

function legacyDate_(value) {
  if (!value) return "";

  if (
    Object.prototype.toString.call(value) === "[object Date]" &&
    !Number.isNaN(value.getTime())
  ) {
    return Utilities.formatDate(
      value,
      BUDGET_CONFIG.timezone || "Asia/Bangkok",
      "yyyy-MM-dd"
    );
  }

  const text = String(value).trim();

  if (!text) return "";

  const dateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (dateOnly) return text;

  const parsed = new Date(text);

  if (Number.isNaN(parsed.getTime())) return text;

  return Utilities.formatDate(
    parsed,
    BUDGET_CONFIG.timezone || "Asia/Bangkok",
    "yyyy-MM-dd"
  );
}

function legacyBoolean_(value) {
  if (value === true) return true;

  const text = String(value || "")
    .trim()
    .toLowerCase();

  return ["true", "1", "yes", "y"].indexOf(text) >= 0;
}

function legacyJsonArray_(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];

  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function legacyBudgetSources_(value) {
  if (Array.isArray(value)) {
    return value
      .map(function (item) {
        return legacyText_(item);
      })
      .filter(Boolean);
  }

  const text = legacyText_(value);

  if (!text) return [];

  try {
    const parsed = JSON.parse(text);

    if (Array.isArray(parsed)) {
      return parsed
        .map(function (item) {
          return legacyText_(item);
        })
        .filter(Boolean);
    }
  } catch (error) {
    // ใช้ข้อความเดี่ยวเป็นแหล่งงบประมาณหนึ่งรายการ
  }

  return [text];
}
