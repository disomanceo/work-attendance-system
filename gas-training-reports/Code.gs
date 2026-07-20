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

    if (body.action === "downloadTrainingReportFile") {
      return json_(downloadTrainingReportFile_(body));
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
  content.setMarginTop(42);
  content.setMarginBottom(42);
  content.setMarginLeft(54);
  content.setMarginRight(54);

  content.appendParagraph("รายงานผลการประชุม/อบรม")
    .setHeading(DocumentApp.ParagraphHeading.HEADING1)
    .setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  appendInfoTable_(content, [
    ["เลขหนังสือ", body.bookNumber],
    ["เรื่อง", body.documentTitle],
    ["ผู้รายงาน", body.teacherName],
    ["ประเภท", body.trainingType],
    ["วันที่", dateRange_(body.trainingStartDate, body.trainingEndDate)],
    ["จำนวนชั่วโมง", body.hours ? String(body.hours) + " ชั่วโมง" : "-"],
    ["สถานที่", body.place],
    ["ผู้จัด", body.organizer],
  ]);
  appendSection_(content, "สรุปสาระสำคัญ", body.summary);
  appendSection_(content, "ประโยชน์ที่ได้รับ", body.benefits);
  appendSection_(content, "ข้อเสนอแนะ", body.suggestions);
  appendSignatureBlock_(content, body.teacherName, body.directorName);
  appendPhotoSlots_(content, body.photoSlots || []);

  doc.saveAndClose();
  docFile.moveTo(folder);

  const pdfBlob = docFile.getBlob().getAs("application/pdf").setName(fileName);
  trashExistingReportPdfs_(folder, body.reportId, fileName, body.existingPdfFileId);
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

function downloadTrainingReportFile_(body) {
  const fileId = String(body.fileId || "").trim();
  if (!fileId) {
    throw new Error("Missing fileId");
  }

  const file = DriveApp.getFileById(fileId);
  const blob = file.getBlob();

  return {
    ok: true,
    fileId: fileId,
    fileName: file.getName(),
    mimeType: blob.getContentType(),
    base64: Utilities.base64Encode(blob.getBytes()),
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
  const safeNumber = safeFolderName_(body.bookNumber, "no-book-number");
  const safeTeacher = safeFolderName_(body.teacherName, "teacher");

  return "รายงานผลการประชุมอบรม-" + safeNumber + "-" + safeTeacher + ".pdf";
}

function appendPair_(content, label, value) {
  content.appendParagraph(String(label || "") + ": " + String(value || "-"));
}

function appendInfoTable_(content, rows) {
  const table = content.appendTable();
  table.setBorderColor("#9ca3af");
  table.setBorderWidth(0.5);

  rows.forEach(function(rowData) {
    const row = table.appendTableRow();
    const labelCell = row.appendTableCell(String(rowData[0] || ""));
    const valueCell = row.appendTableCell(String(rowData[1] || "-"));
    labelCell.setWidth(92);
    valueCell.setWidth(360);
    labelCell.getChild(0).asParagraph().editAsText().setBold(true);
    valueCell.getChild(0).asParagraph().editAsText().setBold(false);
  });

  content.appendParagraph("");
}

function appendSection_(content, title, value) {
  content.appendParagraph(String(title || "")).setHeading(DocumentApp.ParagraphHeading.HEADING2);
  content.appendParagraph(String(value || "-"));
}

function appendPhotoSlots_(content, slots) {
  const photos = (slots || [])
    .filter(function(slot) {
      return slot && String(slot.fileId || "").trim();
    })
    .sort(function(left, right) {
      return Number(left.slotIndex || 0) - Number(right.slotIndex || 0);
    });

  if (photos.length === 0) return;

  content.appendPageBreak();
  content.appendParagraph("รูปประกอบรายงาน")
    .setHeading(DocumentApp.ParagraphHeading.HEADING1)
    .setAlignment(DocumentApp.HorizontalAlignment.CENTER);

  for (let index = 0; index < photos.length; index += 4) {
    if (index > 0) {
      content.appendPageBreak();
      content.appendParagraph("รูปประกอบรายงาน")
        .setHeading(DocumentApp.ParagraphHeading.HEADING1)
        .setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    }

    const pagePhotos = photos.slice(index, index + 4);
    const table = content.appendTable();
    table.setBorderColor("#9ca3af");
    table.setBorderWidth(0.5);

    for (let rowIndex = 0; rowIndex < Math.ceil(pagePhotos.length / 2); rowIndex += 1) {
      const row = table.appendTableRow();

      for (let colIndex = 0; colIndex < 2; colIndex += 1) {
        const slot = pagePhotos[rowIndex * 2 + colIndex];
        const cell = row.appendTableCell();
        cell.setWidth(225);
        if (!slot) {
          cell.clear();
          continue;
        }

        const imageParagraph = cell.appendParagraph("");
        imageParagraph.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
        try {
          const image = imageParagraph.appendInlineImage(
            DriveApp.getFileById(String(slot.fileId)).getBlob()
          );
          fitImage_(image, 210, 160);
        } catch (error) {
          imageParagraph.appendText("ไม่สามารถแสดงรูปนี้ได้");
        }

        const caption = cell.appendParagraph(
          "ภาพที่ " + String(index + rowIndex * 2 + colIndex + 1) + " " + String(slot.slotLabel || "รูปประกอบ")
        );
        caption.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
        caption.editAsText().setBold(false);
      }
    }
  }
}

function appendSignatureBlock_(content, teacherName, directorName) {
  content.appendParagraph("");
  content.appendParagraph("");

  const table = content.appendTable();
  table.setBorderWidth(0);
  const row = table.appendTableRow();
  const reporterCell = row.appendTableCell();
  const directorCell = row.appendTableCell();

  reporterCell.setWidth(225);
  directorCell.setWidth(225);
  appendSignatureCell_(reporterCell, "ผู้รายงาน", teacherName);
  appendSignatureCell_(directorCell, "ผู้อำนวยการโรงเรียน", directorName);
}

function appendSignatureCell_(cell, roleLabel, name) {
  cell.clear();
  const signLine = cell.appendParagraph("ลงชื่อ........................................" + roleLabel);
  signLine.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  signLine.editAsText().setBold(false);

  const nameLine = cell.appendParagraph("(" + String(name || "") + ")");
  nameLine.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  nameLine.editAsText().setBold(false);
}

function fitImage_(image, maxWidth, maxHeight) {
  const width = image.getWidth();
  const height = image.getHeight();

  if (!width || !height) {
    image.setWidth(maxWidth);
    return;
  }

  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  image.setWidth(Math.floor(width * scale));
  image.setHeight(Math.floor(height * scale));
}

function trashExistingReportPdfs_(folder, reportId, fileName, existingPdfFileId) {
  const explicitId = String(existingPdfFileId || "").trim();
  if (explicitId) {
    try {
      DriveApp.getFileById(explicitId).setTrashed(true);
    } catch (error) {
      // Continue with name/reportId cleanup below.
    }
  }

  const files = folder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    if (file.getMimeType() !== MimeType.PDF) continue;
    if (file.getName() === fileName || fileDescriptionMatchesReport_(file, reportId)) {
      file.setTrashed(true);
    }
  }
}

function fileDescriptionMatchesReport_(file, reportId) {
  const id = String(reportId || "").trim();
  if (!id) return false;

  try {
    const description = JSON.parse(file.getDescription() || "{}");
    return String(description.reportId || "") === id;
  } catch (error) {
    return false;
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
