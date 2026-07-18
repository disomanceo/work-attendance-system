const TRAINING_REPORT_ROOT_FOLDER_ID = PropertiesService.getScriptProperties()
  .getProperty("TRAINING_REPORT_ROOT_FOLDER_ID");
const TRAINING_REPORT_DRIVE_SECRET = PropertiesService.getScriptProperties()
  .getProperty("TRAINING_REPORT_DRIVE_SECRET");

function setupTrainingReportProperties(rootFolderId, secret) {
  const properties = PropertiesService.getScriptProperties();
  properties.setProperties({
    TRAINING_REPORT_ROOT_FOLDER_ID: String(rootFolderId || "").trim(),
    TRAINING_REPORT_DRIVE_SECRET: String(secret || "").trim(),
  }, true);

  return {
    ok: true,
    hasRootFolderId: Boolean(String(rootFolderId || "").trim()),
    hasSecret: Boolean(String(secret || "").trim()),
  };
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");

    if (!TRAINING_REPORT_DRIVE_SECRET || body.secret !== TRAINING_REPORT_DRIVE_SECRET) {
      return json_({ ok: false, message: "Unauthorized" });
    }

    if (body.action === "uploadTrainingReportFile") {
      return json_(uploadTrainingReportFile_(body));
    }

    if (body.action === "createTrainingReportPdf") {
      return json_(createTrainingReportPdf_(body));
    }

    if (body.action === "deleteTrainingReportFile") {
      return json_(deleteTrainingReportFile_(body));
    }

    return json_({ ok: false, message: "Unknown action" });
  } catch (error) {
    return json_({
      ok: false,
      message: error && error.message ? error.message : String(error),
    });
  }
}

function createTrainingReportPdf_(body) {
  const folder = getReportFolder_(body);
  const fileName = buildReportPdfFileName_(body);
  const doc = DocumentApp.create(fileName.replace(/\.pdf$/i, ""));
  const docFile = DriveApp.getFileById(doc.getId());
  const content = doc.getBody();

  content.appendParagraph("รายงานผลการประชุม/อบรม")
    .setHeading(DocumentApp.ParagraphHeading.HEADING1);
  appendPair_(content, "เลขหนังสือ", body.bookNumber);
  appendPair_(content, "เรื่อง", body.documentTitle);
  appendPair_(content, "ผู้รายงาน", body.teacherName);
  appendPair_(content, "ประเภท", body.trainingType);
  appendPair_(content, "วันที่", dateRange_(body.trainingStartDate, body.trainingEndDate));
  appendPair_(content, "จำนวนชั่วโมง", body.hours);
  appendPair_(content, "สถานที่", body.place);
  appendPair_(content, "ผู้จัด", body.organizer);
  appendSection_(content, "สรุปสาระสำคัญ", body.summary);
  appendSection_(content, "ประโยชน์ที่ได้รับ", body.benefits);
  appendSection_(content, "ข้อเสนอแนะ", body.suggestions);
  appendPhotoSlots_(content, body.photoSlots || []);

  doc.saveAndClose();
  docFile.moveTo(folder);

  const pdfBlob = docFile.getBlob().getAs("application/pdf").setName(fileName);
  const pdfFile = folder.createFile(pdfBlob);

  pdfFile.setDescription(
    JSON.stringify({
      reportId: body.reportId || "",
      bookNumber: body.bookNumber || "",
      teacherName: body.teacherName || "",
      generatedAt: new Date().toISOString(),
    })
  );
  docFile.setTrashed(true);

  return fileResponse_(pdfFile, folder);
}

function uploadTrainingReportFile_(body) {
  const teacherFolder = getReportFolder_(body);
  const fileName = buildFileName_(body);
  const blob = Utilities.newBlob(
    Utilities.base64Decode(String(body.base64 || "")),
    String(body.mimeType || "application/octet-stream"),
    fileName
  );
  const file = teacherFolder.createFile(blob);

  file.setDescription(
    JSON.stringify({
      reportId: body.reportId || "",
      bookNumber: body.bookNumber || "",
      teacherName: body.teacherName || "",
      slotIndex: body.slotIndex || "",
      slotKey: body.slotKey || "",
      slotLabel: body.slotLabel || "",
      uploadedAt: new Date().toISOString(),
    })
  );

  return fileResponse_(file, teacherFolder);
}

