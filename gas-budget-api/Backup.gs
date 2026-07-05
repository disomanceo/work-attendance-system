function backupLegacyBudgetSheets() {
  const spreadsheet = getBudgetSpreadsheet_();
  const timezone = BUDGET_CONFIG.timezone || "Asia/Bangkok";
  const timestamp = Utilities.formatDate(
    new Date(),
    timezone,
    "yyyyMMdd-HHmmss"
  );

  const sheetNames = ["Projects", "Activities"];
  const backups = [];

  sheetNames.forEach(function (sheetName) {
    const sourceSheet = spreadsheet.getSheetByName(sheetName);

    if (!sourceSheet) {
      throw new Error("ไม่พบชีต " + sheetName);
    }

    const backupName = createUniqueBackupSheetName_(
      spreadsheet,
      sheetName + "_BACKUP_" + timestamp
    );

    const backupSheet = sourceSheet.copyTo(spreadsheet);
    backupSheet.setName(backupName);

    backups.push({
      source: sheetName,
      backup: backupName,
      rows: sourceSheet.getLastRow(),
      columns: sourceSheet.getLastColumn(),
    });
  });

  return {
    ok: true,
    spreadsheetId: spreadsheet.getId(),
    createdAt: new Date().toISOString(),
    backups: backups,
  };
}

function createUniqueBackupSheetName_(spreadsheet, preferredName) {
  const maxLength = 100;
  const baseName = String(preferredName || "BACKUP").slice(0, maxLength);

  if (!spreadsheet.getSheetByName(baseName)) {
    return baseName;
  }

  let sequence = 2;

  while (sequence < 1000) {
    const suffix = "_" + sequence;
    const candidate =
      baseName.slice(0, maxLength - suffix.length) + suffix;

    if (!spreadsheet.getSheetByName(candidate)) {
      return candidate;
    }

    sequence += 1;
  }

  throw new Error("ไม่สามารถสร้างชื่อชีตสำรองที่ไม่ซ้ำได้");
}
