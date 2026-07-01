/**
 * Work Attendance System - Memo Document Service
 *
 * Deploy as Web App:
 * - Execute as: Me
 * - Who has access: Anyone
 *
 * Script Properties required:
 * MEMO_DOCUMENT_SECRET = same value as Next.js MEMO_DOCUMENT_SECRET
 */

const MEMO_TEMPLATE_ID = "1HNEPxMMycUr7BN5HHLFPfJW3_aLFJhnH-2heFRTX6Zk";
const MEMO_ROOT_FOLDER_ID = "18verH1KzuaQwLJBSRBv2vUsEItFp9Y4K";
const MEMO_TIMEZONE = "Asia/Bangkok";

function doGet() {
  return jsonOutput_({
    ok: true,
    service: "Work Attendance Memo Document Service",
    version: "1.0.5",
    timestamp: new Date().toISOString()
  });
}

function doPost(e) {
  try {
    const payload = parsePayload_(e);
    verifySecret_(payload.secret);

    switch (String(payload.action || "")) {
      case "memoCreatePending":
        return jsonOutput_(memoCreatePending_(payload));

      case "memoFinalize":
        return jsonOutput_(memoFinalize_(payload));

      case "memoGetFile":
        return jsonOutput_(memoGetFile_(payload));

      case "memoDiscardPending":
        return jsonOutput_(memoDiscardPending_(payload));

      default:
        throw new Error("Unknown action");
    }
  } catch (error) {
    console.error(error);
    return jsonOutput_({
      ok: false,
      message: error && error.message
        ? error.message
        : "Google Apps Script error"
    });
  }
}

function memoCreatePending_(payload) {
  requireFields_(payload, [
    "documentNumber",
    "fullName",
    "subject",
    "reason",
    "memoText",
    "applicantSignatureBase64"
  ]);

  const rootFolder = DriveApp.getFolderById(MEMO_ROOT_FOLDER_ID);
  const yearFolder = getOrCreateFolder_(rootFolder, "บันทึกข้อความ ปี พ.ศ. " + formatBuddhistYear_(payload.submittedAt || new Date()));
  const pendingRoot = getOrCreateFolder_(yearFolder, "รอพิจารณา");
  const safeNumber = sanitizeFileName_(payload.documentNumber);
  const safeName = sanitizeFileName_(payload.fullName);

  let workingFile = null;

  try {
    const templateFile = DriveApp.getFileById(MEMO_TEMPLATE_ID);
    workingFile = templateFile.makeCopy(
      "Pending " + safeNumber + " " + safeName,
      pendingRoot
    );

    const document = DocumentApp.openById(workingFile.getId());

    insertImageInDocument_(
      document,
      placeholderVariants_([
        "APPLICANT_SIGNATURE",
        "SIGNATURE_APPLICANT",
        "MEMO_APPLICANT_SIGNATURE",
        "ลายเซ็นผู้ลา",
        "ลายเซ็นผู้ยื่น",
        "ลายเซ็นผู้บันทึก"
      ]),
      payload.applicantSignatureBase64,
      150
    );

    replaceFieldsInDocument_(document, [
      field_(["เลขที่ใบลา", "MEMO_NUMBER", "DOCUMENT_NUMBER", "เลขที่เอกสาร"], formatThaiText_(payload.documentNumber)),
      field_(["FULL_NAME", "APPLICANT_NAME", "ชื่อผู้ลา", "ชื่อผู้ยื่น"], payload.fullName),
      field_(["POSITION", "APPLICANT_POSITION", "ตำแหน่ง"], payload.position || ""),
      field_(["เรื่องบันทึกข้อความ", "SUBJECT", "MEMO_SUBJECT", "เรื่อง"], payload.subject),
      field_(["เหตุผลบันทึกข้อความ", "REASON", "MEMO_REASON", "เหตุผล"], payload.reason),
      field_(["จึงไม่สามารถ", "ด้วยเหตุนี้", "MEMO_TEXT", "BODY", "DETAIL", "รายละเอียด"], payload.memoText),
      field_(["หลักฐานบันทึกข้อความ", "หลักฐาน", "ATTACHMENT_DESCRIPTION", "ATTACHMENT", "สิ่งที่แนบมาด้วย"], payload.attachmentDescription || "-"),
      field_(["วันที่ยื่น", "SUBMITTED_DATE", "REQUEST_DATE"], formatThaiLongDate_(payload.submittedAt || new Date()))
    ]);

    document.saveAndClose();

    return {
      ok: true,
      status: "pending",
      workingDocumentId: workingFile.getId(),
      workingDocumentUrl: workingFile.getUrl()
    };
  } catch (error) {
    safeTrashFile_(workingFile && workingFile.getId());
    throw error;
  }
}

