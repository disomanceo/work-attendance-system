const SCHOOL_LIBRARY_ROOT_FOLDER_ID = PropertiesService.getScriptProperties()
  .getProperty("SCHOOL_LIBRARY_ROOT_FOLDER_ID");
const SCHOOL_LIBRARY_DRIVE_SECRET = PropertiesService.getScriptProperties()
  .getProperty("SCHOOL_LIBRARY_DRIVE_SECRET");
const TEACHING_SUPERVISION_DRIVE_SECRET = PropertiesService.getScriptProperties()
  .getProperty("TEACHING_SUPERVISION_DRIVE_SECRET") ||
  "teaching-supervision-2569-change-this-secret";

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");

    const isSchoolLibraryRequest =
      body.action === "uploadSchoolLibraryFile" ||
      body.action === "deleteSchoolLibraryFile";
    const isTeachingRequest =
      body.action === "uploadTeachingInspectionImage" ||
      body.action === "uploadTeachingInspectionPdf" ||
      body.action === "deleteTeachingInspectionFile" ||
      body.action === "getTeachingInspectionFileMetadata";

    if (
      isSchoolLibraryRequest &&
      (!SCHOOL_LIBRARY_DRIVE_SECRET || body.secret !== SCHOOL_LIBRARY_DRIVE_SECRET)
    ) {
      return json_({ ok: false, message: "Unauthorized" });
    }

    if (
      isTeachingRequest &&
      (!TEACHING_SUPERVISION_DRIVE_SECRET ||
        body.secret !== TEACHING_SUPERVISION_DRIVE_SECRET)
    ) {
      return json_({ ok: false, message: "Unauthorized" });
    }

    if (body.action === "uploadSchoolLibraryFile") {
      return json_(uploadSchoolLibraryFile_(body));
    }

    if (body.action === "deleteSchoolLibraryFile") {
      return json_(deleteSchoolLibraryFile_(body));
    }

    if (body.action === "uploadTeachingInspectionImage") {
      return json_(uploadTeachingInspectionImage_(body));
    }

    if (body.action === "uploadTeachingInspectionPdf") {
      return json_(uploadTeachingInspectionPdf_(body));
    }

    if (body.action === "deleteTeachingInspectionFile") {
      return json_(deleteTeachingInspectionFile_(body));
    }

    if (body.action === "getTeachingInspectionFileMetadata") {
      return json_(getTeachingInspectionFileMetadata_(body));
    }

    return json_({ ok: false, message: "Unknown action" });
  } catch (error) {
    return json_({
      ok: false,
      message: error && error.message ? error.message : String(error),
    });
  }
}

function uploadSchoolLibraryFile_(body) {
  if (!SCHOOL_LIBRARY_ROOT_FOLDER_ID) {
    throw new Error("Missing SCHOOL_LIBRARY_ROOT_FOLDER_ID");
  }

  const root = DriveApp.getFolderById(SCHOOL_LIBRARY_ROOT_FOLDER_ID);
  const yearFolder = getOrCreateFolder_(root, String(body.academicYear || "ไม่ระบุปี"));
  const categoryFolder = getOrCreateFolder_(yearFolder, categoryLabel_(body.category));
  const fileName = buildFileName_(body);
  const blob = Utilities.newBlob(
    Utilities.base64Decode(String(body.base64 || "")),
    String(body.mimeType || "application/octet-stream"),
    fileName
  );
  const file = categoryFolder.createFile(blob);

  file.setDescription(
    JSON.stringify({
      module: "school-library",
      category: body.category || "",
      uploadedBy: body.uploadedBy || "",
      uploadedAt: new Date().toISOString(),
    })
  );

  return fileResponse_(file);
}

