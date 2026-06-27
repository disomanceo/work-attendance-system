/**
 * Work Attendance System - Leave Document Service
 *
 * Deploy as Web App:
 * - Execute as: Me
 * - Who has access: Anyone
 *
 * Script Properties required:
 * LEAVE_DOCUMENT_SECRET = same value as Next.js LEAVE_DOCUMENT_SECRET
 */

const LEAVE_TEMPLATE_ID = "10OVGnzWgLrnRro04iw3Z2OUwIygWBpGYmA1xZ-r4aCo";
const LEAVE_ROOT_FOLDER_ID = "18verH1KzuaQwLJBSRBv2vUsEItFp9Y4K";
const LEAVE_TIMEZONE = "Asia/Bangkok";

function doGet() {
  return jsonOutput_({
    ok: true,
    service: "Work Attendance Leave Document Service",
    version: "4.2.0",
    timestamp: new Date().toISOString()
  });
}

function doPost(e) {
  try {
    const payload = parsePayload_(e);
    verifySecret_(payload.secret);

    switch (String(payload.action || "")) {
      case "leaveCreatePending":
        return jsonOutput_(leaveCreatePending_(payload));

      case "leaveFinalize":
        return jsonOutput_(leaveFinalize_(payload));

      case "leaveGetFile":
        return jsonOutput_(leaveGetFile_(payload));

      case "leaveDiscardPending":
        return jsonOutput_(leaveDiscardPending_(payload));

      default:
        throw new Error("ไม่รู้จัก action ที่ส่งมา");
    }
  } catch (error) {
    console.error(error);
    return jsonOutput_({
      ok: false,
      message: error && error.message
        ? error.message
        : "Google Apps Script เกิดข้อผิดพลาด"
    });
  }
}

