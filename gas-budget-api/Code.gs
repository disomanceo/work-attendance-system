function doGet(e) {
  try {
    verifyBudgetSecret_(e && e.parameter ? e.parameter.secret : "");

    const projects = getLegacyBudgetProjects_();

    return jsonOutput_({
      ok: true,
      projects: projects,
    });
  } catch (error) {
    return jsonOutput_({
      ok: false,
      message: getErrorMessage_(error),
    });
  }
}

function doPost(e) {
  try {
    const body = parseJsonBody_(e);
    verifyBudgetSecret_(body.secret);

    if (body.action === "uploadBudgetProjectAttachments") {
      const projectId = normalizeText_(body.projectId);
      const attachments = Array.isArray(body.attachments)
        ? body.attachments
        : [];

      if (!projectId) {
        throw new Error("ไม่พบ project id สำหรับอัปโหลดไฟล์");
      }

      const uploadedFiles = uploadBudgetProjectAttachments_(
        projectId,
        attachments
      );

      return jsonOutput_({
        ok: true,
        files: uploadedFiles,
        message: "อัปโหลดไฟล์แนบโครงการสำเร็จ",
      });
    }

    if (body.action === "uploadBudgetPaymentAttachments") {
      const projectId = normalizeText_(body.projectId);
      const paymentId = normalizeText_(body.paymentId);
      const attachments = Array.isArray(body.attachments)
        ? body.attachments
        : [];

      if (!projectId || !paymentId) {
        throw new Error("ไม่พบ project id หรือ payment id สำหรับอัปโหลดหลักฐาน");
      }

      const uploadedFiles = uploadBudgetPaymentAttachments_(
        projectId,
        paymentId,
        attachments
      );

      return jsonOutput_({
        ok: true,
        files: uploadedFiles,
        message: "อัปโหลดหลักฐานการเบิกจ่ายสำเร็จ",
      });
    }

    if (body.action === "trashBudgetFiles") {
      const fileIds = Array.isArray(body.fileIds) ? body.fileIds : [];
      const trashedFileIds = trashBudgetFiles_(fileIds);

      return jsonOutput_({
        ok: true,
        trashedFileIds: trashedFileIds,
        message: "ย้ายไฟล์ไปถังขยะแล้ว",
      });
    }

    if (body.action !== "saveBudgetProject") {
      throw new Error("ไม่รองรับ action นี้");
    }

    const sourceProject = body.project;
    const payload = body.payload;

    if (!sourceProject || !sourceProject.id) {
      throw new Error("ไม่พบข้อมูลโครงการหรือ project id");
    }

    if (!payload || !payload.project) {
      throw new Error("ไม่พบ payload ของโครงการ");
    }

    const savedProject = saveLegacyBudgetProject_(sourceProject, payload);

    return jsonOutput_({
      ok: true,
      project: savedProject,
      diagnostics: {
        startDate: savedProject.startDate || "",
        endDate: savedProject.endDate || "",
        attachmentCount: Array.isArray(savedProject.attachments)
          ? savedProject.attachments.length
          : 0,
        attachmentFolderId: BUDGET_CONFIG.attachmentFolderId || "",
      },
      message: "บันทึกข้อมูลโครงการสำเร็จ",
    });
  } catch (error) {
    return jsonOutput_({
      ok: false,
      message: getErrorMessage_(error),
    });
  }
}

function setupBudgetSheets() {
  ensureBudgetSheets_();

  return {
    ok: true,
    spreadsheetId: getBudgetSpreadsheet_().getId(),
    projectSheetName: BUDGET_CONFIG.projectSheetName,
    activitySheetName: BUDGET_CONFIG.activitySheetName,
  };
}

function ensureBudgetSheets_() {
  const spreadsheet = getBudgetSpreadsheet_();

  ensureSheet_(
    spreadsheet,
    BUDGET_CONFIG.projectSheetName,
    [
      "project_id",
      "fiscal_year",
      "project_name",
      "plan_name",
      "owner",
      "status",
      "budget_amount",
      "actual_amount",
      "start_date",
      "end_date",
      "funding_sources_json",
      "custom_funding_source",
      "project_json",
      "created_at",
      "updated_at",
    ]
  );

  ensureSheet_(
    spreadsheet,
    BUDGET_CONFIG.activitySheetName,
    [
      "activity_id",
      "project_id",
      "activity_name",
      "owner",
      "status",
      "funding_source",
      "budget_amount",
      "actual_amount",
      "start_date",
      "end_date",
      "activity_json",
      "created_at",
      "updated_at",
    ]
  );
}

