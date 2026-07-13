const STUDENT_PHOTO_SECRET = PropertiesService.getScriptProperties().getProperty("STUDENT_PHOTO_SECRET") || "1170310f-4546-4ea4-8f59-e53f646f3dbc35fd84e0-a634-43db-b5d5-f3d0e5d552e3";
const DEFAULT_STUDENT_PHOTO_ROOT_FOLDER_ID = "1VCUDQlK0LbSlJ5HIhKsCcO2SfC3ySmyM";

function doGet() {
  return json_({
    ok: true,
    service: "student-photo-upload",
  });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData && e.postData.contents ? e.postData.contents : "{}");
    authorize_(body.secret);

    if (body.action === "uploadStudentPhoto") {
      return json_(uploadStudentPhoto_(body));
    }

    if (body.action === "get") {
      return json_(getFile_(body));
    }

    if (body.action === "delete") {
      return json_(deleteFile_(body));
    }

    return json_({ ok: false, message: "Unknown action" });
  } catch (error) {
    return json_({
      ok: false,
      message: error && error.message ? error.message : String(error),
    });
  }
}

function authorize_(secret) {
  if (!STUDENT_PHOTO_SECRET) {
    throw new Error("Missing STUDENT_PHOTO_SECRET script property");
  }

  if (String(secret || "") !== STUDENT_PHOTO_SECRET) {
    throw new Error("Invalid secret");
  }
}

function uploadStudentPhoto_(body) {
  const rootFolderId = String(body.rootFolderId || DEFAULT_STUDENT_PHOTO_ROOT_FOLDER_ID);
  const fileName = safeFileName_(String(body.fileName || "student-photo"));
  const mimeType = String(body.mimeType || "application/octet-stream");
  const base64 = String(body.base64 || "");

  if (!base64) throw new Error("Missing file data");

  const root = DriveApp.getFolderById(rootFolderId);
  const folder = getOrCreatePath_(root, Array.isArray(body.folderPath) ? body.folderPath : []);
  const blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType, fileName);
  const file = folder.createFile(blob);

  if (body.description) {
    file.setDescription(String(body.description));
  }

  return {
    ok: true,
    fileId: file.getId(),
    fileUrl: file.getUrl(),
    folderId: folder.getId(),
    folderName: folder.getName(),
  };
}

function getFile_(body) {
  const fileId = String(body.fileId || "");
  if (!fileId) throw new Error("Missing fileId");

  const file = DriveApp.getFileById(fileId);
  const blob = file.getBlob();

  return {
    ok: true,
    fileId: file.getId(),
    fileName: file.getName(),
    mimeType: blob.getContentType(),
    base64: Utilities.base64Encode(blob.getBytes()),
  };
}

function deleteFile_(body) {
  const fileId = String(body.fileId || "");
  if (!fileId) throw new Error("Missing fileId");

  DriveApp.getFileById(fileId).setTrashed(true);

  return {
    ok: true,
    fileId,
  };
}

function getOrCreatePath_(root, path) {
  let folder = root;

  path.forEach(function (rawName) {
    const name = safeFolderName_(String(rawName || ""));
    if (!name) return;
    folder = getOrCreateChildFolder_(folder, name);
  });

  return folder;
}

function getOrCreateChildFolder_(parent, name) {
  const folders = parent.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : parent.createFolder(name);
}

function safeFolderName_(value) {
  return value
    .replace(/[\\/:*?"<>|#%{}~&]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function safeFileName_(value) {
  const clean = value
    .replace(/[\\/:*?"<>|#%{}~&]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);

  return clean || "student-photo";
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
