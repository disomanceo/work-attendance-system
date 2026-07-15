const ATTENDANCE_REPORT_CONFIG = {
  VERSION: "2.1.1",
  // ใส่โฟลเดอร์หลัก, โฟลเดอร์ปี หรือโฟลเดอร์เดือนก็ได้
  START_FOLDER_ID: "1AMMUrclwyrnZnFUmQ5v3fsfUz9zWOHxl",
  SECRET_PROPERTY: "DAILY_PDF_SECRET",
  MAX_FOLDER_DEPTH: 4,
  // Google Docs ต้นฉบับรูปแบบราชการ
  DAILY_TEMPLATE_ID:
    "1pomYwEtxsBJ0u_UGXtndMDPJ15qriQ_2STVzVBk72t0",
  DAILY_DATA_ROWS: 12,
};

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
// PDF_THAI_WEEKDAY_DATE_FIX_V2
const THAI_DAYS = [
  "วันอาทิตย์",
  "วันจันทร์",
  "วันอังคาร",
  "วันพุธ",
  "วันพฤหัสบดี",
  "วันศุกร์",
  "วันเสาร์",
];

function doGet(e) {
  try {
    const action = String(e?.parameter?.action || "").trim();

    if (action === "health") {
      return jsonOutput_({
        ok: true,
        service: "attendance-report",
        version: ATTENDANCE_REPORT_CONFIG.VERSION,
        now: new Date().toISOString(),
      });
    }

    verifySecret_(e);

    if (action === "dailyPdf") {
      return handleDailyPdf_(e);
    }

    if (action === "deleteDailyPdf") {
      return handleDeleteDailyPdf_(e);
    }

    if (action === "monthlyPdf") {
      return handleMonthlyPdf_(e);
    }

    if (action === "weeklyPdf") {
      return handleWeeklyPdf_(e);
    }

    if (action === "buildMonthlyPdf") {
      return handleBuildMonthlyPdf_(e);
    }

    if (action === "buildWeeklyPdf") {
      return handleBuildWeeklyPdf_(e);
    }

    if (action === "monthStatus") {
      return handleMonthStatus_(e);
    }

    if (action === "closeMonth") {
      return handleCloseMonth_(e);
    }

    return jsonOutput_({
      ok: false,
      message: "ไม่พบ action ที่ร้องขอ",
    });
  } catch (error) {
    console.error(error);

    return jsonOutput_({
      ok: false,
      message: error?.message || "เกิดข้อผิดพลาดใน Google Apps Script",
    });
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse(
      String(e?.postData?.contents || "{}")
    );

    if (payload.action === "setupStudentAttendanceReportSecret") {
      verifySecretValue_(payload.dailySecret);
      return jsonOutput_(setupStudentAttendanceReportSecret_(payload.studentSecret));
    }

    if (payload.action === "studentAttendanceMonthlyReport") {
      verifyStudentAttendanceReportSecret_(payload.secret);
      return jsonOutput_(createStudentAttendanceMonthlyReport_(payload));
    }

    if (payload.action !== "buildDailyPdf" && payload.action !== "saveCombinedPdf") {
      return jsonOutput_({
        ok: false,
        message: "ไม่พบ action ที่ร้องขอ",
      });
    }

    verifySecretValue_(payload.secret);

    if (payload.action === "saveCombinedPdf") {
      return handleSaveCombinedPdf_(payload);
    }

    return handleBuildDailyPdf_(payload);
  } catch (error) {
    console.error(error);

    return jsonOutput_({
      ok: false,
      message:
        error?.message ||
        "เกิดข้อผิดพลาดระหว่างสร้าง PDF รายวัน",
    });
  }
}

const STUDENT_ATTENDANCE_REPORT_CONFIG = {
  SECRET_PROPERTY: "STUDENT_ATTENDANCE_REPORT_SECRET",
  DEFAULT_DIRECTOR_NAME: "นายสุธน พุทธรัตน์",
  DEFAULT_SCHOOL_NAME: "โรงเรียนวัดไผ่มุ้ง",
  HEADER_DATE_START_COLUMN: 3,
  STUDENT_START_ROW: 9,
  TEMPLATE_STUDENT_ROWS: 12,
  SIGNATURE_LINE_ROW: 23,
  SIGNATURE_NAME_ROW: 25,
  TOTAL_COLUMN: 38,
};

function verifyStudentAttendanceReportSecret_(secret) {
  const saved = PropertiesService
    .getScriptProperties()
    .getProperty(STUDENT_ATTENDANCE_REPORT_CONFIG.SECRET_PROPERTY);

  if (!saved) {
    throw new Error("ยังไม่ได้ตั้งค่า STUDENT_ATTENDANCE_REPORT_SECRET");
  }

  if (String(secret || "").trim() !== saved) {
    throw new Error("STUDENT_ATTENDANCE_REPORT_SECRET ไม่ถูกต้อง");
  }
}

function authorizeStudentAttendanceSpreadsheetScope() {
  SpreadsheetApp.openById("1PzumW4--bM2HJyA-PEoYaFeGpBFPm3YkzpxaMCOSHlo").getName();
  return "OK";
}

function setupStudentAttendanceReportSecret_(secret) {
  const trimmed = String(secret || "").trim();

  if (!trimmed) {
    throw new Error("Missing STUDENT_ATTENDANCE_REPORT_SECRET");
  }

  PropertiesService
    .getScriptProperties()
    .setProperty(
      STUDENT_ATTENDANCE_REPORT_CONFIG.SECRET_PROPERTY,
      trimmed
    );

  return {
    ok: true,
    message: "ตั้งค่า STUDENT_ATTENDANCE_REPORT_SECRET เรียบร้อยแล้ว",
  };
}

function createStudentAttendanceMonthlyReport_(payload) {
  const templateId = String(payload.templateId || "").trim();
  const folderId = String(payload.folderId || "").trim();

  if (!templateId) throw new Error("Missing templateId");
  if (!folderId) throw new Error("Missing folderId");

  const month = String(payload.month || "");
  const classLevel = String(payload.classLevel || "");
  const thaiMonth = formatStudentAttendanceThaiMonth_(month);
  const fileName = `แบบบันทึกการมาเรียน ${classLevel} ${thaiMonth}`;
  const folder = DriveApp.getFolderById(folderId);
  const copy = DriveApp.getFileById(templateId).makeCopy(fileName, folder);
  const ss = SpreadsheetApp.openById(copy.getId());
  const sheet = findStudentAttendanceSheet_(ss, Number(payload.templateSheetId)) || ss.getSheets()[0];

  fillStudentAttendanceHeader_(sheet, payload, thaiMonth);
  fillStudentAttendanceTable_(sheet, payload);
  fitStudentAttendanceSheet_(sheet);
  SpreadsheetApp.flush();

  const sheetUrl = ss.getUrl();
  let pdfUrl = "";

  if (String(payload.format || "") === "pdf") {
    const pdfBlob = exportStudentAttendanceSheetPdf_(ss.getId(), sheet.getSheetId(), `${fileName}.pdf`);
    const pdfFile = folder.createFile(pdfBlob);
    pdfUrl = pdfFile.getUrl();
  }

  return {
    ok: true,
    fileName,
    sheetUrl,
    pdfUrl,
    spreadsheetId: ss.getId(),
  };
}

function findStudentAttendanceSheet_(ss, sheetId) {
  if (!sheetId) return null;
  return ss.getSheets().find((sheet) => sheet.getSheetId() === sheetId) || null;
}

function fillStudentAttendanceHeader_(sheet, payload, thaiMonth) {
  const schoolName = String(payload.schoolName || STUDENT_ATTENDANCE_REPORT_CONFIG.DEFAULT_SCHOOL_NAME);
  const classLevel = String(payload.classLevel || "");
  const academicYear = String(payload.academicYear || "");
  const logoFileId = String(payload.logoFileId || "").trim();

  if (logoFileId) {
    sheet.setRowHeight(1, 48);
    insertStudentAttendanceDriveImage_(sheet, logoFileId, 19, 1, 42, 42);
  }

  setStudentAttendanceMergedValue_(sheet, "A2:AL2", "แบบบันทึกการมาเรียนของนักเรียน");
  setStudentAttendanceMergedValue_(sheet, "A3:AL3", `ชั้น ${classLevel}    ปีการศึกษา ${academicYear}`);
  setStudentAttendanceMergedValue_(sheet, "A4:AL4", schoolName);
  setStudentAttendanceMergedValue_(sheet, "A5:AL5", `เดือน ${thaiMonth}`);

  sheet.getRange("A2:AL5")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setFontWeight("bold")
    .setFontSize(14);
}

