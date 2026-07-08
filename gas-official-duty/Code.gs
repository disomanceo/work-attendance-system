/**
 * Work Attendance System - Official Duty Document Service
 *
 * Deploy as Web App:
 * - Execute as: Me
 * - Who has access: Anyone
 *
 * Script Properties required:
 * OFFICIAL_DUTY_SECRET = same value as Next.js OFFICIAL_DUTY_GAS_SECRET
 * OFFICIAL_DUTY_ROOT_FOLDER_ID = Google Drive root folder for generated files
 */

const OFFICIAL_DUTY_TEMPLATE_ID = "1wHOsch3E1IYmJbs8FbNHvgte6ziP-RNhJBLwZ583Iy4";
const OFFICIAL_DUTY_ROOT_FOLDER_ID =
  PropertiesService.getScriptProperties().getProperty("OFFICIAL_DUTY_ROOT_FOLDER_ID");
const OFFICIAL_DUTY_SECRET =
  PropertiesService.getScriptProperties().getProperty("OFFICIAL_DUTY_SECRET");
const OFFICIAL_DUTY_TIMEZONE = "Asia/Bangkok";

function doGet() {
  return json_({
    ok: true,
    service: "Work Attendance Official Duty Document Service",
    version: "2.1.1",
    timestamp: new Date().toISOString()
  });
}

function doPost(e) {
  try {
    const payload = parsePayload_(e);

    if (!OFFICIAL_DUTY_SECRET || payload.secret !== OFFICIAL_DUTY_SECRET) {
      return json_({ ok: false, message: "Unauthorized" });
    }

    switch (String(payload.action || "")) {
      case "uploadOfficialDutyAttachment":
        return json_(uploadOfficialDutyAttachment_(payload));

      case "officialDutyCreatePending":
        return json_(officialDutyCreatePending_(payload));

      case "officialDutyFinalize":
        return json_(officialDutyFinalize_(payload));

      case "officialDutyDiscardPending":
        return json_(officialDutyDiscardPending_(payload));

      case "officialDutyGetFile":
        return json_(officialDutyGetFile_(payload));

      default:
        return json_({ ok: false, message: "Unknown action" });
    }
  } catch (error) {
    console.error(error);
    return json_({
      ok: false,
      message: error && error.message ? error.message : String(error),
    });
  }
}