function leaveCreatePending_(payload) {
  requireFields_(payload, [
    "fiscalYear",
    "fullName",
    "leaveType",
    "startDate",
    "endDate",
    "reason",
    "applicantSignatureBase64"
  ]);

  const rootFolder = DriveApp.getFolderById(LEAVE_ROOT_FOLDER_ID);
  const fiscalYear = String(payload.fiscalYear);
  const yearFolder = getOrCreateFolder_(rootFolder, "ปีงบประมาณ " + fiscalYear);
  const pendingRoot = getOrCreateFolder_(yearFolder, "เอกสารชั่วคราวรอพิจารณา");

  const leaveNumber = nextLeaveNumber_(payload.roleKey, fiscalYear);
  const safeNumber = sanitizeFileName_(leaveNumber);
  const safeName = sanitizeFileName_(payload.fullName);
  const requestFolder = pendingRoot.createFolder(
    safeNumber + " - " + safeName + " - " + Utilities.getUuid().slice(0, 8)
  );

  let workingFile = null;
  let evidenceFile = null;

  try {
    const templateFile = DriveApp.getFileById(LEAVE_TEMPLATE_ID);
    workingFile = templateFile.makeCopy(
      "เอกสารชั่วคราว " + safeNumber + " " + safeName,
      requestFolder
    );

    const document = DocumentApp.openById(workingFile.getId());

    const applicantSignatureInserted = insertImageInDocument_(
      document,
      placeholderVariants_([
        "APPLICANT_SIGNATURE",
        "SIGNATURE_APPLICANT",
        "ลายเซ็นผู้ลา",
        "ลายเซ็นผู้ยื่นลา"
      ]),
      payload.applicantSignatureBase64,
      150
    );

    const replacementReport = replaceFieldsInDocument_(document, [
      field_(
        ["LEAVE_NUMBER", "เลขใบลา", "เลขที่ใบลา"],
        leaveNumber
      ),
      field_(
        ["FULL_NAME", "ชื่อผู้ลา", "ชื่อ-นามสกุล", "ชื่อ นามสกุล", "ชื่อผู้ยื่นลา"],
        payload.fullName
      ),
      field_(["POSITION", "ตำแหน่ง", "ตำแหน่งผู้ลา"], payload.position || ""),
      field_(["LEAVE_TYPE", "ประเภทการลา", "ประเภทลา"], leaveTypeLabel_(payload.leaveType)),
      field_(["START_DATE", "วันที่เริ่มลา", "ตั้งแต่วันที่"], formatThaiDate_(payload.startDate)),
      field_(["END_DATE", "วันที่สิ้นสุด", "ถึงวันที่"], formatThaiDate_(payload.endDate)),
      field_(["TOTAL_DAYS", "จำนวนวันลา", "รวมวันลา"], String(payload.totalDays || "")),
      field_(["REASON", "เหตุผล", "เหตุผลการลา"], payload.reason),
      field_(["EVIDENCE_DESCRIPTION", "ใบรับรอง", "หลักฐาน", "ระบุหลักฐาน"], payload.evidenceBase64 ? (payload.evidenceDescription || payload.evidenceName || "หลักฐานการลา") : "-"),
      field_(["SUBMITTED_DATE", "วันที่ยื่น", "วันที่ยื่นใบลา"], formatThaiDateTime_(payload.submittedAt || new Date())),
      field_(["DIRECTOR_NOTE", "ความเห็นผู้อำนวยการ", "ความเห็น ผอ."], ""),
      field_(["DECISION", "ผลการพิจารณา", "คำสั่ง"], "รอพิจารณา")
    ]);

    const requiredMissing = [];
    if (!replacementReport.FULL_NAME) requiredMissing.push("ชื่อผู้ลา");
    if (!replacementReport.LEAVE_TYPE) requiredMissing.push("ประเภทการลา");
    if (!replacementReport.START_DATE) requiredMissing.push("วันที่เริ่มลา");
    if (!replacementReport.END_DATE) requiredMissing.push("วันที่สิ้นสุด");
    if (!replacementReport.REASON) requiredMissing.push("เหตุผล");

    if (requiredMissing.length > 0) {
      throw new Error(
        "แม่แบบไม่พบ Placeholder สำคัญ: " +
        requiredMissing.join(", ") +
        " กรุณาใช้รูปแบบเช่น {{ชื่อผู้ลา}} โดยต้องพิมพ์ Placeholder เป็นข้อความต่อเนื่องและไม่แบ่งสี/ฟอนต์กลางคำ"
      );
    }

    if (payload.evidenceBase64) {
      const evidenceBlob = dataUrlToBlob_(
        payload.evidenceBase64,
        payload.evidenceName || "หลักฐานการลา"
      );
      evidenceFile = requestFolder.createFile(evidenceBlob);

      appendEvidenceToDocument_(
        document.getBody(),
        evidenceBlob,
        payload.evidenceName || "หลักฐานการลา"
      );
    }

    document.saveAndClose();

    return {
      ok: true,
      status: "pending",
      leaveNumber: leaveNumber,
      workingDocumentId: workingFile.getId(),
      workingDocumentUrl: workingFile.getUrl(),
      requestFolderId: requestFolder.getId(),
      evidenceFileId: evidenceFile ? evidenceFile.getId() : "",
      evidenceFileUrl: evidenceFile ? evidenceFile.getUrl() : "",
      applicantSignatureInserted: applicantSignatureInserted,
      replacementReport: replacementReport
    };
  } catch (error) {
    safeTrashFile_(workingFile && workingFile.getId());
    safeTrashFile_(evidenceFile && evidenceFile.getId());
    safeTrashFolder_(requestFolder && requestFolder.getId());
    throw error;
  }
}