function deleteTrainingReportFile_(body) {
  const fileId = String(body.fileId || "").trim();
  if (!fileId) {
    throw new Error("Missing fileId");
  }

  DriveApp.getFileById(fileId).setTrashed(true);

  return {
    ok: true,
    fileId: fileId,
  };
}

function getReportFolder_(body) {
  const rootFolderId = String(body.rootFolderId || TRAINING_REPORT_ROOT_FOLDER_ID || "").trim();

  if (!rootFolderId) {
    throw new Error("Missing TRAINING_REPORT_ROOT_FOLDER_ID");
  }

  const root = DriveApp.getFolderById(rootFolderId);
  const yearFolder = getOrCreateFolder_(root, safeFolderName_(body.buddhistYear, "unknown-year"));
  const bookFolder = getOrCreateFolder_(yearFolder, safeFolderName_(body.bookNumber, "no-book-number"));

  return getOrCreateFolder_(bookFolder, safeFolderName_(body.teacherName, "teacher"));
}

function getOrCreateFolder_(parent, name) {
  const folders = parent.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : parent.createFolder(name);
}

function safeFolderName_(value, fallback) {
  const text = String(value || fallback)
    .replace(/[<>:"\/\\|?*\n\r]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

  return text || fallback;
}

function buildFileName_(body) {
  const original = safeFolderName_(body.originalName, "attachment");
  const dot = original.lastIndexOf(".");
  const extension = dot >= 0 ? original.slice(dot) : "";
  const base = dot >= 0 ? original.slice(0, dot) : original;
  const stamp = Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyyMMdd-HHmmss");

  return safeFolderName_(base, "attachment") + "-" + stamp + extension;
}

function buildReportPdfFileName_(body) {
  const stamp = Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyyMMdd-HHmmss");
  const safeNumber = safeFolderName_(body.bookNumber, "no-book-number");
  const safeTeacher = safeFolderName_(body.teacherName, "teacher");

  return "รายงานผลการประชุมอบรม-" + safeNumber + "-" + safeTeacher + "-" + stamp + ".pdf";
}

function appendPair_(content, label, value) {
  content.appendParagraph(String(label || "") + ": " + String(value || "-"));
}

function appendSection_(content, title, value) {
  content.appendParagraph(String(title || "")).setHeading(DocumentApp.ParagraphHeading.HEADING2);
  content.appendParagraph(String(value || "-"));
}

function appendPhotoSlots_(content, slots) {
  content.appendParagraph("รูปประกอบรายงาน").setHeading(DocumentApp.ParagraphHeading.HEADING2);

  const normalized = [1, 2, 3, 4].map(function(index) {
    const found = (slots || []).filter(function(slot) {
      return Number(slot.slotIndex || 0) === index;
    })[0];

    return found || {
      slotIndex: index,
      slotLabel: index <= 2 ? "รูปการอบรม" : index === 3 ? "รูปใบประกาศ" : "รูปใบลงทะเบียน",
      fileId: "",
    };
  });
  const table = content.appendTable();

  for (let rowIndex = 0; rowIndex < 2; rowIndex += 1) {
    const row = table.appendTableRow();

    for (let colIndex = 0; colIndex < 2; colIndex += 1) {
      const slot = normalized[rowIndex * 2 + colIndex];
      const cell = row.appendTableCell();
      cell.appendParagraph(String(slot.slotLabel || ""));

      if (slot.fileId) {
        try {
          const image = cell.appendImage(DriveApp.getFileById(String(slot.fileId)).getBlob());
          image.setWidth(220);
        } catch (error) {
          cell.appendParagraph("ไม่สามารถแสดงรูปนี้ได้");
        }
      } else {
        cell.appendParagraph("ไม่มีรูป");
      }

      cell.appendParagraph(String(slot.slotIndex || ""));
    }
  }
}

function dateRange_(start, end) {
  const first = String(start || "-");
  const last = String(end || "");

  return last && last !== first ? first + " ถึง " + last : first;
}

function fileResponse_(file, folder) {
  return {
    ok: true,
    fileId: file.getId(),
    fileUrl: file.getUrl(),
    fileName: file.getName(),
    mimeType: file.getMimeType(),
    fileSize: file.getSize(),
    folderId: folder.getId(),
    folderUrl: folder.getUrl(),
  };
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
