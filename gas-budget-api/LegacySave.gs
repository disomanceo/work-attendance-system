function saveLegacyBudgetProject_(sourceProject, payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const spreadsheet = getBudgetSpreadsheet_();
    const projectSheet = spreadsheet.getSheetByName("Projects");
    const activitySheet = spreadsheet.getSheetByName("Activities");

    if (!projectSheet) throw new Error("ไม่พบชีต Projects");
    if (!activitySheet) throw new Error("ไม่พบชีต Activities");

    const project = payload.project || {};
    const projectId = legacyText_(project.id || sourceProject.id);

    if (!projectId) {
      throw new Error("ไม่พบรหัสโครงการ");
    }

    const attachments = updateBudgetAttachments_(
      projectId,
      Array.isArray(project.attachments) ? project.attachments : [],
      Array.isArray(payload.removedAttachmentIds)
        ? payload.removedAttachmentIds
        : [],
      Array.isArray(payload.newAttachments)
        ? payload.newAttachments
        : []
    );

    const now = new Date().toISOString();

    upsertLegacyObjectById_(projectSheet, projectId, {
      ID: projectId,
      ProjectName: legacyText_(project.name),
      FiscalYear: legacyText_(project.fiscalYear),
      Department: legacyText_(project.planName),
      OwnerName: legacyText_(project.owner),
      Status: legacyText_(project.status) || "ยังไม่เริ่ม",
      BudgetSource: getLegacyBudgetSourceText_(project),
      ApprovedBudget: legacyNumber_(project.budgetAmount),
      SpentBudget: legacyNumber_(project.actualAmount),
      StartDate: legacyDate_(project.startDate),
      EndDate: legacyDate_(project.endDate),
      UpdatedAt: now,
      UseActivities:
        Array.isArray(payload.activities) && payload.activities.length > 0,
      AttachmentsJSON: JSON.stringify(attachments),
    });

    replaceLegacyActivities_(
      activitySheet,
      projectId,
      Array.isArray(payload.activities) ? payload.activities : [],
      now
    );

    return Object.assign({}, sourceProject, {
      id: projectId,
      fiscalYear: legacyText_(project.fiscalYear),
      name: legacyText_(project.name),
      owner: legacyText_(project.planName),
      lead: legacyText_(project.owner),
      status: legacyText_(project.status) || "ยังไม่เริ่ม",
      budget: legacyNumber_(project.budgetAmount),
      spent: legacyNumber_(project.actualAmount),
      startDate: legacyDate_(project.startDate),
      endDate: legacyDate_(project.endDate),
      budgetSources: Array.isArray(project.fundingSources)
        ? project.fundingSources
        : [],
      customBudgetSource: legacyText_(project.customFundingSource),
      attachments: attachments,
      activities: (payload.activities || []).map(function (activity) {
        return {
          id: legacyText_(activity.id),
          name: legacyText_(activity.name),
          lead: legacyText_(activity.owner),
          status: legacyText_(activity.status) || "ยังไม่เริ่ม",
          budgetSource: legacyText_(activity.fundingSource),
          budget: legacyNumber_(activity.budgetAmount),
          spent: legacyNumber_(activity.actualAmount),
          startDate: legacyDate_(activity.startDate),
          endDate: legacyDate_(activity.endDate),
        };
      }),
    });
  } finally {
    lock.releaseLock();
  }
}

function getLegacyBudgetSourceText_(project) {
  const sources = Array.isArray(project.fundingSources)
    ? project.fundingSources
        .map(function (value) {
          return legacyText_(value);
        })
        .filter(Boolean)
    : [];

  const custom = legacyText_(project.customFundingSource);

  if (custom && sources.indexOf(custom) === -1) {
    sources.push(custom);
  }

  return sources.join(", ");
}

function getLegacyHeaders_(sheet) {
  const lastColumn = sheet.getLastColumn();

  if (lastColumn < 1) {
    throw new Error("ชีต " + sheet.getName() + " ไม่มีหัวคอลัมน์");
  }

  return sheet
    .getRange(1, 1, 1, lastColumn)
    .getDisplayValues()[0]
    .map(function (value) {
      return String(value || "").trim();
    });
}

function findLegacyRowById_(sheet, id, idColumnIndex) {
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) return 0;

  const values = sheet
    .getRange(2, idColumnIndex + 1, lastRow - 1, 1)
    .getDisplayValues();

  for (let index = 0; index < values.length; index += 1) {
    if (String(values[index][0] || "").trim() === String(id).trim()) {
      return index + 2;
    }
  }

  return 0;
}

function upsertLegacyObjectById_(sheet, id, updates) {
  const headers = getLegacyHeaders_(sheet);
  const idColumnIndex = headers.indexOf("ID");

  if (idColumnIndex < 0) {
    throw new Error("ชีต " + sheet.getName() + " ไม่มีคอลัมน์ ID");
  }

  let targetRow = findLegacyRowById_(sheet, id, idColumnIndex);
  let row;

  if (targetRow > 0) {
    row = sheet
      .getRange(targetRow, 1, 1, headers.length)
      .getValues()[0];
  } else {
    targetRow = sheet.getLastRow() + 1;
    row = new Array(headers.length).fill("");

    const createdAtIndex = headers.indexOf("CreatedAt");
    if (createdAtIndex >= 0) {
      row[createdAtIndex] = new Date().toISOString();
    }
  }

  Object.keys(updates).forEach(function (header) {
    const columnIndex = headers.indexOf(header);

    if (columnIndex >= 0) {
      row[columnIndex] = updates[header];
    }
  });

  sheet
    .getRange(targetRow, 1, 1, headers.length)
    .setValues([row]);
}

function replaceLegacyActivities_(sheet, projectId, activities, now) {
  const headers = getLegacyHeaders_(sheet);
  const projectIdColumn = headers.indexOf("ProjectID");

  if (projectIdColumn < 0) {
    throw new Error("ชีต Activities ไม่มีคอลัมน์ ProjectID");
  }

  const lastRow = sheet.getLastRow();

  if (lastRow >= 2) {
    const projectIds = sheet
      .getRange(2, projectIdColumn + 1, lastRow - 1, 1)
      .getDisplayValues();

    for (let index = projectIds.length - 1; index >= 0; index -= 1) {
      if (
        String(projectIds[index][0] || "").trim() ===
        String(projectId).trim()
      ) {
        sheet.deleteRow(index + 2);
      }
    }
  }

  if (!activities.length) return;

  const rows = activities.map(function (activity, index) {
    const row = new Array(headers.length).fill("");

    const values = {
      ID:
        legacyText_(activity.id) ||
        "A-" + Date.now() + "-" + (index + 1),
      ProjectID: projectId,
      ActivityName: legacyText_(activity.name),
      OwnerName: legacyText_(activity.owner),
      Status: legacyText_(activity.status) || "ยังไม่เริ่ม",
      BudgetSource: legacyText_(activity.fundingSource),
      ApprovedBudget: legacyNumber_(activity.budgetAmount),
      SpentBudget: legacyNumber_(activity.actualAmount),
      StartDate: legacyDate_(activity.startDate),
      EndDate: legacyDate_(activity.endDate),
      CreatedAt: now,
      UpdatedAt: now,
    };

    Object.keys(values).forEach(function (header) {
      const columnIndex = headers.indexOf(header);

      if (columnIndex >= 0) {
        row[columnIndex] = values[header];
      }
    });

    return row;
  });

  sheet
    .getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length)
    .setValues(rows);
}