function saveBudgetProject_(sourceProject, payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const spreadsheet = getBudgetSpreadsheet_();
    const projectSheet = spreadsheet.getSheetByName(
      BUDGET_CONFIG.projectSheetName
    );
    const activitySheet = spreadsheet.getSheetByName(
      BUDGET_CONFIG.activitySheetName
    );

    const now = new Date();
    const project = payload.project;
    const projectId = String(project.id || sourceProject.id).trim();

    if (!projectId) {
      throw new Error("project_id ว่าง");
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

    const savedSourceProject = Object.assign({}, sourceProject, {
      startDate: normalizeDateText_(project.startDate),
      endDate: normalizeDateText_(project.endDate),
      attachments: attachments,
    });

    upsertRowById_(
      projectSheet,
      projectId,
      [
        projectId,
        normalizeText_(project.fiscalYear),
        normalizeText_(project.name),
        normalizeText_(project.planName),
        normalizeText_(project.owner),
        normalizeText_(project.status),
        normalizeNumber_(project.budgetAmount),
        normalizeNumber_(project.actualAmount),
        normalizeDateText_(project.startDate),
        normalizeDateText_(project.endDate),
        JSON.stringify(
          Array.isArray(project.fundingSources)
            ? project.fundingSources
            : []
        ),
        normalizeText_(project.customFundingSource),
        JSON.stringify(savedSourceProject),
        now,
        now,
      ]
    );

    deleteRowsByProjectId_(activitySheet, projectId);

    const activities = Array.isArray(payload.activities)
      ? payload.activities
      : [];

    if (activities.length > 0) {
      const rows = activities.map(function (activity) {
        const sourceActivity = findSourceActivity_(
          sourceProject.activities,
          activity.id
        );

        return [
          normalizeText_(activity.id),
          projectId,
          normalizeText_(activity.name),
          normalizeText_(activity.owner),
          normalizeText_(activity.status),
          normalizeText_(activity.fundingSource),
          normalizeNumber_(activity.budgetAmount),
          normalizeNumber_(activity.actualAmount),
          normalizeDateText_(activity.startDate),
          normalizeDateText_(activity.endDate),
          JSON.stringify(sourceActivity || activity),
          now,
          now,
        ];
      });

      activitySheet
        .getRange(
          activitySheet.getLastRow() + 1,
          1,
          rows.length,
          rows[0].length
        )
        .setValues(rows);
    }

    return savedSourceProject;
  } finally {
    lock.releaseLock();
  }
}


function updateBudgetAttachments_(
  projectId,
  existingAttachments,
  removedAttachmentIds,
  newAttachments
) {
  const removedIds = removedAttachmentIds.map(function (value) {
    return String(value || "").trim();
  });

  const keptAttachments = existingAttachments.filter(function (attachment) {
    const attachmentId = String(
      attachment && attachment.id ? attachment.id : ""
    ).trim();

    return attachmentId && removedIds.indexOf(attachmentId) === -1;
  });

  removedIds.forEach(function (fileId) {
    if (!fileId) return;

    try {
      DriveApp.getFileById(fileId).setTrashed(true);
    } catch (error) {
      // Continue saving the project even if an old Drive file was already removed.
    }
  });

  if (!newAttachments.length) return keptAttachments;

  const folder = getBudgetAttachmentFolder_();
  const projectFolder = getOrCreateChildFolder_(folder, projectId);

  const uploaded = newAttachments.map(function (attachment) {
    const name = normalizeText_(attachment.name) || "budget-attachment";
    const mimeType =
      normalizeText_(attachment.mimeType) || "application/octet-stream";
    const base64 = normalizeText_(attachment.base64);

    if (!base64) {
      throw new Error("ไฟล์ " + name + " ไม่มีข้อมูล");
    }

    const bytes = Utilities.base64Decode(base64);
    const blob = Utilities.newBlob(bytes, mimeType, name);
    const file = projectFolder.createFile(blob);

    return {
      id: file.getId(),
      name: file.getName(),
      url: file.getUrl(),
      mimeType: file.getMimeType(),
    };
  });

  return keptAttachments.concat(uploaded);
}


function uploadBudgetProjectAttachments_(projectId, attachments) {
  if (!attachments.length) return [];

  const folder = getBudgetAttachmentFolder_();
  const projectFolder = getOrCreateChildFolder_(folder, projectId);

  return attachments.map(function (attachment) {
    const name = normalizeText_(attachment.name) || "budget-attachment";
    const mimeType =
      normalizeText_(attachment.mimeType) || "application/octet-stream";
    const base64 = normalizeText_(attachment.base64);

    if (!base64) {
      throw new Error("ไฟล์ " + name + " ไม่มีข้อมูล");
    }

    const bytes = Utilities.base64Decode(base64);
    const blob = Utilities.newBlob(bytes, mimeType, name);
    const file = projectFolder.createFile(blob);

    return {
      fileId: file.getId(),
      fileName: file.getName(),
      fileUrl: file.getUrl(),
      mimeType: file.getMimeType(),
      fileSize: file.getSize(),
    };
  });
}