function officialDutyCreatePending_(payload) {
  requireFields_(payload, [
    "documentNumber",
    "fullName",
    "dutyDate",
    "dutyEndDate",
    "subject",
    "location",
    "applicantSignatureBase64"
  ]);

  const root = getRootFolder_();
  const yearFolder = getOrCreateFolder_(
    root,
    "ไปราชการ ปี พ.ศ. " + formatBuddhistYear_(payload.dutyDate || new Date())
  );
  const pendingRoot = getOrCreateFolder_(yearFolder, "รอพิจารณา");
  const safeNumber = sanitize_(payload.documentNumber);
  const safeName = sanitize_(payload.fullName);
  const requestFolder = pendingRoot.createFolder(
    safeNumber + " - " + safeName + " - " + Utilities.getUuid().slice(0, 8)
  );

  let workingFile = null;
  let attachmentFile = null;

  try {
    const templateFile = DriveApp.getFileById(OFFICIAL_DUTY_TEMPLATE_ID);
    workingFile = templateFile.makeCopy(
      "เอกสารชั่วคราวไปราชการ " + safeNumber + " " + safeName,
      requestFolder
    );

    const document = DocumentApp.openById(workingFile.getId());

    insertImageInDocument_(
      document,
      placeholderVariants_([
        "APPLICANT_SIGNATURE",
        "SIGNATURE_APPLICANT",
        "OFFICIAL_DUTY_APPLICANT_SIGNATURE",
        "ลายเซ็นผู้ลา",
        "ลายเซ็นผู้ยื่น",
        "ลายเซ็นผู้ขอ"
      ]),
      payload.applicantSignatureBase64,
      128
    );

    const attachmentDescription = payload.attachmentBase64
      ? (payload.evidenceDescription || "-")
      : "-";

    replaceFieldsInDocument_(document, [
      field_(["เลขที่ใบลา", "เลขที่ไปราชการ", "เลขที่เอกสาร", "DOCUMENT_NUMBER", "OFFICIAL_DUTY_NUMBER"], payload.documentNumber),
      field_(["วันที่ยื่น", "SUBMITTED_DATE", "REQUEST_DATE"], formatThaiLongDate_(payload.submittedAt || new Date())),
      field_(["วันที่ไป", "วันที่ไปราชการ", "DUTY_DATE", "OFFICIAL_DUTY_DATE"], formatThaiLongDate_(payload.dutyDate)),
      field_(["วันที่กลับ", "DUTY_END_DATE", "RETURN_DATE"], formatThaiLongDate_(payload.dutyEndDate)),
      field_(["จำนวนวัน", "TOTAL_DAYS"], String(payload.totalDays || "")),
      field_(["ชื่อผู้ลา", "ชื่อผู้ยื่น", "ชื่อผู้ขอ", "FULL_NAME", "APPLICANT_NAME"], payload.fullName),
      field_(["ตำแหน่ง", "POSITION", "APPLICANT_POSITION"], payload.position || ""),
      field_(["เรื่องไปราชการ", "เรื่อง", "SUBJECT"], payload.subject),
      field_(["สถานที่", "LOCATION", "PLACE"], payload.location),
      field_(["หมายเหตุ", "NOTE"], payload.note || "-"),
      field_(["หลักฐานไปราชการ", "หลักฐาน", "สิ่งที่แนบมาด้วย", "ATTACHMENT_DESCRIPTION", "ATTACHMENT"], attachmentDescription),
      field_(["ผลการพิจารณา", "ผลพิจารณา", "DECISION"], "รอพิจารณา"),
      field_(["ความคิดเห็นผู้อำนวยการ", "ความเห็นผู้อำนวยการ", "DIRECTOR_NOTE"], "")
    ]);

    if (payload.attachmentBase64) {
      const attachmentBlob = dataUrlToBlob_(
        payload.attachmentBase64,
        payload.attachmentName || "หลักฐานไปราชการ"
      );
      attachmentFile = requestFolder.createFile(attachmentBlob);
    }

    document.saveAndClose();

    return {
      ok: true,
      status: "pending",
      workingDocumentId: workingFile.getId(),
      workingDocumentUrl: workingFile.getUrl(),
      requestFolderId: requestFolder.getId(),
      attachmentFileId: attachmentFile ? attachmentFile.getId() : "",
      attachmentFileUrl: attachmentFile ? attachmentFile.getUrl() : "",
      attachmentFileName: attachmentFile ? attachmentFile.getName() : "",
      attachmentMimeType: attachmentFile ? attachmentFile.getMimeType() : ""
    };
  } catch (error) {
    safeTrashFile_(workingFile && workingFile.getId());
    safeTrashFile_(attachmentFile && attachmentFile.getId());
    safeTrashFolder_(requestFolder && requestFolder.getId());
    throw error;
  }
}