function deleteSchoolLibraryFile_(body) {
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

function getOrCreateFolder_(parent, name) {
  const safeName = String(name || "อื่น ๆ").trim() || "อื่น ๆ";
  const folders = parent.getFoldersByName(safeName);
  return folders.hasNext() ? folders.next() : parent.createFolder(safeName);
}

function categoryLabel_(category) {
  const value = String(category || "");
  if (value === "administration-planning" || value === "operation-plan") return "บริหารและแผนงาน";
  if (value === "learning-management" || value === "lesson-plan") return "การจัดการเรียนรู้";
  if (value === "innovation-works" || value === "research" || value === "certificates") return "ผลงานและนวัตกรรม";
  if (value === "activities-pr") return "กิจกรรมและประชาสัมพันธ์";
  if (value === "support-donation") return "การสนับสนุนและบริจาค";
  if (value === "central-forms" || value === "forms") return "แบบฟอร์มและเอกสารกลาง";
  return "อื่น ๆ";
}

function uploadTeachingInspectionImage_(body) {
  const folder = getTeachingInspectionFolder_(body, "รูปภาพ");
  const slot = String(body.slot || "").padStart(2, "0");
  const extension = extensionFromName_(body.originalName, ".jpg");
  const fileName = slot + "_" + sanitizeName_(body.category || "ภาพหลักฐาน") + extension;
  const file = createTeachingFile_(folder, body, fileName);

  file.setDescription(
    JSON.stringify({
      module: "teaching-supervision",
      type: "image",
      inspectionId: body.inspectionId || "",
      category: body.category || "",
      slot: body.slot || "",
      uploadedAt: new Date().toISOString(),
    })
  );

  return teachingFileResponse_(file, folder);
}

function uploadTeachingInspectionPdf_(body) {
  const existingFileId = String(body.existingFileId || "").trim();
  if (existingFileId) {
    try {
      DriveApp.getFileById(existingFileId).setTrashed(true);
    } catch (error) {
      // The old report may already be removed; continue with the new report.
    }
  }
  const folder = getTeachingInspectionFolder_(body, "รายงาน PDF");
  const dateLabel = String(body.inspectionDate || "")
    .replace(/-/g, "")
    .trim() || Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyyMMdd");
  const fileName =
    "รายงานนิเทศ_" + sanitizeName_(body.teacherName || "teacher") + "_" + dateLabel + ".pdf";
  const file = createTeachingFile_(folder, body, fileName);

  file.setDescription(
    JSON.stringify({
      module: "teaching-supervision",
      type: "pdf",
      inspectionId: body.inspectionId || "",
      teacherName: body.teacherName || "",
      generatedAt: new Date().toISOString(),
    })
  );

  return teachingFileResponse_(file, folder);
}

function deleteTeachingInspectionFile_(body) {
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

function getTeachingInspectionFileMetadata_(body) {
  const fileId = String(body.fileId || "").trim();
  if (!fileId) {
    throw new Error("Missing fileId");
  }

  const file = DriveApp.getFileById(fileId);
  return {
    ok: true,
    fileId: file.getId(),
    fileUrl: file.getUrl(),
    fileName: file.getName(),
    mimeType: file.getMimeType(),
    fileSize: file.getSize(),
  };
}

function getTeachingInspectionFolder_(body, kind) {
  const rootFolderId = String(body.rootFolderId || "").trim();
  if (!rootFolderId) {
    throw new Error("Missing teaching supervision rootFolderId");
  }

  const inspectionId = String(body.inspectionId || "").trim();
  if (!inspectionId) {
    throw new Error("Missing inspectionId");
  }

  const root = DriveApp.getFolderById(rootFolderId);
  const year = String(body.buddhistYear || buddhistYearFromDate_(body.inspectionDate));
  const yearFolder = getOrCreateFolder_(root, year);
  const kindFolder = getOrCreateFolder_(yearFolder, kind);
  return getOrCreateFolder_(kindFolder, inspectionId);
}

function createTeachingFile_(folder, body, fileName) {
  const base64 = String(body.base64 || "");
  if (!base64) {
    throw new Error("Missing base64 file content");
  }

  const blob = Utilities.newBlob(
    Utilities.base64Decode(base64),
    String(body.mimeType || "application/octet-stream"),
    fileName
  );

  return folder.createFile(blob);
}

function buddhistYearFromDate_(value) {
  const text = String(value || "");
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return Number(Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyy")) + 543;
  }

  return Number(match[1]) + 543;
}

function extensionFromName_(name, fallback) {
  const text = String(name || "");
  const dot = text.lastIndexOf(".");
  return dot >= 0 ? text.slice(dot) : fallback;
}

function sanitizeName_(value) {
  return String(value || "ไม่ระบุ")
    .replace(/[<>:"\/\\|?*\n\r]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160) || "ไม่ระบุ";
}

function teachingFileResponse_(file, folder) {
  return {
    ok: true,
    fileId: file.getId(),
    folderId: folder.getId(),
    fileUrl: file.getUrl(),
    fileName: file.getName(),
    mimeType: file.getMimeType(),
    fileSize: file.getSize(),
  };
}

function buildFileName_(body) {
  const originalName = String(body.originalName || "document").trim();
  const dot = originalName.lastIndexOf(".");
  const extension = dot >= 0 ? originalName.slice(dot) : "";
  const title = String(body.title || originalName)
    .replace(/[<>:"\/\\|?*\n\r]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);

  return title + "-" + Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyyMMdd-HHmmss") + extension;
}

function fileResponse_(file) {
  return {
    ok: true,
    fileId: file.getId(),
    fileUrl: file.getUrl(),
    fileName: file.getName(),
    mimeType: file.getMimeType(),
  };
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