function fillStudentAttendanceTable_(sheet, payload) {
  const days = Array.isArray(payload.days) ? payload.days : [];
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const extraRows = Math.max(0, rows.length - STUDENT_ATTENDANCE_REPORT_CONFIG.TEMPLATE_STUDENT_ROWS);
  const startRow = STUDENT_ATTENDANCE_REPORT_CONFIG.STUDENT_START_ROW;
  const totalColumn = STUDENT_ATTENDANCE_REPORT_CONFIG.TOTAL_COLUMN;

  if (extraRows > 0) {
    sheet.insertRowsBefore(startRow + STUDENT_ATTENDANCE_REPORT_CONFIG.TEMPLATE_STUDENT_ROWS, extraRows);
    const source = sheet.getRange(startRow + STUDENT_ATTENDANCE_REPORT_CONFIG.TEMPLATE_STUDENT_ROWS - 1, 1, 1, totalColumn);
    const target = sheet.getRange(startRow + STUDENT_ATTENDANCE_REPORT_CONFIG.TEMPLATE_STUDENT_ROWS, 1, extraRows, totalColumn);
    source.copyTo(target, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  }

  const rowCount = Math.max(STUDENT_ATTENDANCE_REPORT_CONFIG.TEMPLATE_STUDENT_ROWS, rows.length);
  const tableRange = sheet.getRange(startRow, 1, rowCount, totalColumn);
  tableRange.clearContent();

  const dateValues = Array.from({ length: 31 }, (_, index) => days.includes(index + 1) ? index + 1 : "");
  setStudentAttendanceMergedValue_(sheet, "C7:AG7", "วันที่");
  setStudentAttendanceMergedValue_(sheet, "AH7:AL7", "รวม (วัน)");
  sheet.getRange(8, STUDENT_ATTENDANCE_REPORT_CONFIG.HEADER_DATE_START_COLUMN, 1, 31).setValues([dateValues]);
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
  sheet.getRange(startRow, 2, rowCount, 1)
    .setHorizontalAlignment("left")
    .setFontSize(13)
    .setFontWeight("bold");
  styleStudentAttendanceStatusSymbols_(sheet, rowCount);

  fillStudentAttendanceSignatures_(sheet, payload, extraRows);
}

function fitStudentAttendanceSheet_(sheet) {
  sheet.setColumnWidth(1, 36);
  sheet.setColumnWidth(2, 170);
  for (let column = 3; column <= 33; column += 1) {
    sheet.setColumnWidth(column, 24);
  }
  for (let column = 34; column <= 38; column += 1) {
    sheet.setColumnWidth(column, 34);
  }
  sheet.getRange(7, 1, sheet.getMaxRows() - 6, STUDENT_ATTENDANCE_REPORT_CONFIG.TOTAL_COLUMN)
    .setWrap(false)
    .setVerticalAlignment("middle");
}

function setStudentAttendanceMergedValue_(sheet, a1Notation, value) {
  const range = sheet.getRange(a1Notation);
  unmergeStudentAttendanceOverlaps_(range);
  range.merge().setValue(value);
}

function unmergeStudentAttendanceOverlaps_(range) {
  const mergedRanges = range.getMergedRanges();
  mergedRanges.forEach((mergedRange) => {
    mergedRange.breakApart();
  });
}

function fillStudentAttendanceSignatures_(sheet, payload, extraRows) {
  const signatureLineRow = STUDENT_ATTENDANCE_REPORT_CONFIG.SIGNATURE_LINE_ROW + extraRows;
  const signatureNameRow = STUDENT_ATTENDANCE_REPORT_CONFIG.SIGNATURE_NAME_ROW + extraRows;
  const adviserName = String(payload.adviserName || "").trim();
  const directorName = String(payload.directorName || STUDENT_ATTENDANCE_REPORT_CONFIG.DEFAULT_DIRECTOR_NAME).trim();
  const adviserSignatureFileId = String(payload.adviserSignatureFileId || "").trim();
  const directorSignatureFileId = String(payload.directorSignatureFileId || "").trim();

  sheet.getRange(signatureLineRow, 1, 3, STUDENT_ATTENDANCE_REPORT_CONFIG.TOTAL_COLUMN)
    .setFontSize(12)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");
  sheet.getRange(signatureLineRow, 3).setValue("ลงชื่อ........................................ครูประจำชั้น");
  sheet.getRange(signatureNameRow, 3).setValue(`(${adviserName || "........................................"})`);
  sheet.getRange(signatureLineRow, 23).setValue("ลงชื่อ........................................ผู้อำนวยการโรงเรียน");
  sheet.getRange(signatureNameRow, 23).setValue(`(${directorName})`);

  if (adviserSignatureFileId) {
    insertStudentAttendanceDriveImage_(sheet, adviserSignatureFileId, 9, signatureLineRow - 1, 150, 48);
  }
  if (directorSignatureFileId) {
    insertStudentAttendanceDriveImage_(sheet, directorSignatureFileId, 29, signatureLineRow - 1, 150, 48);
  }
}

function styleStudentAttendanceStatusSymbols_(sheet, rowCount) {
  const range = sheet.getRange(STUDENT_ATTENDANCE_REPORT_CONFIG.STUDENT_START_ROW, 3, rowCount, 31);
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

function insertStudentAttendanceDriveImage_(sheet, fileId, column, row, width, height) {
  try {
    const blob = DriveApp.getFileById(fileId).getBlob();
    const image = sheet.insertImage(blob, column, row);
    image.setWidth(width).setHeight(height);
  } catch (error) {
    console.error(`Insert image failed ${fileId}: ${error && error.message ? error.message : error}`);
  }
}

function exportStudentAttendanceSheetPdf_(spreadsheetId, sheetId, fileName) {
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

function formatStudentAttendanceThaiMonth_(month) {
  const parts = String(month || "").split("-");
  const year = Number(parts[0]);
  const monthNumber = Number(parts[1]);
  const thaiYear = year ? year + 543 : "";
  return `${THAI_MONTHS[(monthNumber || 1) - 1]} พ.ศ. ${thaiYear}`;
}

function verifySecret_(e) {
  const supplied = String(e?.parameter?.secret || "").trim();
  const saved = PropertiesService
    .getScriptProperties()
    .getProperty(ATTENDANCE_REPORT_CONFIG.SECRET_PROPERTY);

  if (!saved) {
    throw new Error("ยังไม่ได้ตั้งค่า DAILY_PDF_SECRET");
  }

  if (!supplied || supplied !== saved) {
    throw new Error("GAS_DAILY_PDF_SECRET ไม่ถูกต้อง");
  }
}

function verifySecretValue_(suppliedSecret) {
  const supplied = String(suppliedSecret || "").trim();
  const saved = PropertiesService
    .getScriptProperties()
    .getProperty(ATTENDANCE_REPORT_CONFIG.SECRET_PROPERTY);

  if (!saved) {
    throw new Error("ยังไม่ได้ตั้งค่า DAILY_PDF_SECRET");
  }

  if (!supplied || supplied !== saved) {
    throw new Error("GAS_DAILY_PDF_SECRET ไม่ถูกต้อง");
  }
}

function handleBuildDailyPdf_(payload) {
  const startedAt = Date.now();
  const date = String(payload.date || "").trim();
  const rows = Array.isArray(payload.rows)
    ? payload.rows
    : [];
  const notes = Array.isArray(payload.notes)
    ? payload.notes
    : [];
  // WORK_CALENDAR_PDF_STEP15
  const allowEmptyRows = Boolean(payload.allowEmptyRows);
  const summary = payload.summary || {};
  const calculatedSummary =
    calculateAttendanceSummary_(rows, summary);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("กรุณาระบุ date รูปแบบ YYYY-MM-DD");
  }

  if (rows.length === 0 && !allowEmptyRows) {
    throw new Error(
      "วันที่เลือกยังไม่มีผู้ลงเวลา จึงไม่สามารถสร้าง PDF ได้"
    );
  }

  const parts = date.split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  const buddhistYear = year + 543;

  const monthInfo = {
    year: year,
    month: month,
    buddhistYear: buddhistYear,
    monthName: THAI_MONTHS[month - 1],
  };

  const monthFolder = getOrCreateMonthFolder_(monthInfo);

  const documentName =
    "บัญชีลงเวลาปฏิบัติราชการ_" +
    pad2_(day) +
    "-" +
    pad2_(month) +
    "-" +
    buddhistYear;

  const pdfName = documentName + ".pdf";
  const existingPdf = firstFileByNameAndMime_(
    monthFolder,
    pdfName,
    MimeType.PDF
  );
  const replaced = Boolean(existingPdf);

  trashFilesByName_(monthFolder, documentName);
  trashFilesByName_(monthFolder, pdfName);

  const templateFile = DriveApp.getFileById(
    ATTENDANCE_REPORT_CONFIG.DAILY_TEMPLATE_ID
  );

  const copiedFile = templateFile.makeCopy(
    documentName,
    monthFolder
  );

  const document = DocumentApp.openById(
    copiedFile.getId()
  );
  const body = document.getBody();

  replaceTemplateDate_(body, year, month, day);

  replaceAllLiteralPlaceholder_(
    body,
    "{{วันที่}}",
    formatThaiDocumentDate_(year, month, day)
  );

  fillFixedRepeatedPlaceholders_(
    body,
    rows,
    ATTENDANCE_REPORT_CONFIG.DAILY_DATA_ROWS
  );

  replaceAllLiteralPlaceholder_(
    body,
    "{{หมายเหตุ}}",
    notes.length > 0
      ? toThaiDigits_(notes.join(", "))
      : "-"
  );

  replaceAllLiteralPlaceholder_(
    body,
    "{{ทั้งหมด}}",
    toThaiDigits_(Number(calculatedSummary.total || 0))
  );

  replaceAllLiteralPlaceholder_(
    body,
    "{{ที่มา}}",
    toThaiDigits_(Number(calculatedSummary.present || 0))
  );

  replaceAllLiteralPlaceholder_(
    body,
    "{{ลาป่วย}}",
    toThaiDigits_(Number(calculatedSummary.sickLeave || 0))
  );

  replaceAllLiteralPlaceholder_(
    body,
    "{{ลากิจ}}",
    toThaiDigits_(Number(calculatedSummary.personalLeave || 0))
  );

  replaceAllLiteralPlaceholder_(
    body,
    "{{ไปราชการ}}",
    toThaiDigits_(Number(calculatedSummary.officialDuty || 0))
  );

  replaceAllLiteralPlaceholder_(
    body,
    "{{สาย}}",
    toThaiDigits_(Number(calculatedSummary.late || 0))
  );

  replaceAllLiteralPlaceholder_(
    body,
    "{{ไม่มา}}",
    toThaiDigits_(Number(calculatedSummary.absent || 0))
  );

  // ล้าง Placeholder ที่เหลือหลังแทนค่าทั้งตารางและสรุปแล้ว
  clearAllRemainingPlaceholders_(body);

  document.saveAndClose();
  Utilities.sleep(150);

  const pdfBlob = copiedFile
    .getAs(MimeType.PDF)
    .setName(pdfName);

  const pdfFile = monthFolder.createFile(pdfBlob);

  // เก็บ Google Docs รายวันไว้สำหรับการรวม PDF รายเดือน
  return jsonOutput_({
    ok: true,
    found: true,
    version: ATTENDANCE_REPORT_CONFIG.VERSION,
    replaced: replaced,
    recordCount: rows.length,
    elapsedMs: Date.now() - startedAt,
    fileId: pdfFile.getId(),
    fileName: pdfFile.getName(),
    documentId: copiedFile.getId(),
    message: replaced
      ? "สร้าง PDF รายวันใหม่ตามต้นฉบับและแทนที่ไฟล์เดิมแล้ว"
      : "สร้าง PDF รายวันตามต้นฉบับเรียบร้อยแล้ว",
  });
}

/**
 * คำนวณยอดสรุปจากข้อมูลลงเวลาจริง
 *
 * หลักการ:
 * - ผู้ที่มาสายยังนับเป็นผู้มาปฏิบัติราชการ
 * - ลาป่วย/ลากิจ/ไปราชการ แยกออกจากผู้มา
 * - จำนวนทั้งหมดใช้ค่าจาก payload.summary.total หากมี
 * - ไม่มา = ทั้งหมด - ผู้มา - ลาป่วย - ลากิจ - ไปราชการ
 */
function calculateAttendanceSummary_(
  rows,
  providedSummary
) {
  const safeRows = Array.isArray(rows)
    ? rows
    : [];
  const source = providedSummary || {};

  // Prefer the summary calculated by Next.js.
  // It already includes staff working at an alternate workplace.
  const hasProvidedSummary =
    Number.isFinite(Number(source.total)) &&
    Number.isFinite(Number(source.present)) &&
    Number.isFinite(Number(source.sickLeave)) &&
    Number.isFinite(Number(source.personalLeave)) &&
    Number.isFinite(Number(source.officialDuty)) &&
    Number.isFinite(Number(source.late)) &&
    Number.isFinite(Number(source.absent));

  if (hasProvidedSummary) {
    return {
      total: Math.max(Math.trunc(Number(source.total)), 0),
      present: Math.max(Math.trunc(Number(source.present)), 0),
      sickLeave: Math.max(Math.trunc(Number(source.sickLeave)), 0),
      personalLeave: Math.max(
        Math.trunc(Number(source.personalLeave)),
        0
      ),
      officialDuty: Math.max(
        Math.trunc(Number(source.officialDuty)),
        0
      ),
      late: Math.max(Math.trunc(Number(source.late)), 0),
      absent: Math.max(Math.trunc(Number(source.absent)), 0),
    };
  }


  let present = 0;
  let sickLeave = 0;
  let personalLeave = 0;
  let officialDuty = 0;
  let late = 0;

  safeRows.forEach(function (row) {
    const status = normalizeAttendanceStatus_(
      row.status ||
      row.attendanceStatus ||
      row.type ||
      ""
    );

    const checkIn = String(
      row.checkIn ||
      row.check_in ||
      row.timeIn ||
      ""
    ).trim();

    if (status.indexOf("ลาป่วย") !== -1) {
      sickLeave += 1;
      return;
    }

    if (status.indexOf("ลากิจ") !== -1) {
      personalLeave += 1;
      return;
    }

    if (
      status.indexOf("ไปราชการ") !== -1 ||
      status.indexOf("ราชการ") !== -1
    ) {
      officialDuty += 1;
      return;
    }

    if (
      status.indexOf("สาย") !== -1 ||
      row.isLate === true ||
      row.late === true
    ) {
      late += 1;
      present += 1;
      return;
    }

    if (
      checkIn ||
      status.indexOf("ปฏิบัติ") !== -1 ||
      status.indexOf("มา") !== -1 ||
      status.indexOf("ปกติ") !== -1
    ) {
      present += 1;
    }
  });

  const totalFromPayload = Number(source.total);
  const minimumTotal =
    present +
    sickLeave +
    personalLeave +
    officialDuty;

  const total =
    Number.isFinite(totalFromPayload) &&
    totalFromPayload > 0
      ? Math.max(
          Math.trunc(totalFromPayload),
          minimumTotal
        )
      : minimumTotal;

  const absent = Math.max(
    total -
      present -
      sickLeave -
      personalLeave -
      officialDuty,
    0
  );

  return {
    total: total,
    present: present,
    sickLeave: sickLeave,
    personalLeave: personalLeave,
    officialDuty: officialDuty,
    late: late,
    absent: absent,
  };
}

function normalizeAttendanceStatus_(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .trim();
}

/**
 * ตาราง Google Docs มี 12 แถวคงที่ และใช้ Placeholder ชื่อเดิมซ้ำทุกแถว
 * ระบบแทนค่าทีละตำแหน่งจากบนลงล่างเท่านั้น
 * ไม่มีการเพิ่ม/ลบ/คัดลอกแถว
 */
function fillFixedRepeatedPlaceholders_(
  body,
  rows,
  maxRows
) {
  const safeRows = Array.isArray(rows)
    ? rows.slice(0, maxRows)
    : [];

  while (safeRows.length < maxRows) {
    safeRows.push({});
  }

  const queues = {
    order: safeRows.map(function (row, index) {
      const hasName = Boolean(
        row.fullName ||
        row.name ||
        row.full_name
      );

      return hasName
        ? toThaiDigits_(index + 1)
        : "";
    }),

    fullName: safeRows.map(function (row) {
      return toThaiDigits_(
        row.fullName ||
        row.name ||
        row.full_name ||
        ""
      );
    }),

    position: safeRows.map(function (row) {
      return toThaiDigits_(
        row.position ||
        row.jobTitle ||
        ""
      );
    }),

    checkIn: safeRows.map(function (row) {
      return toThaiDigits_(
        row.checkIn ||
        row.check_in ||
        row.timeIn ||
        ""
      );
    }),

    status: safeRows.map(function (row) {
      return toThaiDigits_(
        row.status ||
        row.attendanceStatus ||
        ""
      );
    }),

    checkOut: safeRows.map(function (row) {
      return toThaiDigits_(
        row.checkOut ||
        row.check_out ||
        row.timeOut ||
        ""
      );
    }),

    reason: safeRows.map(function (row) {
      return toThaiDigits_(
        row.reason ||
        row.leaveReason ||
        row.note ||
        ""
      );
    }),
  };

  const placeholderMap = {
    "{{ลำดับ}}": "order",
    "{{ชื่อนามสกุล}}": "fullName",
    "{{ตำแหน่ง}}": "position",
    "{{เวลาเข้า}}": "checkIn",
    "{{สถานะ}}": "status",
    "{{สถานะเวลา}}": "status",
    "{{สถานะ เวลา}}": "status",
    "{{เวลากลับ}}": "checkOut",
    "{{เหตุผล}}": "reason",
  };

  const counters = {
    order: 0,
    fullName: 0,
    position: 0,
    checkIn: 0,
    status: 0,
    checkOut: 0,
    reason: 0,
  };

  replaceRepeatedPlaceholdersFast_(
    body,
    placeholderMap,
    queues,
    counters
  );
}

/**
 * ไล่อ่านเอกสารเพียงรอบเดียว แทนการค้นหาจากต้นเอกสาร
 * ซ้ำหลายสิบครั้ง จึงลดเวลาสร้าง PDF ได้มาก
 */
function replaceRepeatedPlaceholdersFast_(
  element,
  placeholderMap,
  queues,
  counters
) {
  if (!element) {
    return;
  }

  const type =
    typeof element.getType === "function"
      ? element.getType()
      : null;

  if (
    type === DocumentApp.ElementType.PARAGRAPH ||
    type === DocumentApp.ElementType.LIST_ITEM
  ) {
    let editableText;

    try {
      editableText = element.editAsText();
    } catch (error) {
      editableText = null;
    }

    if (editableText) {
      let currentText = editableText.getText();

      while (true) {
        let selectedPlaceholder = "";
        let selectedIndex = -1;

        Object.keys(placeholderMap).forEach(function (
          placeholder
        ) {
          const foundIndex =
            currentText.indexOf(placeholder);

          if (
            foundIndex !== -1 &&
            (
              selectedIndex === -1 ||
              foundIndex < selectedIndex
            )
          ) {
            selectedPlaceholder = placeholder;
            selectedIndex = foundIndex;
          }
        });

        if (selectedIndex === -1) {
          break;
        }

        const field =
          placeholderMap[selectedPlaceholder];
        const valueIndex = counters[field];
        const queue = queues[field] || [];
        const replacement = String(
          queue[valueIndex] == null
            ? ""
            : queue[valueIndex]
        );

        counters[field] += 1;

        editableText.deleteText(
          selectedIndex,
          selectedIndex +
            selectedPlaceholder.length -
            1
        );

        if (replacement) {
          editableText.insertText(
            selectedIndex,
            replacement
          );
        }

        currentText = editableText.getText();
      }
    }

    return;
  }

  if (
    typeof element.getNumChildren === "function"
  ) {
    for (
      let index = 0;
      index < element.getNumChildren();
      index += 1
    ) {
      replaceRepeatedPlaceholdersFast_(
        element.getChild(index),
        placeholderMap,
        queues,
        counters
      );
    }
  }
}


function replaceNextStatusPlaceholder_(
  body,
  value
) {
  const variants = [
    "{{สถานะเวลา}}",
    "{{สถานะ เวลา}}",
    "{{สถานะ}}",
  ];

  for (
    let index = 0;
    index < variants.length;
    index += 1
  ) {
    if (
      replaceNextLiteralPlaceholder_(
        body,
        variants[index],
        value
      )
    ) {
      return true;
    }
  }

  return false;
}

/**
 * แทนเฉพาะ Placeholder ตำแหน่งแรกที่พบ
 */
function replaceNextLiteralPlaceholder_(
  element,
  placeholder,
  value
) {
  if (!element) {
    return false;
  }

  const type =
    typeof element.getType === "function"
      ? element.getType()
      : null;

  if (
    type === DocumentApp.ElementType.PARAGRAPH ||
    type === DocumentApp.ElementType.LIST_ITEM
  ) {
    let editableText;

    try {
      editableText = element.editAsText();
    } catch (error) {
      editableText = null;
    }

    if (editableText) {
      const currentText = editableText.getText();
      const start = currentText.indexOf(placeholder);

      if (start !== -1) {
        const end =
          start + placeholder.length - 1;
        const replacement =
          value == null ? "" : String(value);

        editableText.deleteText(start, end);

        if (replacement) {
          editableText.insertText(
            start,
            replacement
          );
        }

        return true;
      }
    }
  }

  if (
    typeof element.getNumChildren === "function"
  ) {
    for (
      let index = 0;
      index < element.getNumChildren();
      index += 1
    ) {
      if (
        replaceNextLiteralPlaceholder_(
          element.getChild(index),
          placeholder,
          value
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

function replaceAllLiteralPlaceholder_(
  body,
  placeholder,
  value
) {
  while (
    replaceNextLiteralPlaceholder_(
      body,
      placeholder,
      value
    )
  ) {
    // ทำซ้ำจนหมด
  }
}

/**
 * แถวที่ไม่มีข้อมูลจะถูกล้าง Placeholder ให้เป็นช่องว่าง
 */
function clearAllRemainingPlaceholders_(
  element
) {
  if (!element) {
    return;
  }

  const type =
    typeof element.getType === "function"
      ? element.getType()
      : null;

  if (
    type === DocumentApp.ElementType.PARAGRAPH ||
    type === DocumentApp.ElementType.LIST_ITEM
  ) {
    let editableText;

    try {
      editableText = element.editAsText();
    } catch (error) {
      return;
    }

    let text = editableText.getText();
    const pattern = /\{\{[^{}]+\}\}/;
    let match = text.match(pattern);

    while (match) {
      const start = match.index;
      const end =
        start + match[0].length - 1;

      editableText.deleteText(start, end);
      text = editableText.getText();
      match = text.match(pattern);
    }

    return;
  }

  if (
    typeof element.getNumChildren === "function"
  ) {
    for (
      let index = 0;
      index < element.getNumChildren();
      index += 1
    ) {
      clearAllRemainingPlaceholders_(
        element.getChild(index)
      );
    }
  }
}

function normalizeTemplateTypography_(body, table) {
  const paragraphs = body.getParagraphs();

  paragraphs.forEach(function (paragraph, index) {
    const text = paragraph.getText().trim();

    paragraph.setFontFamily("Sarabun");
    paragraph.setSpacingBefore(0);
    paragraph.setSpacingAfter(0);
    paragraph.setLineSpacing(1);

    if (index === 0) {
      paragraph.setFontSize(16);
      paragraph.setBold(true);
      paragraph.setAlignment(
        DocumentApp.HorizontalAlignment.CENTER
      );
      return;
    }

    paragraph.setFontSize(14);
    paragraph.setBold(false);
  });

  if (!table || table.getNumRows() === 0) {
    return;
  }

  const headerRow = table.getRow(0);

  for (
    let cellIndex = 0;
    cellIndex < headerRow.getNumCells();
    cellIndex += 1
  ) {
    const cell = headerRow.getCell(cellIndex);
    const paragraph = cell.getChild(0).asParagraph();

    paragraph.setFontFamily("Sarabun");
    paragraph.setFontSize(14);
    paragraph.setBold(true);
    paragraph.setLineSpacing(1);
    paragraph.setSpacingBefore(0);
    paragraph.setSpacingAfter(0);
    paragraph.setAlignment(
      DocumentApp.HorizontalAlignment.CENTER
    );

    cell.setVerticalAlignment(
      DocumentApp.VerticalAlignment.CENTER
    );
  }

  for (
    let rowIndex = 1;
    rowIndex < table.getNumRows();
    rowIndex += 1
  ) {
    const row = table.getRow(rowIndex);

    for (
      let cellIndex = 0;
      cellIndex < row.getNumCells();
      cellIndex += 1
    ) {
      const cell = row.getCell(cellIndex);
      const paragraph = cell.getChild(0).asParagraph();

      paragraph.setFontFamily("Sarabun");
      paragraph.setFontSize(14);
      paragraph.setBold(false);
      paragraph.setLineSpacing(1);
      paragraph.setSpacingBefore(0);
      paragraph.setSpacingAfter(0);

      if (
        cellIndex === 0 ||
        cellIndex === 2 ||
        cellIndex === 3 ||
        cellIndex === 4 ||
        cellIndex === 5 ||
        cellIndex === 6
      ) {
        paragraph.setAlignment(
          DocumentApp.HorizontalAlignment.CENTER
        );
      } else {
        paragraph.setAlignment(
          DocumentApp.HorizontalAlignment.LEFT
        );
      }

      cell.setVerticalAlignment(
        DocumentApp.VerticalAlignment.CENTER
      );
    }
  }
}

function replaceTemplateDate_(body, year, month, day) {
  const dateText =
    toThaiDigits_(day) +
    " " +
    THAI_MONTHS[month - 1] +
    " " +
    toThaiDigits_(year + 543);

  const paragraphs = body.getParagraphs();

  for (
    let index = 0;
    index < paragraphs.length;
    index += 1
  ) {
    const paragraph = paragraphs[index];
    const text = paragraph.getText();
    const match = text.match(
      /[๐-๙0-9]{1,2}\s+[ก-๙]+\s+[๐-๙0-9]{4}/
    );

    if (!match) {
      continue;
    }

    const start = match.index;
    const end = start + match[0].length - 1;
    const editableText = paragraph.editAsText();

    editableText.deleteText(start, end);
    editableText.insertText(start, dateText);
    return;
  }
}

function ensureTemplateRows_(table, targetRows) {
  while (table.getNumRows() < targetRows + 1) {
    const sourceRow = table.getRow(table.getNumRows() - 1);
    table.appendTableRow(sourceRow.copy());
  }
}

function clearTemplateDataRows_(table, targetRows) {
  const lastRow = Math.min(
    targetRows,
    table.getNumRows() - 1
  );

  for (
    let rowIndex = 1;
    rowIndex <= lastRow;
    rowIndex += 1
  ) {
    const row = table.getRow(rowIndex);

    for (
      let cellIndex = 0;
      cellIndex < row.getNumCells();
      cellIndex += 1
    ) {
      setTemplateCellText_(
        row.getCell(cellIndex),
        "",
        cellIndex
      );
    }

    if (row.getNumCells() > 0) {
      setTemplateCellText_(
        row.getCell(0),
        toThaiDigits_(rowIndex),
        0
      );
    }
  }
}

function setTemplateCellText_(
  cell,
  value,
  cellIndex
) {
  const normalizedValue = toThaiDigits_(value);

  const cellAttributes = cell.getAttributes();
  let paragraphAttributes = {};
  let textAttributes = {};

  if (cell.getNumChildren() > 0) {
    const firstChild = cell.getChild(0);

    if (
      firstChild.getType() ===
      DocumentApp.ElementType.PARAGRAPH
    ) {
      const originalParagraph =
        firstChild.asParagraph();

      paragraphAttributes =
        originalParagraph.getAttributes();

      if (originalParagraph.getNumChildren() > 0) {
        const firstText =
          originalParagraph.getChild(0);

        if (
          firstText.getType() ===
          DocumentApp.ElementType.TEXT
        ) {
          textAttributes =
            firstText.asText().getAttributes();
        }
      }
    }
  }

  cell.setText(normalizedValue);
  cell.setAttributes(cellAttributes);

  const paragraph = cell.getChild(0).asParagraph();
  paragraph.setAttributes(paragraphAttributes);

  if (paragraph.getNumChildren() > 0) {
    const text = paragraph.getChild(0);

    if (
      text.getType() ===
      DocumentApp.ElementType.TEXT
    ) {
      text.asText().setAttributes(textAttributes);
    }
  }
}

function replaceNotes_(body, notes) {
  const noteText =
    notes.length > 0
      ? "หมายเหตุ  " +
        toThaiDigits_(notes.join(", "))
      : "หมายเหตุ  -";

  const paragraphs = body.getParagraphs();

  for (
    let index = 0;
    index < paragraphs.length;
    index += 1
  ) {
    const paragraph = paragraphs[index];
    const text = paragraph.getText().trim();

    if (text.indexOf("หมายเหตุ") !== 0) {
      continue;
    }

    replaceParagraphTextKeepStyle_(
      paragraph,
      noteText
    );
    return;
  }
}

function replaceSummary_(body, summary) {
  const values = {
    "ข้าราชการทั้งหมด": Number(summary.total || 0),
    "มาปฏิบัติราชการ": Number(summary.present || 0),
    "ลาป่วย": Number(summary.sickLeave || 0),
    "ลากิจ": Number(summary.personalLeave || 0),
    "ไปราชการ": Number(summary.officialDuty || 0),
    "มาสาย": Number(summary.late || 0),
    "ไม่มาปฏิบัติราชการ": Number(summary.absent || 0),
  };

  const paragraphs = body.getParagraphs();

  paragraphs.forEach(function (paragraph) {
    const original = paragraph.getText();

    Object.keys(values).some(function (label) {
      if (original.indexOf(label) === -1) {
        return false;
      }

      const numberPattern =
        /[๐-๙0-9]+(?=\s*คน)/;
      const match = original.match(numberPattern);

      if (match) {
        const start = match.index;
        const end = start + match[0].length - 1;
        const editableText = paragraph.editAsText();

        editableText.deleteText(start, end);
        editableText.insertText(
          start,
          toThaiDigits_(values[label])
        );
      }

      return true;
    });
  });
}

function replaceParagraphTextKeepStyle_(
  paragraph,
  value
) {
  const paragraphAttributes =
    paragraph.getAttributes();
  let textAttributes = {};

  if (paragraph.getNumChildren() > 0) {
    const firstChild = paragraph.getChild(0);

    if (
      firstChild.getType() ===
      DocumentApp.ElementType.TEXT
    ) {
      textAttributes =
        firstChild.asText().getAttributes();
    }
  }

  paragraph.setText(value);
  paragraph.setAttributes(paragraphAttributes);

  if (paragraph.getNumChildren() > 0) {
    const firstChild = paragraph.getChild(0);

    if (
      firstChild.getType() ===
      DocumentApp.ElementType.TEXT
    ) {
      firstChild
        .asText()
        .setAttributes(textAttributes);
    }
  }
}

function formatThaiDocumentDate_(
  year,
  month,
  day
) {
  const date = new Date(
    year,
    month - 1,
    day,
    12,
    0,
    0
  );

  return (
    THAI_DAYS[date.getDay()] +
    "ที่ " +
    toThaiDigits_(day) +
    " " +
    THAI_MONTHS[month - 1] +
    " พ.ศ. " +
    toThaiDigits_(year + 543)
  );
}

function toThaiDigits_(value) {
  const thaiDigits = [
    "๐",
    "๑",
    "๒",
    "๓",
    "๔",
    "๕",
    "๖",
    "๗",
    "๘",
    "๙",
  ];

  return String(value).replace(
    /\d/g,
    function (digit) {
      return thaiDigits[Number(digit)];
    }
  );
}

function handleDailyPdf_(e) {
  const date = String(e?.parameter?.date || "").trim();
  const mode = String(e?.parameter?.mode || "metadata").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("กรุณาระบุ date รูปแบบ YYYY-MM-DD");
  }

  const [yearText, monthText, dayText] = date.split("-");
  const buddhistYear = Number(yearText) + 543;
  const fileName =
    "บัญชีลงเวลาปฏิบัติราชการ_" +
    dayText +
    "-" +
    monthText +
    "-" +
    buddhistYear +
    ".pdf";

  const startFolder = DriveApp.getFolderById(
    ATTENDANCE_REPORT_CONFIG.START_FOLDER_ID
  );

  const file = findFileRecursive_(
    startFolder,
    fileName,
    MimeType.PDF,
    0
  );

  return fileResponse_(file, mode, fileName);
}

function handleDeleteDailyPdf_(e) {
  const date = String(e?.parameter?.date || "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("กรุณาระบุ date รูปแบบ YYYY-MM-DD");
  }

  const [yearText, monthText, dayText] = date.split("-");
  const monthInfo = {
    year: Number(yearText),
    month: Number(monthText),
    buddhistYear: Number(yearText) + 543,
    monthName: THAI_MONTHS[Number(monthText) - 1],
  };

  const monthFolder = findMonthFolder_(monthInfo);

  if (!monthFolder) {
    return jsonOutput_({
      ok: true,
      deleted: false,
      found: false,
      message: "ไม่พบโฟลเดอร์ของเดือนที่เลือก",
    });
  }

  const fileName =
    "บัญชีลงเวลาปฏิบัติราชการ_" +
    dayText +
    "-" +
    monthText +
    "-" +
    monthInfo.buddhistYear +
    ".pdf";

  const file = firstFileByNameAndMime_(
    monthFolder,
    fileName,
    MimeType.PDF
  );

  if (!file) {
    return jsonOutput_({
      ok: true,
      deleted: false,
      found: false,
      fileName: fileName,
      message: "ไม่พบไฟล์ " + fileName,
    });
  }

  file.setTrashed(true);

  return jsonOutput_({
    ok: true,
    deleted: true,
    found: false,
    fileName: fileName,
    message: "ย้าย " + fileName + " ไปถังขยะเรียบร้อยแล้ว",
  });
}

function handleMonthlyPdf_(e) {
  const month = String(e?.parameter?.month || "").trim();
  const mode = String(e?.parameter?.mode || "metadata").trim();

  const monthInfo = parseMonth_(month);
  const fileName = monthlyPdfName_(monthInfo);
  const monthFolder = findMonthFolder_(monthInfo);

  if (!monthFolder) {
    return jsonOutput_({
      ok: true,
      found: false,
      message: "ไม่พบโฟลเดอร์ของเดือนที่เลือก",
    });
  }

  const file = firstFileByNameAndMime_(
    monthFolder,
    fileName,
    MimeType.PDF
  );

  return fileResponse_(file, mode, fileName);
}

function handleWeeklyPdf_(e) {
  const month = String(e?.parameter?.month || "").trim();
  const mode = String(e?.parameter?.mode || "metadata").trim();
  const monthInfo = parseMonth_(month);
  const range = parseWeekRange_(e, monthInfo);
  const fileName = weeklyPdfName_(
    monthInfo,
    range.startDay,
    range.endDay
  );
  const monthFolder = findMonthFolder_(monthInfo);

  if (!monthFolder) {
    return jsonOutput_({
      ok: true,
      found: false,
      message: "ยังไม่พบไฟล์ " + fileName,
    });
  }

  const file = firstFileByNameAndMime_(
    monthFolder,
    fileName,
    MimeType.PDF
  );

  return fileResponse_(file, mode, fileName);
}

function handleMonthStatus_(e) {
  const month = String(e?.parameter?.month || "").trim();
  const monthInfo = parseMonth_(month);
  const monthFolder = findMonthFolder_(monthInfo);

  if (!monthFolder) {
    return jsonOutput_({
      ok: true,
      dailyPdfDays: [],
      weeklyPdfPeriods: weeklyPeriodStatus_(null, monthInfo),
      monthlyPdfFound: false,
      monthClosed: false,
      canCloseMonth: isMonthEnded_(monthInfo),
      message: "ยังไม่มีโฟลเดอร์เดือนนี้ ระบบจะสร้างให้อัตโนมัติเมื่อสร้าง PDF",
    });
  }

  const dailyPdfDays = [];
  const daysInMonth = new Date(
    monthInfo.year,
    monthInfo.month,
    0
  ).getDate();

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dailyPdfName =
      "บัญชีลงเวลาปฏิบัติราชการ_" +
      pad2_(day) +
      "-" +
      pad2_(monthInfo.month) +
      "-" +
      monthInfo.buddhistYear +
      ".pdf";

    if (
      firstFileByNameAndMime_(
        monthFolder,
        dailyPdfName,
        MimeType.PDF
      )
    ) {
      dailyPdfDays.push(day);
    }
  }

  const monthlyFileName = monthlyPdfName_(monthInfo);
  const monthlyPdf = firstFileByNameAndMime_(
    monthFolder,
    monthlyFileName,
    MimeType.PDF
  );
  const weeklyPdfPeriods = weeklyPeriodStatus_(
    monthFolder,
    monthInfo
  );

  const monthClosed =
    Boolean(monthlyPdf) && dailyPdfDays.length === 0;

  return jsonOutput_({
    ok: true,
    dailyPdfDays: dailyPdfDays,
    weeklyPdfPeriods: weeklyPdfPeriods,
    monthlyPdfFound: Boolean(monthlyPdf),
    monthlyFileName: monthlyPdf
      ? monthlyPdf.getName()
      : "",
    monthClosed: monthClosed,
    canCloseMonth: isMonthEnded_(monthInfo),
  });
}

function handleCloseMonth_(e) {
  const month = String(e?.parameter?.month || "").trim();
  const monthInfo = parseMonth_(month);

  if (!isMonthEnded_(monthInfo)) {
    throw new Error(
      "ยังไม่สามารถปิดเดือนนี้ได้ ต้องรอให้สิ้นเดือนก่อน"
    );
  }

  const monthFolder = findMonthFolder_(monthInfo);

  if (!monthFolder) {
    throw new Error("ไม่พบโฟลเดอร์ของเดือนที่เลือก");
  }

  const monthlyPdf = firstFileByNameAndMime_(
    monthFolder,
    monthlyPdfName_(monthInfo),
    MimeType.PDF
  );

  if (!monthlyPdf || monthlyPdf.getSize() <= 0) {
    throw new Error(
      "ยังไม่มี PDF รวมเดือนที่สมบูรณ์ กรุณาสร้างไฟล์รวมเดือนก่อน"
    );
  }

  const monthlyDocName = monthlyDocName_(monthInfo);
  let deletedDailyPdfs = 0;
  let deletedDailyDocs = 0;
  let deletedMonthlyDocs = 0;

  const files = monthFolder.getFiles();

  while (files.hasNext()) {
    const file = files.next();
    const name = file.getName();
    const mime = file.getMimeType();

    if (
      mime === MimeType.PDF &&
      isDailyReportFileName_(name, monthInfo)
    ) {
      file.setTrashed(true);
      deletedDailyPdfs += 1;
      continue;
    }

    if (
      mime === MimeType.GOOGLE_DOCS &&
      isDailyReportDocName_(name, monthInfo)
    ) {
      file.setTrashed(true);
      deletedDailyDocs += 1;
      continue;
    }

    if (
      mime === MimeType.GOOGLE_DOCS &&
      name === monthlyDocName
    ) {
      file.setTrashed(true);
      deletedMonthlyDocs += 1;
    }
  }

  return jsonOutput_({
    ok: true,
    found: true,
    message:
      "ปิดเดือนเรียบร้อยแล้ว เหลือ PDF รวมเดือนเพียงไฟล์เดียว",
    fileName: monthlyPdf.getName(),
    fileId: monthlyPdf.getId(),
    deletedDailyPdfs: deletedDailyPdfs,
    deletedDailyDocs: deletedDailyDocs,
    deletedMonthlyDocs: deletedMonthlyDocs,
  });
}

function isMonthEnded_(monthInfo) {
  const now = new Date();
  const bangkokDate = new Date(
    Utilities.formatDate(
      now,
      "Asia/Bangkok",
      "yyyy-MM-dd'T'HH:mm:ss"
    )
  );

  const monthEnd = new Date(
    monthInfo.year,
    monthInfo.month,
    0,
    23,
    59,
    59
  );

  return bangkokDate.getTime() > monthEnd.getTime();
}

function isDailyReportFileName_(name, monthInfo) {
  const pattern = new RegExp(
    "^บัญชีลงเวลาปฏิบัติราชการ_\\\\d{2}-" +
      pad2_(monthInfo.month) +
      "-" +
      monthInfo.buddhistYear +
      "\\\\.pdf$"
  );

  return pattern.test(name);
}

function isDailyReportDocName_(name, monthInfo) {
  const pattern = new RegExp(
    "^บัญชีลงเวลาปฏิบัติราชการ_\\\\d{2}-" +
      pad2_(monthInfo.month) +
      "-" +
      monthInfo.buddhistYear +
      "$"
  );

  return pattern.test(name);
}

function handleBuildMonthlyPdf_(e) {
  const month = String(e?.parameter?.month || "").trim();
  const monthInfo = parseMonth_(month);
  const daysInMonth = new Date(
    monthInfo.year,
    monthInfo.month,
    0
  ).getDate();

  return buildCombinedPdf_(
    monthInfo,
    1,
    daysInMonth,
    monthlyDocName_(monthInfo),
    monthlyPdfName_(monthInfo),
    "สร้างรายงานรวมเดือนเรียบร้อยแล้ว"
  );
}

function handleBuildWeeklyPdf_(e) {
  const month = String(e?.parameter?.month || "").trim();
  const monthInfo = parseMonth_(month);
  const range = parseWeekRange_(e, monthInfo);

  return buildCombinedPdf_(
    monthInfo,
    range.startDay,
    range.endDay,
    weeklyDocName_(monthInfo, range.startDay, range.endDay),
    weeklyPdfName_(monthInfo, range.startDay, range.endDay),
    "สร้างรายงานรวมช่วง " +
      range.startDay +
      "-" +
      range.endDay +
      " " +
      monthInfo.monthName +
      " เรียบร้อยแล้ว"
  );
}

function buildCombinedPdf_(
  monthInfo,
  startDay,
  endDay,
  combinedDocName,
  combinedPdfName,
  successMessage
) {
  const monthFolder = getOrCreateMonthFolder_(monthInfo);
  const sourceDocs = [];
  const includedDays = [];
  const missingDays = [];

  for (let day = startDay; day <= endDay; day += 1) {
    const dailyDocName =
      "บัญชีลงเวลาปฏิบัติราชการ_" +
      pad2_(day) +
      "-" +
      pad2_(monthInfo.month) +
      "-" +
      monthInfo.buddhistYear;

    const dailyDoc = firstGoogleDocByName_(
      monthFolder,
      dailyDocName
    );

    if (dailyDoc) {
      sourceDocs.push({
        day: day,
        file: dailyDoc,
      });
      includedDays.push(day);
    } else {
      missingDays.push(day);
    }
  }

  if (sourceDocs.length === 0) {
    throw new Error(
      "ยังไม่มี Google Docs รายวันสำหรับนำมารวมในช่วงที่เลือก"
    );
  }

  trashFilesByName_(monthFolder, combinedDocName);
  trashFilesByName_(monthFolder, combinedPdfName);

  const destinationDocument = DocumentApp.create(combinedDocName);
  const destinationFile = DriveApp.getFileById(
    destinationDocument.getId()
  );

  destinationFile.moveTo(monthFolder);

  const destinationBody = destinationDocument.getBody();
  destinationBody.clear();

  sourceDocs.forEach((source, index) => {
    const sourceDocument = DocumentApp.openById(
      source.file.getId()
    );
    const sourceBody = sourceDocument.getBody();

    copyBodyElements_(sourceBody, destinationBody);

    if (index < sourceDocs.length - 1) {
      destinationBody.appendPageBreak();
    }
  });

  destinationDocument.saveAndClose();
  Utilities.sleep(1200);

  const pdfBlob = DriveApp.getFileById(
    destinationDocument.getId()
  )
    .getAs(MimeType.PDF)
    .setName(combinedPdfName);

  const pdfFile = monthFolder.createFile(pdfBlob);

  // Google Docs รวมเดือนเป็นไฟล์ชั่วคราว ลบทิ้งหลังแปลง PDF สำเร็จ
  DriveApp.getFileById(
    destinationDocument.getId()
  ).setTrashed(true);

  return jsonOutput_({
    ok: true,
    found: true,
    message:
      successMessage +
      " จำนวน " +
      includedDays.length +
      " วัน",
    fileName: pdfFile.getName(),
    fileId: pdfFile.getId(),
    documentId: destinationDocument.getId(),
    includedDays: includedDays,
    missingDays: missingDays,
  });
}

function handleSaveCombinedPdf_(payload) {
  const month = String(payload.month || "").trim();
  const monthInfo = parseMonth_(month);
  const kind = String(payload.kind || "").trim();
  const range = payload.range || {};
  let fileName = "";

  if (kind === "weekly") {
    const startDay = Number(range.startDay || payload.startDay || 0);
    const endDay = Number(range.endDay || payload.endDay || 0);
    const validatedRange = parseWeekRange_(
      {
        parameter: {
          startDay: String(startDay),
          endDay: String(endDay),
        },
      },
      monthInfo
    );

    fileName = weeklyPdfName_(
      monthInfo,
      validatedRange.startDay,
      validatedRange.endDay
    );
  } else if (kind === "monthly") {
    fileName = monthlyPdfName_(monthInfo);
  } else {
    throw new Error("kind ต้องเป็น weekly หรือ monthly");
  }

  const base64 = String(payload.base64 || "").trim();

  if (!base64) {
    throw new Error("ไม่พบข้อมูล PDF รวม");
  }

  const monthFolder = getOrCreateMonthFolder_(monthInfo);
  trashFilesByName_(monthFolder, fileName);

  const bytes = Utilities.base64Decode(base64);
  const blob = Utilities.newBlob(bytes, MimeType.PDF, fileName);
  const pdfFile = monthFolder.createFile(blob);

  return jsonOutput_({
    ok: true,
    found: true,
    fileName: pdfFile.getName(),
    fileId: pdfFile.getId(),
    fileUrl: pdfFile.getUrl(),
    size: pdfFile.getSize(),
    mimeType: pdfFile.getMimeType(),
    includedDays: Array.isArray(payload.includedDays)
      ? payload.includedDays
      : [],
    missingDays: Array.isArray(payload.missingDays)
      ? payload.missingDays
      : [],
    pageCount: Number(payload.pageCount || 0),
    message:
      kind === "weekly"
        ? "สร้าง PDF รวมสัปดาห์จากไฟล์ PDF รายวันจริงเรียบร้อยแล้ว"
        : "สร้าง PDF รวมเดือนจากไฟล์ PDF รายวันจริงเรียบร้อยแล้ว",
  });
}

function copyBodyElements_(sourceBody, destinationBody) {
  for (
    let index = 0;
    index < sourceBody.getNumChildren();
    index += 1
  ) {
    const element = sourceBody.getChild(index).copy();
    const type = element.getType();

    if (type === DocumentApp.ElementType.PARAGRAPH) {
      destinationBody.appendParagraph(
        element.asParagraph()
      );
    } else if (type === DocumentApp.ElementType.TABLE) {
      destinationBody.appendTable(
        element.asTable()
      );
    } else if (type === DocumentApp.ElementType.LIST_ITEM) {
      destinationBody.appendListItem(
        element.asListItem()
      );
    } else if (
      type === DocumentApp.ElementType.PAGE_BREAK
    ) {
      destinationBody.appendPageBreak();
    } else if (
      type === DocumentApp.ElementType.HORIZONTAL_RULE
    ) {
      destinationBody.appendHorizontalRule();
    }
  }
}

function fileResponse_(file, mode, expectedName) {
  if (!file) {
    return jsonOutput_({
      ok: true,
      found: false,
      message: "ยังไม่พบไฟล์ " + expectedName,
    });
  }

  const metadata = {
    ok: true,
    found: true,
    fileId: file.getId(),
    fileName: file.getName(),
    size: file.getSize(),
    modifiedTime: file.getLastUpdated().toISOString(),
    mimeType: file.getMimeType(),
  };

  if (mode === "metadata") {
    return jsonOutput_(metadata);
  }

  if (mode !== "file") {
    throw new Error("mode ต้องเป็น metadata หรือ file");
  }

  return jsonOutput_({
    ...metadata,
    base64: Utilities.base64Encode(
      file.getBlob().getBytes()
    ),
  });
}

function parseMonth_(value) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    throw new Error("กรุณาระบุ month รูปแบบ YYYY-MM");
  }

  const [yearText, monthText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);

  return {
    year: year,
    month: month,
    buddhistYear: year + 543,
    monthName: THAI_MONTHS[month - 1],
  };
}

function findMonthFolder_(monthInfo) {
  const start = DriveApp.getFolderById(
    ATTENDANCE_REPORT_CONFIG.START_FOLDER_ID
  );

  if (start.getName() === monthInfo.monthName) {
    return start;
  }

  const directMonthFolders = start.getFoldersByName(
    monthInfo.monthName
  );

  if (directMonthFolders.hasNext()) {
    return directMonthFolders.next();
  }

  const yearName = "ปี " + monthInfo.buddhistYear;
  const yearFolder = findFolderRecursive_(
    start,
    yearName,
    0
  );

  if (yearFolder) {
    const monthFolders = yearFolder.getFoldersByName(
      monthInfo.monthName
    );

    if (monthFolders.hasNext()) {
      return monthFolders.next();
    }
  }

  return findFolderRecursive_(
    start,
    monthInfo.monthName,
    0
  );
}

function getOrCreateMonthFolder_(monthInfo) {
  const found = findMonthFolder_(monthInfo);

  if (found) {
    return found;
  }

  const start = DriveApp.getFolderById(
    ATTENDANCE_REPORT_CONFIG.START_FOLDER_ID
  );
  const yearName = "ปี " + monthInfo.buddhistYear;
  let yearFolder = null;

  if (start.getName() === yearName) {
    yearFolder = start;
  } else {
    yearFolder = findFolderRecursive_(start, yearName, 0);
  }

  if (!yearFolder) {
    yearFolder = start.createFolder(yearName);
  }

  const existingMonthFolders = yearFolder.getFoldersByName(
    monthInfo.monthName
  );

  if (existingMonthFolders.hasNext()) {
    return existingMonthFolders.next();
  }

  return yearFolder.createFolder(monthInfo.monthName);
}

function findFolderRecursive_(folder, targetName, depth) {
  if (
    depth > ATTENDANCE_REPORT_CONFIG.MAX_FOLDER_DEPTH
  ) {
    return null;
  }

  if (folder.getName() === targetName) {
    return folder;
  }

  const children = folder.getFolders();

  while (children.hasNext()) {
    const found = findFolderRecursive_(
      children.next(),
      targetName,
      depth + 1
    );

    if (found) {
      return found;
    }
  }

  return null;
}

function findFileRecursive_(
  folder,
  fileName,
  mimeType,
  depth
) {
  const direct = firstFileByNameAndMime_(
    folder,
    fileName,
    mimeType
  );

  if (direct) {
    return direct;
  }

  if (
    depth >= ATTENDANCE_REPORT_CONFIG.MAX_FOLDER_DEPTH
  ) {
    return null;
  }

  const children = folder.getFolders();

  while (children.hasNext()) {
    const found = findFileRecursive_(
      children.next(),
      fileName,
      mimeType,
      depth + 1
    );

    if (found) {
      return found;
    }
  }

  return null;
}

function firstFileByNameAndMime_(
  folder,
  name,
  mimeType
) {
  const files = folder.getFilesByName(name);

  while (files.hasNext()) {
    const file = files.next();

    if (file.getMimeType() === mimeType) {
      return file;
    }
  }

  return null;
}

function firstGoogleDocByName_(folder, name) {
  return firstFileByNameAndMime_(
    folder,
    name,
    MimeType.GOOGLE_DOCS
  );
}

function trashFilesByName_(folder, name) {
  const files = folder.getFilesByName(name);

  while (files.hasNext()) {
    files.next().setTrashed(true);
  }
}

function monthlyDocName_(info) {
  return (
    "บัญชีลงเวลาปฏิบัติราชการ_" +
    info.monthName +
    "_" +
    info.buddhistYear
  );
}

function monthlyPdfName_(info) {
  return monthlyDocName_(info) + ".pdf";
}

function weeklyPeriods_(monthInfo) {
  const daysInMonth = new Date(
    monthInfo.year,
    monthInfo.month,
    0
  ).getDate();

  return [
    { startDay: 1, endDay: Math.min(7, daysInMonth) },
    { startDay: 8, endDay: Math.min(14, daysInMonth) },
    { startDay: 15, endDay: Math.min(21, daysInMonth) },
    { startDay: 22, endDay: daysInMonth },
  ].filter(function (period) {
    return period.startDay <= period.endDay;
  });
}

function weeklyPeriodStatus_(monthFolder, monthInfo) {
  return weeklyPeriods_(monthInfo).map(function (period) {
    const fileName = weeklyPdfName_(
      monthInfo,
      period.startDay,
      period.endDay
    );
    const file = monthFolder
      ? firstFileByNameAndMime_(
          monthFolder,
          fileName,
          MimeType.PDF
        )
      : null;

    return {
      startDay: period.startDay,
      endDay: period.endDay,
      found: Boolean(file),
      fileName: file ? file.getName() : fileName,
    };
  });
}

function parseWeekRange_(e, monthInfo) {
  const daysInMonth = new Date(
    monthInfo.year,
    monthInfo.month,
    0
  ).getDate();
  const startDay = Number(e?.parameter?.startDay || 0);
  const endDay = Number(e?.parameter?.endDay || 0);
  const matchesPreset = weeklyPeriods_(monthInfo).some(
    function (period) {
      return (
        period.startDay === startDay &&
        period.endDay === endDay
      );
    }
  );

  if (
    !matchesPreset ||
    startDay < 1 ||
    endDay > daysInMonth ||
    startDay > endDay
  ) {
    throw new Error(
      "กรุณาระบุช่วงรายสัปดาห์เป็น 1-7, 8-14, 15-21 หรือ 22-สิ้นเดือน"
    );
  }

  return {
    startDay: startDay,
    endDay: endDay,
  };
}

function weeklyDocName_(info, startDay, endDay) {
  return (
    "บัญชีลงเวลาปฏิบัติราชการ_" +
    startDay +
    "-" +
    endDay +
    "_" +
    info.monthName +
    "_" +
    info.buddhistYear
  );
}

function weeklyPdfName_(info, startDay, endDay) {
  return weeklyDocName_(info, startDay, endDay) + ".pdf";
}

function pad2_(value) {
  return String(value).padStart(2, "0");
}

function jsonOutput_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function setupDailyPdfSecret() {
  const secret =
    Utilities.getUuid() +
    Utilities.getUuid().replace(/-/g, "");

  PropertiesService
    .getScriptProperties()
    .setProperty(
      ATTENDANCE_REPORT_CONFIG.SECRET_PROPERTY,
      secret
    );

  console.log("DAILY_PDF_SECRET=" + secret);
}

function testBuildMonthlyPdf() {
  const secret = PropertiesService
    .getScriptProperties()
    .getProperty(
      ATTENDANCE_REPORT_CONFIG.SECRET_PROPERTY
    );

  const result = doGet({
    parameter: {
      action: "buildMonthlyPdf",
      month: "2026-06",
      secret: secret,
    },
  });

  console.log(result.getContent());
}