function leaveFinalize_(payload) {
  requireFields_(payload, [
    "workingDocumentId",
    "leaveNumber",
    "fiscalYear",
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
      "ลายเซ็นผู้อำนวยการ",
      "ลายเซ็น ผอ."
    ]),
    payload.directorSignatureBase64,
    150
  );

  const decisionText =
    String(payload.decision) === "approved" ? "อนุมัติ" : "ไม่อนุมัติ";

  replaceFieldsInDocument_(document, [
    field_(["DIRECTOR_NOTE", "ความเห็นผู้อำนวยการ", "ความเห็น ผอ."], payload.directorNote || ""),
    field_(["DECISION", "ผลการพิจารณา", "คำสั่ง"], decisionText),
    field_(["REVIEWED_DATE", "วันที่พิจารณา", "วันที่อนุมัติ"], formatThaiDateTime_(new Date()))
  ]);

  document.saveAndClose();

  const rootFolder = DriveApp.getFolderById(LEAVE_ROOT_FOLDER_ID);
  const yearFolder = getOrCreateFolder_(
    rootFolder,
    "ปีงบประมาณ " + String(payload.fiscalYear)
  );
  const pdfFolder = getOrCreateFolder_(yearFolder, "ใบลา PDF");

  const pdfFileName =
    sanitizeFileName_(payload.leaveNumber) +
    " - " +
    sanitizeFileName_(payload.fullName || "ผู้ลา") +
    " - " +
    decisionText +
    ".pdf";

  const pdfBlob = workingFile.getAs(MimeType.PDF).setName(pdfFileName);
  const pdfFile = pdfFolder.createFile(pdfBlob);

  safeTrashFile_(payload.workingDocumentId);
  safeTrashFile_(payload.evidenceFileId);
  safeTrashFolder_(payload.requestFolderId);

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

function leaveGetFile_(payload) {
  if (!payload.fileId) {
    throw new Error("ไม่พบ File ID");
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

function leaveDiscardPending_(payload) {
  safeTrashFile_(payload.workingDocumentId);
  safeTrashFile_(payload.evidenceFileId);
  safeTrashFolder_(payload.requestFolderId);

  return {
    ok: true,
    status: "discarded"
  };
}

function parsePayload_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error("ไม่พบข้อมูล POST");
  }

  try {
    return JSON.parse(e.postData.contents);
  } catch (error) {
    throw new Error("รูปแบบ JSON ไม่ถูกต้อง");
  }
}

function verifySecret_(receivedSecret) {
  const expectedSecret = PropertiesService.getScriptProperties()
    .getProperty("LEAVE_DOCUMENT_SECRET");

  if (!expectedSecret) {
    throw new Error(
      "ยังไม่ได้ตั้งค่า Script Property: LEAVE_DOCUMENT_SECRET"
    );
  }

  if (!receivedSecret || String(receivedSecret) !== expectedSecret) {
    throw new Error("Secret ไม่ถูกต้อง");
  }
}

function requireFields_(payload, fields) {
  fields.forEach(function(field) {
    if (
      payload[field] === undefined ||
      payload[field] === null ||
      String(payload[field]).trim() === ""
    ) {
      throw new Error("ข้อมูลไม่ครบ: " + field);
    }
  });
}

function nextLeaveNumber_(roleKey, fiscalYear) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const roleLabel = roleLabel_(roleKey);
    const propertyKey =
      "LEAVE_SEQUENCE_" + String(roleKey || "staff") + "_" + fiscalYear;

    const properties = PropertiesService.getScriptProperties();
    const current = Number(properties.getProperty(propertyKey) || "0");
    const next = current + 1;

    properties.setProperty(propertyKey, String(next));

    return roleLabel + " " + String(next).padStart(3, "0") + "/" + fiscalYear;
  } finally {
    lock.releaseLock();
  }
}

function roleLabel_(roleKey) {
  const labels = {
    teacher: "ครู",
    director: "ผอ.",
    admin: "เจ้าหน้าที่"
  };

  return labels[String(roleKey || "").toLowerCase()] || "บุคลากร";
}

function leaveTypeLabel_(leaveType) {
  return String(leaveType) === "sick" ? "ลาป่วย" : "ลากิจ";
}

function getOrCreateFolder_(parentFolder, name) {
  const folders = parentFolder.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : parentFolder.createFolder(name);
}

