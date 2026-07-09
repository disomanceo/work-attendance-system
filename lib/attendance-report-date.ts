export function currentBangkokDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function toArabicDigits(value: string) {
  const thaiDigits = "๐๑๒๓๔๕๖๗๘๙";

  return value.replace(/[๐-๙]/g, (digit) =>
    String(thaiDigits.indexOf(digit))
  );
}

function validDate(year: number, month: number, day: number) {
  const date = new Date(year, month - 1, day, 12, 0, 0);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function dateKey(year: number, month: number, day: number) {
  const christianYear = year > 2400 ? year - 543 : year;

  if (!validDate(christianYear, month, day)) return "";

  return [
    String(christianYear).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

export function parseReportDateFromText(value: string) {
  const normalized = toArabicDigits(value);
  const thaiDate = normalized.match(
    /(?:^|\s)(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?=\s|$)/
  );

  if (thaiDate) {
    return dateKey(
      Number(thaiDate[3]),
      Number(thaiDate[2]),
      Number(thaiDate[1])
    );
  }

  const isoDate = normalized.match(
    /(?:^|\s)(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?=\s|$)/
  );

  if (isoDate) {
    return dateKey(
      Number(isoDate[1]),
      Number(isoDate[2]),
      Number(isoDate[3])
    );
  }

  return "";
}

export function removeReportDateFromText(value: string) {
  return toArabicDigits(value)
    .replace(/(?:^|\s)\d{1,2}[-/]\d{1,2}[-/]\d{4}(?=\s|$)/, " ")
    .replace(/(?:^|\s)\d{4}[-/]\d{1,2}[-/]\d{1,2}(?=\s|$)/, " ")
    .trim();
}