function uploadBudgetPaymentAttachments_(
  projectId,
  paymentId,
  attachments
) {
  if (!attachments.length) return [];

  const rootFolder = getBudgetAttachmentFolder_();
  const paymentsFolder = getOrCreateChildFolder_(rootFolder, "payments");
  const projectFolder = getOrCreateChildFolder_(paymentsFolder, projectId);
  const paymentFolder = getOrCreateChildFolder_(projectFolder, paymentId);

  return attachments.map(function (attachment) {
    const name = normalizeText_(attachment.name) || "payment-evidence";
    const mimeType =
      normalizeText_(attachment.mimeType) || "application/octet-stream";
    const base64 = normalizeText_(attachment.base64);

    if (!base64) {
      throw new Error("ไฟล์ " + name + " ไม่มีข้อมูล");
    }

    const bytes = Utilities.base64Decode(base64);
    const blob = Utilities.newBlob(bytes, mimeType, name);
    const file = paymentFolder.createFile(blob);

    return {
      fileId: file.getId(),
      fileName: file.getName(),
      fileUrl: file.getUrl(),
      mimeType: file.getMimeType(),
      fileSize: file.getSize(),
    };
  });
}


function trashBudgetFiles_(fileIds) {
  const trashed = [];

  fileIds.forEach(function (value) {
    const fileId = normalizeText_(value);
    if (!fileId) return;

    try {
      DriveApp.getFileById(fileId).setTrashed(true);
      trashed.push(fileId);
    } catch (error) {
      // Cleanup is best effort. The caller can inspect returned IDs.
    }
  });

  return trashed;
}

function getBudgetAttachmentFolder_() {
  if (BUDGET_CONFIG.attachmentFolderId) {
    return DriveApp.getFolderById(BUDGET_CONFIG.attachmentFolderId);
  }

  const folderName = "PM Money Budget Attachments";
  const folders = DriveApp.getFoldersByName(folderName);
  const folder = folders.hasNext()
    ? folders.next()
    : DriveApp.createFolder(folderName);

  PropertiesService.getScriptProperties().setProperty(
    "BUDGET_ATTACHMENT_FOLDER_ID",
    folder.getId()
  );

  return folder;
}

function getOrCreateChildFolder_(parentFolder, folderName) {
  const normalizedName = normalizeText_(folderName) || "unknown-project";
  const folders = parentFolder.getFoldersByName(normalizedName);

  return folders.hasNext()
    ? folders.next()
    : parentFolder.createFolder(normalizedName);
}

function getBudgetProjects_() {
  ensureBudgetSheets_();

  const spreadsheet = getBudgetSpreadsheet_();
  const projectSheet = spreadsheet.getSheetByName(
    BUDGET_CONFIG.projectSheetName
  );
  const activitySheet = spreadsheet.getSheetByName(
    BUDGET_CONFIG.activitySheetName
  );

  const projects = readDataRows_(projectSheet)
    .map(function (row) {
      return parseJsonSafely_(row[12]);
    })
    .filter(function (project) {
      return project && project.id;
    });

  const activitiesByProject = {};

  readDataRows_(activitySheet).forEach(function (row) {
    const projectId = normalizeText_(row[1]);
    const activity = parseJsonSafely_(row[10]);

    if (!projectId || !activity) return;

    if (!activitiesByProject[projectId]) {
      activitiesByProject[projectId] = [];
    }

    activitiesByProject[projectId].push(activity);
  });

  return projects.map(function (project) {
    project.activities = activitiesByProject[project.id] || [];
    return project;
  });
}

function getBudgetSpreadsheet_() {
  if (!BUDGET_CONFIG.spreadsheetId) {
    throw new Error(
      "ยังไม่ได้ตั้ง Script Property: BUDGET_SPREADSHEET_ID"
    );
  }

  return SpreadsheetApp.openById(BUDGET_CONFIG.spreadsheetId);
}

function verifyBudgetSecret_(providedSecret) {
  const expectedSecret = BUDGET_CONFIG.apiSecret;

  if (!expectedSecret) {
    throw new Error("ยังไม่ได้ตั้ง Script Property: BUDGET_API_SECRET");
  }

  if (String(providedSecret || "") !== expectedSecret) {
    throw new Error("Budget API secret ไม่ถูกต้อง");
  }
}

function ensureSheet_(spreadsheet, sheetName, headers) {
  let sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet
      .getRange(1, 1, 1, headers.length)
      .setFontWeight("bold")
      .setBackground("#ede9fe");
  }

  return sheet;
}