function officialDutyFinalize_(payload) {
  requireFields_(payload, [
    "workingDocumentId",
    "officialDutyNumber",
    "decision",
    "directorSignatureBase64"
  ]);

  const workingFile = DriveApp.getFileById(payload.workingDocumentId);
  const document = DocumentApp.openById(payload.workingDocumentId);

  insertImageInDocument_(
    document,
    placeholderVariants_([
      "DIRECTOR_SIGNATURE",
      "SIGNATURE_DIRECTOR",
      "OFFICIAL_DUTY_DIRECTOR_SIGNATURE",
      "ลายเซ็นผู้อำนวยการ",
      "ลายเซ็น ผอ.",
      "ลายเซ็นผู้พิจารณา"
    ]),
    payload.directorSignatureBase64,
    128,
    48
  );

  replaceFieldsInDocument_(document, [
    field_(["ชื่อผู้อำนวยการ", "ชื่อผู้พิจารณา", "DIRECTOR_NAME", "REVIEWER_NAME"], payload.directorName || ""),
    field_(["ตำแหน่งผู้อำนวยการ", "ตำแหน่งผู้พิจารณา", "DIRECTOR_POSITION", "REVIEWER_POSITION"], payload.directorPosition || ""),
    field_(["ความคิดเห็นผู้อำนวยการ", "ความเห็นผู้อำนวยการ", "DIRECTOR_NOTE", "REVIEWER_NOTE"], payload.directorNote || ""),
    field_(["ผลการพิจารณา", "ผลพิจารณา", "DECISION"], decisionLabel_(payload.decision)),
    field_(["วันที่พิจารณา", "วันที่อนุมัติ", "REVIEWED_DATE", "APPROVED_DATE"], formatThaiLongDate_(payload.reviewedAt || new Date()))
  ]);

  document.saveAndClose();

  const root = getRootFolder_();
  const yearFolder = getOrCreateFolder_(
    root,
    "ไปราชการ ปี พ.ศ. " + formatBuddhistYear_(payload.dutyDate || payload.reviewedAt || new Date())
  );
  const pdfFolder = getOrCreateFolder_(yearFolder, "PDF ไปราชการ");
  const pdfFileName =
    sanitize_(payload.officialDutyNumber) +
    " - " +
    sanitize_(payload.fullName || "official-duty") +
    " - " +
    sanitize_(decisionLabel_(payload.decision)) +
    ".pdf";

  const pdfBlob = workingFile.getAs(MimeType.PDF).setName(pdfFileName);
  const pdfFile = pdfFolder.createFile(pdfBlob);

  safeTrashFile_(payload.workingDocumentId);

  return {
    ok: true,
    status: "finalized",
    decision: payload.decision,
    pdfFileId: pdfFile.getId(),
    pdfFileUrl: pdfFile.getUrl(),
    pdfFileName: pdfFile.getName(),
    finalFolderId: pdfFolder.getId()
  };
}

function officialDutyDiscardPending_(payload) {
  safeTrashFile_(payload.workingDocumentId);
  safeTrashFile_(payload.attachmentFileId);
  safeTrashFolder_(payload.requestFolderId);

  return {
    ok: true,
    status: "discarded"
  };
}

function officialDutyGetFile_(payload) {
  if (!payload.fileId) {
    throw new Error("Missing fileId");
  }

  const file = DriveApp.getFileById(payload.fileId);
  const blob = file.getBlob();

  return {
    ok: true,
    fileName: file.getName(),
    mimeType: blob.getContentType(),
    base64: Utilities.base64Encode(blob.getBytes())
  };
}

function uploadOfficialDutyAttachment_(payload) {
  const root = getRootFolder_();
  const yearFolder = getOrCreateFolder_(root, String(payload.buddhistYear || ""));
  const safeName = sanitize_(payload.fullName || "ไม่ระบุชื่อ");
  const dateText = sanitize_(payload.dutyDate || "");
  const requestFolder = getOrCreateFolder_(
    yearFolder,
    dateText + "-" + safeName
  );

  const bytes = Utilities.base64Decode(String(payload.base64 || ""));
  const mimeType = String(payload.mimeType || "application/octet-stream");
  const originalName = sanitize_(payload.originalName || "เอกสารแนบ");
  const blob = Utilities.newBlob(bytes, mimeType, originalName);
  const file = requestFolder.createFile(blob);

  return {
    ok: true,
    fileId: file.getId(),
    fileUrl: file.getUrl(),
    fileName: file.getName(),
    mimeType: file.getMimeType(),
    folderId: requestFolder.getId(),
  };
}

function parsePayload_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error("Missing POST data");
  }

  try {
    return JSON.parse(e.postData.contents);
  } catch (error) {
    throw new Error("Invalid JSON");
  }
}

function requireFields_(payload, fields) {
  fields.forEach(function(field) {
    if (
      payload[field] === undefined ||
      payload[field] === null ||
      String(payload[field]).trim() === ""
    ) {
      throw new Error("Missing field: " + field);
    }
  });
}

function getRootFolder_() {
  if (!OFFICIAL_DUTY_ROOT_FOLDER_ID) {
    throw new Error("ยังไม่ได้ตั้งค่า OFFICIAL_DUTY_ROOT_FOLDER_ID");
  }

  return DriveApp.getFolderById(OFFICIAL_DUTY_ROOT_FOLDER_ID);
}

