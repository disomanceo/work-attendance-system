const SCHOOL_LIBRARY_ROOT_FOLDER_ID = PropertiesService.getScriptProperties()
  .getProperty("SCHOOL_LIBRARY_ROOT_FOLDER_ID");
const SCHOOL_LIBRARY_DRIVE_SECRET = PropertiesService.getScriptProperties()
  .getProperty("SCHOOL_LIBRARY_DRIVE_SECRET");

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");

    if (!SCHOOL_LIBRARY_DRIVE_SECRET || body.secret !== SCHOOL_LIBRARY_DRIVE_SECRET) {
      return json_({ ok: false, message: "Unauthorized" });
    }

    if (body.action === "uploadSchoolLibraryFile") {
      return json_(uploadSchoolLibraryFile_(body));
    }

    if (body.action === "deleteSchoolLibraryFile") {
      return json_(deleteSchoolLibraryFile_(body));
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
  if (value === "lesson-plan") return "แผนงานและโครงการ";
  if (value === "operation-plan") return "การจัดการเรียนการสอน";
  if (value === "forms") return "แบบฟอร์มต่างๆ";
  if (value === "research") return "ผลงานและรางวัล";
  if (value === "certificates") return "วุฒิบัตร-ใบประกาศ";
  return "อื่น ๆ";
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