function upsertRowById_(sheet, id, rowValues) {
  const lastRow = sheet.getLastRow();
  let targetRow = 0;

  if (lastRow >= 2) {
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();

    for (let index = 0; index < ids.length; index += 1) {
      if (String(ids[index][0]).trim() === id) {
        targetRow = index + 2;
        break;
      }
    }
  }

  if (targetRow > 0) {
    const existingCreatedAt = sheet.getRange(targetRow, 14).getValue();
    rowValues[13] = existingCreatedAt || rowValues[13];

    sheet
      .getRange(targetRow, 1, 1, rowValues.length)
      .setValues([rowValues]);
    return;
  }

  sheet
    .getRange(sheet.getLastRow() + 1, 1, 1, rowValues.length)
    .setValues([rowValues]);
}

function deleteRowsByProjectId_(sheet, projectId) {
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) return;

  const projectIds = sheet
    .getRange(2, 2, lastRow - 1, 1)
    .getDisplayValues();

  for (let index = projectIds.length - 1; index >= 0; index -= 1) {
    if (String(projectIds[index][0]).trim() === projectId) {
      sheet.deleteRow(index + 2);
    }
  }
}

function readDataRows_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();

  if (lastRow < 2 || lastColumn < 1) return [];

  return sheet
    .getRange(2, 1, lastRow - 1, lastColumn)
    .getValues();
}

function findSourceActivity_(activities, activityId) {
  if (!Array.isArray(activities)) return null;

  return (
    activities.find(function (activity) {
      return String(activity && activity.id) === String(activityId);
    }) || null
  );
}

function parseJsonBody_(e) {
  const raw =
    e && e.postData && typeof e.postData.contents === "string"
      ? e.postData.contents
      : "";

  if (!raw) {
    throw new Error("ไม่พบ request body");
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error("request body ไม่ใช่ JSON ที่ถูกต้อง");
  }
}

function parseJsonSafely_(value) {
  if (!value) return null;

  try {
    return JSON.parse(String(value));
  } catch (error) {
    return null;
  }
}

function normalizeText_(value) {
  return value === null || value === undefined
    ? ""
    : String(value).trim();
}

function normalizeNumber_(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function normalizeDateText_(value) {
  if (!value) return "";
  return String(value).trim();
}

function jsonOutput_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function getErrorMessage_(error) {
  return error && error.message
    ? String(error.message)
    : String(error || "เกิดข้อผิดพลาด");
}


function getBudgetApiStatus() {
  const status = {
    ok: false,
    spreadsheetConfigured: Boolean(BUDGET_CONFIG.spreadsheetId),
    secretConfigured: Boolean(BUDGET_CONFIG.apiSecret),
    spreadsheetAccessible: false,
    spreadsheetId: BUDGET_CONFIG.spreadsheetId || "",
    spreadsheetName: "",
    projectSheetExists: false,
    activitySheetExists: false,
    projectCount: 0,
    activityCount: 0,
    message: "",
  };

  try {
    if (!status.spreadsheetConfigured) {
      throw new Error(
        "ยังไม่ได้ตั้ง Script Property: BUDGET_SPREADSHEET_ID"
      );
    }

    if (!status.secretConfigured) {
      throw new Error(
        "ยังไม่ได้ตั้ง Script Property: BUDGET_API_SECRET"
      );
    }

    const spreadsheet = getBudgetSpreadsheet_();
    status.spreadsheetAccessible = true;
    status.spreadsheetName = spreadsheet.getName();

    const projectSheet = spreadsheet.getSheetByName(
      BUDGET_CONFIG.projectSheetName
    );
    const activitySheet = spreadsheet.getSheetByName(
      BUDGET_CONFIG.activitySheetName
    );

    status.projectSheetExists = Boolean(projectSheet);
    status.activitySheetExists = Boolean(activitySheet);

    if (projectSheet) {
      status.projectCount = Math.max(projectSheet.getLastRow() - 1, 0);
    }

    if (activitySheet) {
      status.activityCount = Math.max(activitySheet.getLastRow() - 1, 0);
    }

    status.ok =
      status.spreadsheetAccessible &&
      status.projectSheetExists &&
      status.activitySheetExists;

    status.message = status.ok
      ? "Budget API พร้อมใช้งาน"
      : "เชื่อม Spreadsheet ได้ แต่ยังสร้างชีตไม่ครบ";

    return status;
  } catch (error) {
    status.message = getErrorMessage_(error);
    return status;
  }
}

function initializeBudgetApi() {
  const result = setupBudgetSheets();
  const status = getBudgetApiStatus();

  return {
    ok: status.ok,
    setup: result,
    status: status,
  };
}


function testBudgetAttachmentFolder() {
  const folder = getBudgetAttachmentFolder_();

  return {
    ok: true,
    folderId: folder.getId(),
    folderName: folder.getName(),
    folderUrl: folder.getUrl(),
  };
}



