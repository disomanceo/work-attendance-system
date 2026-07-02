const ORDER_ROOT_FOLDER_ID = PropertiesService.getScriptProperties()
  .getProperty("ORDER_ROOT_FOLDER_ID");
const ORDER_FILES_SECRET = PropertiesService.getScriptProperties()
  .getProperty("ORDER_FILES_SECRET");

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");

    if (!ORDER_FILES_SECRET || body.secret !== ORDER_FILES_SECRET) {
      return json_({ ok: false, message: "Unauthorized" });
    }

    if (body.action === "uploadOrderFile") {
      return json_(uploadOrderFile_(body));
    }

    if (body.action === "replaceOrderFile") {
      return json_(replaceOrderFile_(body));
    }

    if (body.action === "deleteOrderFiles") {
      return json_(deleteOrderFiles_(body));
    }

    return json_({ ok: false, message: "Unknown action" });
  } catch (error) {
    return json_({
      ok: false,
      message: error && error.message ? error.message : String(error),
    });
  }
}

function uploadOrderFile_(body) {
  const folder = getKindFolder_(body.buddhistYear, body.fileKind);
  const blob = Utilities.newBlob(
    Utilities.base64Decode(body.base64),
    body.mimeType,
    buildFileName_(body)
  );
  const file = folder.createFile(blob);

  file.setDescription(
    JSON.stringify({
      orderId: body.orderId,
      orderNumber: body.orderNumber,
      uploadedAt: new Date().toISOString(),
    })
  );

  return fileResponse_(file);
}

function replaceOrderFile_(body) {
  if (!body.fileId) {
    throw new Error("ไม่พบ File ID เดิม");
  }

  const fileName = buildFileName_(body);
  const blob = Utilities.newBlob(
    Utilities.base64Decode(body.base64),
    body.mimeType,
    fileName
  );

  Drive.Files.update(
    {
      title: fileName,
      description: JSON.stringify({
        orderId: body.orderId,
        orderNumber: body.orderNumber,
        replacedAt: new Date().toISOString(),
      }),
    },
    body.fileId,
    blob
  );

  const file = DriveApp.getFileById(body.fileId);
  return fileResponse_(file);
}

function deleteOrderFiles_(body) {
  const fileIds = Array.isArray(body.fileIds) ? body.fileIds : [];
  const deleted = [];
  const missing = [];

  fileIds.forEach(function(fileId) {
    const id = String(fileId || "").trim();
    if (!id) return;

    try {
      DriveApp.getFileById(id).setTrashed(true);
      deleted.push(id);
    } catch (error) {
      missing.push(id);
    }
  });

  return {
    ok: true,
    deletedCount: deleted.length,
    missingCount: missing.length,
  };
}

function getKindFolder_(year, kind) {
  if (!ORDER_ROOT_FOLDER_ID) {
    throw new Error("ยังไม่ได้ตั้งค่า ORDER_ROOT_FOLDER_ID");
  }

  const root = DriveApp.getFolderById(ORDER_ROOT_FOLDER_ID);
  const yearFolder = getOrCreateFolder_(root, String(year));
  return getOrCreateFolder_(yearFolder, String(kind).toUpperCase());
}

function getOrCreateFolder_(parent, name) {
  const folders = parent.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : parent.createFolder(name);
}

function buildFileName_(body) {
  const extension = String(body.fileKind).toUpperCase() === "DOCX"
    ? ".docx"
    : ".pdf";
  const safeNumber = String(body.orderNumber || "DRAFT").replace(/[\/\\]/g, "-");
  const safeSubject = String(body.subject || "คำสั่ง")
    .replace(/[<>:"\/\\|?*\n\r]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

  return "คำสั่งที่ " + safeNumber + " " + safeSubject + extension;
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