function field_(aliases, value) {
  return {
    key: String(aliases[0]),
    aliases: placeholderVariants_(aliases),
    value: value === undefined || value === null ? "" : String(value)
  };
}

function placeholderVariants_(aliases) {
  const result = [];

  aliases.forEach(function(alias) {
    const text = String(alias).trim();
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
  const pattern = escapeRegex_(placeholder);
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

function insertImageInDocument_(document, placeholders, dataUrl, maxWidth) {
  const containers = documentContainers_(document);

  for (let i = 0; i < containers.length; i += 1) {
    if (insertDataImageAtPlaceholder_(containers[i], placeholders, dataUrl, maxWidth)) {
      return true;
    }
  }

  return false;
}

function replaceAliases_(body, replacements) {
  Object.keys(replacements).forEach(function(key) {
    body.replaceText(
      escapeRegex_(key),
      String(replacements[key] === undefined ? "" : replacements[key])
    );
  });
}

function insertDataImageAtPlaceholder_(
  body,
  placeholders,
  dataUrl,
  maxWidth
) {
  if (!dataUrl) return false;

  const blob = dataUrlToBlob_(dataUrl, "signature.png");

  for (let i = 0; i < placeholders.length; i += 1) {
    const placeholder = placeholders[i];
    const found = body.findText(escapeRegex_(placeholder));

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

function appendEvidenceToDocument_(body, blob, fileName) {
  body.appendPageBreak();

  const heading = body.appendParagraph("หลักฐานการลา");
  heading.setHeading(DocumentApp.ParagraphHeading.HEADING2);

  body.appendParagraph(fileName || "หลักฐานการลา");

  const image = body.appendImage(blob);
  resizeImage_(image, 500);
}

function resizeImage_(image, maxWidth) {
  const width = image.getWidth();
  const height = image.getHeight();

  if (width > maxWidth) {
    const ratio = maxWidth / width;
    image.setWidth(Math.round(width * ratio));
    image.setHeight(Math.round(height * ratio));
  }
}

function dataUrlToBlob_(dataUrl, fileName) {
  const match = String(dataUrl).match(
    /^data:([^;]+);base64,(.+)$/s
  );

  if (!match) {
    throw new Error("ข้อมูลไฟล์ Base64 ไม่ถูกต้อง");
  }

  const mimeType = match[1];
  const bytes = Utilities.base64Decode(match[2]);
  return Utilities.newBlob(bytes, mimeType, fileName);
}

function formatThaiDate_(value) {
  const date = value instanceof Date
    ? value
    : new Date(String(value) + "T00:00:00+07:00");

  if (isNaN(date.getTime())) return String(value || "");

  const day = Utilities.formatDate(date, LEAVE_TIMEZONE, "d");
  const month = Number(
    Utilities.formatDate(date, LEAVE_TIMEZONE, "M")
  );
  const year = Number(
    Utilities.formatDate(date, LEAVE_TIMEZONE, "yyyy")
  ) + 543;

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

function formatThaiDateTime_(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return String(value || "");

  return (
    formatThaiDate_(date) +
    " เวลา " +
    Utilities.formatDate(date, LEAVE_TIMEZONE, "HH:mm") +
    " น."
  );
}

function sanitizeFileName_(value) {
  return String(value || "")
    .replace(/[\\/:*?"<>|#%{}~&]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex_(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeTrashFile_(fileId) {
  if (!fileId) return;

  try {
    DriveApp.getFileById(String(fileId)).setTrashed(true);
  } catch (error) {
    console.warn("ไม่สามารถลบไฟล์ชั่วคราวได้: " + fileId);
  }
}

function safeTrashFolder_(folderId) {
  if (!folderId) return;

  try {
    DriveApp.getFolderById(String(folderId)).setTrashed(true);
  } catch (error) {
    console.warn("ไม่สามารถลบโฟลเดอร์ชั่วคราวได้: " + folderId);
  }
}

function jsonOutput_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
