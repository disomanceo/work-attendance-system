const THAI_MONTHS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

const DEFAULT_DIRECTOR_NAME = "นายสุธน พุทธรัตน์";
const DEFAULT_SCHOOL_NAME = "โรงเรียนวัดไผ่มุ้ง";
const HEADER_DATE_START_COLUMN = 3;
const STUDENT_START_ROW = 9;
const TEMPLATE_STUDENT_ROWS = 12;
const SIGNATURE_LINE_ROW = 23;
const SIGNATURE_NAME_ROW = 25;
const TOTAL_COLUMN = 38;

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const expectedSecret = PropertiesService.getScriptProperties().getProperty("STUDENT_ATTENDANCE_REPORT_SECRET") || "";

    if (!expectedSecret || payload.secret !== expectedSecret) {
      return json_({ ok: false, message: "Invalid secret" }, 403);
    }

    if (payload.action !== "studentAttendanceMonthlyReport") {
      return json_({ ok: false, message: "Unknown action" }, 400);
    }

    const result = createStudentAttendanceMonthlyReport_(payload);
    return json_({ ok: true, ...result });
  } catch (error) {
    console.error(error);
    return json_({ ok: false, message: String(error && error.message ? error.message : error) }, 500);
  }
}

function setStudentAttendanceReportSecret(secret) {
  if (!secret) throw new Error("Missing secret");
  PropertiesService.getScriptProperties().setProperty("STUDENT_ATTENDANCE_REPORT_SECRET", String(secret));
  return "OK";
}

function createStudentAttendanceMonthlyReport_(payload) {
  const templateId = String(payload.templateId || "").trim();
  const folderId = String(payload.folderId || "").trim();

  if (!templateId) throw new Error("Missing templateId");
  if (!folderId) throw new Error("Missing folderId");

  const month = String(payload.month || "");
  const classLevel = String(payload.classLevel || "");
  const thaiMonth = formatThaiMonth_(month);
  const fileName = `แบบบันทึกการมาเรียน ${classLevel} ${thaiMonth}`;
  const folder = DriveApp.getFolderById(folderId);
  const copy = DriveApp.getFileById(templateId).makeCopy(fileName, folder);
  const ss = SpreadsheetApp.openById(copy.getId());
  const sheet = findSheet_(ss, Number(payload.templateSheetId)) || ss.getSheets()[0];

  fillHeader_(sheet, payload, thaiMonth);
  fillTable_(sheet, payload);
  fitSheet_(sheet);
  SpreadsheetApp.flush();

  const sheetUrl = ss.getUrl();
  let pdfUrl = "";

  if (String(payload.format || "") === "pdf") {
    const pdfBlob = exportSheetPdf_(ss.getId(), sheet.getSheetId(), `${fileName}.pdf`);
    const pdfFile = folder.createFile(pdfBlob);
    pdfUrl = pdfFile.getUrl();
  }

  return {
    fileName,
    sheetUrl,
    pdfUrl,
    spreadsheetId: ss.getId(),
  };
}

function exportSheetPdf_(spreadsheetId, sheetId, fileName) {
  const params = {
    format: "pdf",
    gid: sheetId,
    size: "A4",
    portrait: "false",
    fitw: "true",
    scale: "4",
    sheetnames: "false",
    printtitle: "false",
    pagenumbers: "false",
    gridlines: "false",
    fzr: "false",
    top_margin: "0.25",
    bottom_margin: "0.25",
    left_margin: "0.15",
    right_margin: "0.15",
  };
  const query = Object.keys(params)
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join("&");
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?${query}`;
  const response = UrlFetchApp.fetch(url, {
    headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` },
    muteHttpExceptions: true,
  });

  if (response.getResponseCode() >= 400) {
    throw new Error(`Export PDF failed: ${response.getContentText()}`);
  }

  return response.getBlob().setName(fileName);
}

function findSheet_(ss, sheetId) {
  if (!sheetId) return null;
  return ss.getSheets().find((sheet) => sheet.getSheetId() === sheetId) || null;
}

function fillHeader_(sheet, payload, thaiMonth) {
  const schoolName = String(payload.schoolName || DEFAULT_SCHOOL_NAME);
  const classLevel = String(payload.classLevel || "");
  const academicYear = String(payload.academicYear || "");
  const logoFileId = String(payload.logoFileId || "").trim();

  if (logoFileId) {
    sheet.setRowHeight(1, 48);
    insertDriveImage_(sheet, logoFileId, 19, 1, 42, 42);
  }

  sheet.getRange("A2:AL2").merge().setValue("แบบบันทึกการมาเรียนของนักเรียน");
  sheet.getRange("A3:AL3").merge().setValue(`ชั้น ${classLevel}    ปีการศึกษา ${academicYear}`);
  sheet.getRange("A4:AL4").merge().setValue(schoolName);
  sheet.getRange("A5:AL5").merge().setValue(`เดือน ${thaiMonth}`);

  sheet.getRange("A2:AL5")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setFontWeight("bold")
    .setFontSize(14);
}

