const BUDGET_CONFIG = Object.freeze({
  spreadsheetId: PropertiesService.getScriptProperties()
    .getProperty("BUDGET_SPREADSHEET_ID") || "",
  apiSecret: PropertiesService.getScriptProperties()
    .getProperty("BUDGET_API_SECRET") || "",
  attachmentFolderId: PropertiesService.getScriptProperties()
    .getProperty("BUDGET_ATTACHMENT_FOLDER_ID") || "",
  projectSheetName: "BUDGET_PROJECTS",
  activitySheetName: "BUDGET_ACTIVITIES",
  timezone: "Asia/Bangkok",
});
