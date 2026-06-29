const OFFICIAL_DUTY_ROOT_FOLDER_ID =
  PropertiesService.getScriptProperties().getProperty("OFFICIAL_DUTY_ROOT_FOLDER_ID");
const OFFICIAL_DUTY_SECRET =
  PropertiesService.getScriptProperties().getProperty("OFFICIAL_DUTY_SECRET");

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || "{}");

    if (!OFFICIAL_DUTY_SECRET || payload.secret !== OFFICIAL_DUTY_SECRET) {
      return json_({ ok: false, message: "Unauthorized" });
    }

    if (payload.action === "uploadOfficialDutyAttachment") {
      return json_(uploadOfficialDutyAttachment_(payload));
    }

    return json_({ ok: false, message: "Unknown action" });
  } catch (error) {
    return json_({
      ok: false,
      message: error && error.message ? error.message : String(error),
    });
  }
}

function uploadOfficialDutyAttachment_(payload) {
  if (!OFFICIAL_DUTY_ROOT_FOLDER_ID) {
    throw new Error("ยังไม่ได้ตั้งค่า OFFICIAL_DUTY_ROOT_FOLDER_ID");
  }

  const root = DriveApp.getFolderById(OFFICIAL_DUTY_ROOT_FOLDER_ID);
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

function getOrCreateFolder_(parent, name) {
  const folders = parent.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : parent.createFolder(name);
}

function sanitize_(value) {
  return String(value || "")
    .replace(/[\\/:*?"<>|#%{}~&]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function json_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
