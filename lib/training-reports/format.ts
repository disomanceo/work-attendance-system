export const TRAINING_REPORT_DRIVE_ROOT_FOLDER_ID =
  "1T_XN2LY3Qk4TMZoEvYWf-2OaKOzh1vXm";

export function text(value: unknown, fallback = "") {
  const next = String(value ?? "").trim();
  return next || fallback;
}

export function sanitizeDriveSegment(value: string, fallback: string) {
  const sanitized = text(value, fallback)
    .replace(/[<>:"/\\|?*\n\r]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

  return sanitized || fallback;
}

export function folderBookNumber(value: string) {
  return sanitizeDriveSegment(value.replace(/\//g, "-"), "no-book-number");
}

export function buddhistYearFromDate(value: string) {
  const match = value.match(/^(\d{4})-\d{2}-\d{2}$/);
  const christianYear = match ? Number(match[1]) : new Date().getFullYear();
  return christianYear + 543;
}

export function isoNow() {
  return new Date().toISOString();
}

export function validDate(value: string) {
  if (!value) return "";
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}