function getOrCreateFolder_(parent, name) {
  const folders = parent.getFoldersByName(String(name || "ไม่ระบุ"));
  return folders.hasNext() ? folders.next() : parent.createFolder(String(name || "ไม่ระบุ"));
}

function field_(aliases, value) {
  return {
    key: String(aliases[0]),
    aliases: placeholderVariants_(aliases),
    value: formatThaiText_(value === undefined || value === null ? "" : String(value))
  };
}

function placeholderVariants_(aliases) {
  const variants = [];

  aliases.forEach(function(alias) {
    const text = String(alias || "").trim();
    if (!text) return;

    variants.push("{{" + text + "}}");
    variants.push("{[" + text + "]}");
  });

  return variants;
}

function replaceFieldsInDocument_(document, fields) {
  const body = document.getBody();
  const report = {};

  fields.forEach(function(field) {
    let replaced = false;
    field.aliases.forEach(function(alias) {
      const pattern = escapeRegExp_(alias);
      const found = body.findText(pattern);
      if (found) replaced = true;
      body.replaceText(pattern, field.value);
    });
    report[field.key] = replaced;
  });

  return report;
}

function insertImageInDocument_(document, aliases, dataUrl, maxWidth, maxHeight) {
  if (!dataUrl) return false;

  const body = document.getBody();
  const blob = dataUrlToBlob_(dataUrl, "signature.png");

  for (let i = 0; i < aliases.length; i += 1) {
    const found = body.findText(escapeRegExp_(aliases[i]));
    if (!found) continue;

    const textElement = found.getElement().asText();
    const start = found.getStartOffset();
    const end = found.getEndOffsetInclusive();
    textElement.deleteText(start, end);

    const parent = textElement.getParent();
    const image = parent.insertInlineImage(
      Math.max(0, parent.getChildIndex(textElement) + 1),
      blob
    );
    resizeImage_(image, maxWidth || 150, maxHeight || 55);

    return true;
  }

  return false;
}

function resizeImage_(image, maxWidth, maxHeight) {
  const width = image.getWidth();
  const height = image.getHeight();

  if (!width || !height) return;

  const ratio = Math.min(maxWidth / width, maxHeight / height, 1);

  image.setWidth(Math.round(width * ratio));
  image.setHeight(Math.round(height * ratio));
}

function dataUrlToBlob_(dataUrl, fallbackName) {
  const value = String(dataUrl || "");
  const match = value.match(/^data:([^;]+);base64,(.+)$/);

  if (!match) {
    throw new Error("Invalid base64 data");
  }

  const mimeType = match[1];
  const bytes = Utilities.base64Decode(match[2]);

  return Utilities.newBlob(bytes, mimeType, sanitize_(fallbackName || "file"));
}

function decisionLabel_(decision) {
  return String(decision) === "approved" ? "อนุมัติ" : "ไม่อนุมัติ";
}

function formatThaiLongDate_(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return "";

  const day = Number(Utilities.formatDate(date, OFFICIAL_DUTY_TIMEZONE, "d"));
  const month = Number(Utilities.formatDate(date, OFFICIAL_DUTY_TIMEZONE, "M"));
  const year = Number(Utilities.formatDate(date, OFFICIAL_DUTY_TIMEZONE, "yyyy")) + 543;
  const months = [
    "",
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
    "ธันวาคม"
  ];

  return day + " " + months[month] + " " + year;
}

function formatBuddhistYear_(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return Utilities.formatDate(new Date(), OFFICIAL_DUTY_TIMEZONE, "yyyy");

  return String(date.getFullYear() + 543);
}

function formatThaiText_(value) {
  return String(value || "").replace(/[0-9]/g, function(digit) {
    return "๐๑๒๓๔๕๖๗๘๙".charAt(Number(digit));
  });
}

function sanitize_(value) {
  return String(value || "")
    .replace(/[\\/:*?"<>|#%{}~&]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp_(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeTrashFile_(fileId) {
  if (!fileId) return;
  try {
    DriveApp.getFileById(fileId).setTrashed(true);
  } catch (error) {
    console.error(error);
  }
}

function safeTrashFolder_(folderId) {
  if (!folderId) return;
  try {
    DriveApp.getFolderById(folderId).setTrashed(true);
  } catch (error) {
    console.error(error);
  }
}

function json_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