function memoFinalize_(payload) {
  requireFields_(payload, [
    "workingDocumentId",
    "memoNumber",
    "decision",
    "reviewerSignatureBase64"
  ]);

  const workingFile = DriveApp.getFileById(payload.workingDocumentId);
  const document = DocumentApp.openById(payload.workingDocumentId);

  insertImageInDocument_(
    document,
    placeholderVariants_([
      "REVIEWER_SIGNATURE",
      "DIRECTOR_SIGNATURE",
      "SIGNATURE_DIRECTOR",
      "MEMO_REVIEWER_SIGNATURE",
      "ลายเซ็นผู้อำนวยการ",
      "ลายเซ็นผู้พิจารณา"
    ]),
    payload.reviewerSignatureBase64,
    150
  );

  replaceFieldsInDocument_(document, [
    field_(["REVIEWER_NAME", "DIRECTOR_NAME", "ชื่อผู้อำนวยการ", "ชื่อผู้พิจารณา"], payload.reviewerName || ""),
    field_(["REVIEWER_POSITION", "DIRECTOR_POSITION", "ตำแหน่งผู้อำนวยการ", "ตำแหน่งผู้พิจารณา"], payload.reviewerPosition || ""),
    field_(["REVIEWER_NOTE", "DIRECTOR_NOTE", "ความคิดเห็นผู้อำนวยการ"], payload.reviewerNote || ""),
    field_(["ผลพิจารณา", "DECISION", "REVIEW_RESULT", "ผลการพิจารณา"], decisionLabel_(payload.decision)),
    field_(["วันที่พิจารณา", "REVIEWED_DATE", "APPROVED_DATE"], formatThaiLongDate_(payload.reviewedAt || new Date()))
  ]);

  document.saveAndClose();

  const rootFolder = DriveApp.getFolderById(MEMO_ROOT_FOLDER_ID);
  const yearFolder = getOrCreateFolder_(rootFolder, "บันทึกข้อความ ปี พ.ศ. " + formatBuddhistYear_(payload.reviewedAt || new Date()));
  const pdfFolder = getOrCreateFolder_(yearFolder, "PDF บันทึกข้อความ");
  const pdfFileName =
    sanitizeFileName_(payload.memoNumber) +
    " - " +
    sanitizeFileName_(payload.fullName || "memo") +
    " - " +
    sanitizeFileName_(decisionLabel_(payload.decision)) +
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

function memoGetFile_(payload) {
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

function memoDiscardPending_(payload) {
  safeTrashFile_(payload.workingDocumentId);

  return {
    ok: true,
    status: "discarded"
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

function verifySecret_(receivedSecret) {
  const expectedSecret = PropertiesService.getScriptProperties()
    .getProperty("MEMO_DOCUMENT_SECRET");

  if (!expectedSecret) {
    throw new Error("Missing Script Property: MEMO_DOCUMENT_SECRET");
  }

  if (!receivedSecret || String(receivedSecret) !== expectedSecret) {
    throw new Error("Invalid secret");
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

function getOrCreateFolder_(parentFolder, name) {
  const folders = parentFolder.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : parentFolder.createFolder(name);
}

function field_(aliases, value) {
  return {
    key: String(aliases[0]),
    aliases: placeholderVariants_(aliases),
    value: formatThaiText_(value === undefined || value === null ? "" : String(value))
  };
}

function placeholderVariants_(aliases) {
  const result = [];

  aliases.forEach(function(alias) {
    const text = String(alias).trim();
    if (!text) return;

    [
      "{{" + text + "}}",
      "[[" + text + "]]",
      "<<" + text + ">>",
      "«" + text + "»",
      "${" + text + "}",
      "%%" + text + "%%"
    ].forEach(function(value) {
      if (result.indexOf(value) === -1) result.push(value);
    });
  });

  return result;
}

function documentContainers_(document) {
  const containers = [document.getBody()];
  const header = document.getHeader();
  const footer = document.getFooter();

  if (header) containers.push(header);
  if (footer) containers.push(footer);

  return containers;
}

function replaceFieldsInDocument_(document, fields) {
  const report = {};
  const containers = documentContainers_(document);

  fields.forEach(function(field) {
    let count = 0;

    containers.forEach(function(container) {
      field.aliases.forEach(function(alias) {
        count += replaceAllText_(container, alias, field.value);
      });
    });

    report[field.key] = count;
  });

  return report;
}

function replaceAllText_(container, placeholder, value) {
  let count = 0;
  const pattern = escapeRegExp_(placeholder);
  let found = container.findText(pattern);

  while (found) {
    count += 1;
    found = container.findText(pattern, found);
  }

  if (count > 0) {
    container.replaceText(pattern, String(value));
  }

  return count;
}

function insertImageInDocument_(document, aliases, dataUrl, maxWidth) {
  const containers = documentContainers_(document);

  for (let i = 0; i < containers.length; i += 1) {
    if (insertDataImageAtPlaceholder_(containers[i], aliases, dataUrl, maxWidth)) {
      return true;
    }
  }

  return false;
}

function insertDataImageAtPlaceholder_(body, aliases, dataUrl, maxWidth) {
  if (!dataUrl) return false;

  const blob = dataUrlToBlob_(dataUrl, "signature.png");

  for (let i = 0; i < aliases.length; i += 1) {
    const found = body.findText(escapeRegExp_(aliases[i]));
    if (!found) continue;

    const text = found.getElement().asText();
    const paragraph = text.getParent().asParagraph();
    text.deleteText(found.getStartOffset(), found.getEndOffsetInclusive());

    const image = paragraph.appendInlineImage(blob);
    resizeImage_(image, maxWidth || 150);
    return true;
  }

  return false;
}

function dataUrlToBlob_(dataUrl, fileName) {
  const value = String(dataUrl || "");
  const match = value.match(/^data:([^;]+);base64,(.+)$/);
  const mimeType = match ? match[1] : "image/png";
  const base64 = match ? match[2] : value;
  const bytes = Utilities.base64Decode(base64);
  return Utilities.newBlob(bytes, mimeType, fileName || "file");
}

function resizeImage_(image, maxWidth) {
  if (!image || !maxWidth) return;

  const width = image.getWidth();
  const height = image.getHeight();

  if (width > maxWidth) {
    image.setWidth(maxWidth);
    image.setHeight(Math.round((height * maxWidth) / width));
  }
}

function safeTrashFile_(fileId) {
  if (!fileId) return;

  try {
    DriveApp.getFileById(fileId).setTrashed(true);
  } catch (error) {
    console.warn("Trash file failed", fileId, error);
  }
}

function sanitizeFileName_(value) {
  return String(value || "")
    .replace(/[\\/:*?"<>|#%{}~&]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "memo";
}

function decisionLabel_(decision) {
  const value = String(decision || "");
  if (value === "approved") return "อนุมัติ";
  if (value === "acknowledged") return "รับทราบ";
  if (value === "rejected") return "ไม่อนุมัติ";
  if (value === "revision") return "ส่งกลับแก้ไข";
  return value || "พิจารณาแล้ว";
}

function formatBuddhistYear_(value) {
  const date = value instanceof Date ? value : new Date(value);
  return String(Number(Utilities.formatDate(date, MEMO_TIMEZONE, "yyyy")) + 543);
}

function formatThaiLongDate_(value) {
  const date = value instanceof Date ? value : new Date(value);
  const day = Number(Utilities.formatDate(date, MEMO_TIMEZONE, "d"));
  const month = Number(Utilities.formatDate(date, MEMO_TIMEZONE, "M"));
  const year = Number(Utilities.formatDate(date, MEMO_TIMEZONE, "yyyy")) + 543;
  const monthNames = [
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

  return formatThaiText_(day + " " + monthNames[month] + " " + year);
}

function formatThaiText_(value) {
  return String(value === undefined || value === null ? "" : value)
    .replace(/[0-9]/g, function(digit) {
      return "๐๑๒๓๔๕๖๗๘๙".charAt(Number(digit));
    });
}

function escapeRegExp_(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function jsonOutput_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
