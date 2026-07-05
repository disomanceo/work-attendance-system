const ATTENDANCE_REPORT_CONFIG = {
  // ใส่โฟลเดอร์หลัก, โฟลเดอร์ปี หรือโฟลเดอร์เดือนก็ได้
  START_FOLDER_ID: "1AMMUrclwyrnZnFUmQ5v3fsfUz9zWOHxl",
  SECRET_PROPERTY: "DAILY_PDF_SECRET",
  MAX_FOLDER_DEPTH: 4,
  // Google Docs ต้นฉบับรูปแบบราชการ
  DAILY_TEMPLATE_ID:
    "1XFEiaz3xRKVVXqQFkXpGk_Ts7oxEajElQe4VRkKvql0",
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

function doGet(e) {
  try {
    const action = String(e?.parameter?.action || "").trim();

    if (action === "health") {
      return jsonOutput_({
        ok: true,
        service: "attendance-report",
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

    if (action === "buildMonthlyPdf") {
      return handleBuildMonthlyPdf_(e);
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

    if (payload.action !== "buildDailyPdf") {
      return jsonOutput_({
        ok: false,
        message: "ไม่พบ action ที่ร้องขอ",
      });
    }

    verifySecretValue_(payload.secret);

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

  const monthFolder = findMonthFolder_(monthInfo);

  if (!monthFolder) {
    throw new Error("ไม่พบโฟลเดอร์ของเดือนที่เลือก");
  }

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

  const tables = body.getTables();

  if (tables.length === 0) {
    throw new Error(
      "Google Docs ต้นฉบับไม่มีตารางสำหรับกรอกข้อมูล"
    );
  }

  const table = tables[0];

  ensureTemplateRows_(
    table,
    ATTENDANCE_REPORT_CONFIG.DAILY_DATA_ROWS
  );

  clearTemplateDataRows_(
    table,
    ATTENDANCE_REPORT_CONFIG.DAILY_DATA_ROWS
  );

  rows
    .slice(
      0,
      ATTENDANCE_REPORT_CONFIG.DAILY_DATA_ROWS
    )
    .forEach(function (row, index) {
      const tableRow = table.getRow(index + 1);
      const values = [
        toThaiDigits_(row.order),
        row.fullName || "",
        row.position || "",
        row.checkIn || "",
        row.status || "",
        row.checkOut || "",
        row.signature || "",
        row.note || "",
      ];

      values.forEach(function (value, cellIndex) {
        if (cellIndex >= tableRow.getNumCells()) {
          return;
        }

        setTemplateCellText_(
          tableRow.getCell(cellIndex),
          String(value || ""),
          cellIndex
        );
      });
    });

  replaceNotes_(body, notes);
  replaceSummary_(body, summary);
  normalizeTemplateTypography_(body, table);

  document.saveAndClose();
  Utilities.sleep(1200);

  const pdfBlob = copiedFile
    .getAs(MimeType.PDF)
    .setName(pdfName);

  const pdfFile = monthFolder.createFile(pdfBlob);

  // สำเนา Google Docs เป็นไฟล์ชั่วคราว
  copiedFile.setTrashed(true);

  return jsonOutput_({
    ok: true,
    found: true,
    replaced: replaced,
    recordCount: rows.length,
    fileId: pdfFile.getId(),
    fileName: pdfFile.getName(),
    message: replaced
      ? "สร้าง PDF รายวันใหม่ตามต้นฉบับและแทนที่ไฟล์เดิมแล้ว"
      : "สร้าง PDF รายวันตามต้นฉบับเรียบร้อยแล้ว",
  });
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
    const text = paragraph.getText().trim();

    if (
      /[๐-๙0-9]{1,2}\s+[ก-๙]+\s+[๐-๙0-9]{4}/.test(
        text
      )
    ) {
      paragraph.setText(dateText);
      paragraph.setFontFamily("Sarabun");
      paragraph.setFontSize(14);
      paragraph.setBold(false);
      paragraph.setSpacingBefore(0);
      paragraph.setSpacingAfter(0);
      paragraph.setLineSpacing(1);
      paragraph.setAlignment(
        DocumentApp.HorizontalAlignment.CENTER
      );
      return;
    }
  }
}

function ensureTemplateRows_(table, targetRows) {
  while (table.getNumRows() < targetRows + 1) {
    const sourceRow = table.getRow(
      table.getNumRows() - 1
    );
    const newRow = table.appendTableRow();

    for (
      let index = 0;
      index < sourceRow.getNumCells();
      index += 1
    ) {
      const sourceCell = sourceRow.getCell(index);
      const newCell = newRow.appendTableCell("");
      newCell.setBackgroundColor(
        sourceCell.getBackgroundColor()
      );
      newCell.setVerticalAlignment(
        sourceCell.getVerticalAlignment()
      );
      newCell.setWidth(sourceCell.getWidth());
    }
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

  cell.setText(normalizedValue);

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

    if (text.indexOf("หมายเหตุ") === 0) {
      paragraph.setText(noteText);
      paragraph.setFontFamily("Sarabun");
      paragraph.setFontSize(14);
      return;
    }
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

      paragraph.setText(
        label +
          "          " +
          toThaiDigits_(values[label]) +
          "          คน"
      );
      paragraph.setFontFamily("Sarabun");
      paragraph.setFontSize(14);
      paragraph.setBold(false);
      paragraph.setSpacingBefore(0);
      paragraph.setSpacingAfter(0);
      paragraph.setLineSpacing(1);
      return true;
    });
  });
}


function formatThaiDocumentDate_(
  year,
  month,
  day
) {
  return (
    "วันที่ " +
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

function handleMonthStatus_(e) {
  const month = String(e?.parameter?.month || "").trim();
  const monthInfo = parseMonth_(month);
  const monthFolder = findMonthFolder_(monthInfo);

  if (!monthFolder) {
    return jsonOutput_({
      ok: true,
      dailyPdfDays: [],
      monthlyPdfFound: false,
      monthClosed: false,
      canCloseMonth: isMonthEnded_(monthInfo),
      message: "ไม่พบโฟลเดอร์ของเดือนที่เลือก",
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

  const monthClosed =
    Boolean(monthlyPdf) && dailyPdfDays.length === 0;

  return jsonOutput_({
    ok: true,
    dailyPdfDays: dailyPdfDays,
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
  const monthFolder = findMonthFolder_(monthInfo);

  if (!monthFolder) {
    throw new Error("ไม่พบโฟลเดอร์ของเดือนที่เลือก");
  }

  const daysInMonth = new Date(
    monthInfo.year,
    monthInfo.month,
    0
  ).getDate();

  const sourceDocs = [];
  const includedDays = [];
  const missingDays = [];

  for (let day = 1; day <= daysInMonth; day += 1) {
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
      "ยังไม่มี Google Docs รายวันสำหรับนำมารวมในเดือนนี้"
    );
  }

  const monthlyDocName = monthlyDocName_(monthInfo);
  const monthlyPdfName = monthlyPdfName_(monthInfo);

  trashFilesByName_(monthFolder, monthlyDocName);
  trashFilesByName_(monthFolder, monthlyPdfName);

  const destinationDocument = DocumentApp.create(monthlyDocName);
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
    .setName(monthlyPdfName);

  const pdfFile = monthFolder.createFile(pdfBlob);

  // Google Docs รวมเดือนเป็นไฟล์ชั่วคราว ลบทิ้งหลังแปลง PDF สำเร็จ
  DriveApp.getFileById(
    destinationDocument.getId()
  ).setTrashed(true);

  return jsonOutput_({
    ok: true,
    found: true,
    message:
      "สร้างรายงานรวมเดือนเรียบร้อยแล้ว จำนวน " +
      includedDays.length +
      " วัน",
    fileName: pdfFile.getName(),
    fileId: pdfFile.getId(),
    documentId: destinationDocument.getId(),
    includedDays: includedDays,
    missingDays: missingDays,
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