function fillTable_(sheet, payload) {
  const days = Array.isArray(payload.days) ? payload.days : [];
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const extraRows = Math.max(0, rows.length - TEMPLATE_STUDENT_ROWS);

  if (extraRows > 0) {
    sheet.insertRowsBefore(STUDENT_START_ROW + TEMPLATE_STUDENT_ROWS, extraRows);
    const source = sheet.getRange(STUDENT_START_ROW + TEMPLATE_STUDENT_ROWS - 1, 1, 1, TOTAL_COLUMN);
    const target = sheet.getRange(STUDENT_START_ROW + TEMPLATE_STUDENT_ROWS, 1, extraRows, TOTAL_COLUMN);
    source.copyTo(target, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  }

  const rowCount = Math.max(TEMPLATE_STUDENT_ROWS, rows.length);
  const tableRange = sheet.getRange(STUDENT_START_ROW, 1, rowCount, TOTAL_COLUMN);
  tableRange.clearContent();

  const dateValues = Array.from({ length: 31 }, (_, index) => days.includes(index + 1) ? index + 1 : "");
  sheet.getRange("C7:AG7").merge().setValue("วันที่");
  sheet.getRange("AH7:AL7").merge().setValue("รวม (วัน)");
  sheet.getRange(8, HEADER_DATE_START_COLUMN, 1, 31).setValues([dateValues]);
  sheet.getRange("AH8:AL8").setValues([["มา", "ขาด", "ลา", "สาย", "รวม"]]);

  const values = Array.from({ length: rowCount }, (_, index) => {
    const row = rows[index] || {};
    const statuses = Array.isArray(row.statuses) ? row.statuses : [];
    const statusValues = Array.from({ length: 31 }, (_, statusIndex) => statuses[statusIndex] || "");
    return [
      row.no || "",
      row.name || "",
      ...statusValues,
      row.presentCount || "",
      row.absentCount || "",
      row.leaveCount || "",
      row.lateCount || "",
      row.totalCount || "",
    ];
  });

  tableRange.setValues(values);
  tableRange
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setFontSize(11);
  sheet.getRange(STUDENT_START_ROW, 2, rowCount, 1)
    .setHorizontalAlignment("left")
    .setFontSize(13)
    .setFontWeight("bold");
  styleStatusSymbols_(sheet, rowCount);

  fillSignatures_(sheet, payload, extraRows);
}

function fitSheet_(sheet) {
  sheet.setColumnWidth(1, 36);
  sheet.setColumnWidth(2, 170);
  for (let column = 3; column <= 33; column += 1) {
    sheet.setColumnWidth(column, 24);
  }
  for (let column = 34; column <= 38; column += 1) {
    sheet.setColumnWidth(column, 34);
  }
  sheet.getRange(7, 1, sheet.getMaxRows() - 6, TOTAL_COLUMN)
    .setWrap(false)
    .setVerticalAlignment("middle");
}

function fillSignatures_(sheet, payload, extraRows) {
  const signatureLineRow = SIGNATURE_LINE_ROW + extraRows;
  const signatureNameRow = SIGNATURE_NAME_ROW + extraRows;
  const adviserName = String(payload.adviserName || "").trim();
  const directorName = String(payload.directorName || DEFAULT_DIRECTOR_NAME).trim();
  const adviserSignatureFileId = String(payload.adviserSignatureFileId || "").trim();
  const directorSignatureFileId = String(payload.directorSignatureFileId || "").trim();

  sheet.getRange(signatureLineRow, 1, 3, TOTAL_COLUMN)
    .setFontSize(12)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");
  sheet.getRange(signatureLineRow, 3).setValue("ลงชื่อ........................................ครูประจำชั้น");
  sheet.getRange(signatureNameRow, 3).setValue(`(${adviserName || "........................................"})`);
  sheet.getRange(signatureLineRow, 23).setValue("ลงชื่อ........................................ผู้อำนวยการโรงเรียน");
  sheet.getRange(signatureNameRow, 23).setValue(`(${directorName})`);

  if (adviserSignatureFileId) {
    insertDriveImage_(sheet, adviserSignatureFileId, 9, signatureLineRow - 1, 150, 48);
  }
  if (directorSignatureFileId) {
    insertDriveImage_(sheet, directorSignatureFileId, 29, signatureLineRow - 1, 150, 48);
  }
}

function styleStatusSymbols_(sheet, rowCount) {
  const range = sheet.getRange(STUDENT_START_ROW, 3, rowCount, 31);
  const values = range.getValues();
  const colors = [];
  const backgrounds = [];

  values.forEach((row) => {
    colors.push(row.map((value) => value ? "#ffffff" : "#0b1736"));
    backgrounds.push(row.map((value) => {
      if (value === "✓") return "#16a34a";
      if (value === "×") return "#ef4444";
      if (value === "!") return "#f97316";
      if (value === "ส") return "#2563eb";
      return "#ffffff";
    }));
  });

  range
    .setFontWeight("bold")
    .setFontColors(colors)
    .setBackgrounds(backgrounds);
}

function insertDriveImage_(sheet, fileId, column, row, width, height) {
  try {
    const blob = DriveApp.getFileById(fileId).getBlob();
    const image = sheet.insertImage(blob, column, row);
    image.setWidth(width).setHeight(height);
  } catch (error) {
    console.error(`Insert image failed ${fileId}: ${error && error.message ? error.message : error}`);
  }
}

function formatThaiMonth_(month) {
  const parts = String(month || "").split("-");
  const year = Number(parts[0]);
  const monthNumber = Number(parts[1]);
  const thaiYear = year ? year + 543 : "";
  return `${THAI_MONTHS[(monthNumber || 1) - 1]} พ.ศ. ${thaiYear}`;
}

function json_(data, status) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
