import "server-only";

type UnknownRecord = Record<string, unknown>;

type TelegramAttendancePerson = {
  fullName: string;
  checkInTime: string;
  status: string;
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findNumber(value: unknown, keys: string[]): number | null {
  if (isRecord(value)) {
    for (const key of keys) {
      const candidate = value[key];

      if (typeof candidate === "number" && Number.isFinite(candidate)) {
        return candidate;
      }

      if (typeof candidate === "string") {
        const parsed = Number(candidate);

        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }

    for (const nestedValue of Object.values(value)) {
      const found = findNumber(nestedValue, keys);

      if (found !== null) {
        return found;
      }
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findNumber(item, keys);

      if (found !== null) {
        return found;
      }
    }
  }

  return null;
}

function findPeople(value: unknown): TelegramAttendancePerson[] {
  if (!isRecord(value) || !Array.isArray(value.people)) {
    return [];
  }

  return value.people
    .filter(isRecord)
    .map((person) => ({
      fullName:
        typeof person.fullName === "string"
          ? person.fullName.trim()
          : "",
      checkInTime:
        typeof person.checkInTime === "string"
          ? person.checkInTime.trim()
          : "",
      status:
        typeof person.status === "string"
          ? person.status.trim()
          : "",
    }))
    .filter(
      (person) =>
        Boolean(person.fullName) &&
        Boolean(person.checkInTime)
    )
    .sort((a, b) => {
      const timeCompare = a.checkInTime.localeCompare(
        b.checkInTime
      );

      if (timeCompare !== 0) {
        return timeCompare;
      }

      return a.fullName.localeCompare(b.fullName, "th");
    });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function getBangkokDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatThaiDate(date: string) {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00+07:00`));
}

function formatThaiTime() {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

export function normalizeTelegramCommand(text: string) {
  const command = text
    .trim()
    .toLowerCase()
    .replace(/^\/+/, "")
    .split("@")[0]
    .replace(/\s+/g, "");

  if (
    [
      "สรุป",
      "สรุปวันนี้",
      "รายงาน",
      "รายงานวันนี้",
      "รายงานลงเวลา",
      "สรุปการลงเวลา",
      "ลงเวลาวันนี้",
    ].includes(command)
  ) {
    return "summary";
  }

  if (
    [
      "ช่วยเหลือ",
      "คำสั่ง",
      "เมนู",
      "help",
      "start",
    ].includes(command)
  ) {
    return "help";
  }

  return "unknown";
}

export function buildHelpMessage() {
  return [
    "คำสั่ง Telegram Bot",
    "",
    "สรุป — รายงานการลงเวลาวันนี้",
    "ช่วยเหลือ — แสดงรายการคำสั่ง",
    "",
    "คำที่รองรับ:",
    "สรุปวันนี้, รายงาน, รายงานวันนี้, ลงเวลาวันนี้",
  ].join("\n");
}

async function fetchDailyAttendance(
  requestOrigin: string,
  date: string
): Promise<unknown> {
  const secret = process.env.DAILY_REPORT_SECRET?.trim();

  if (!secret) {
    throw new Error(
      "DAILY_REPORT_SECRET is not configured"
    );
  }

  const url = new URL(
    "/api/internal/daily-attendance",
    requestOrigin
  );

  url.searchParams.set("date", date);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "x-report-secret": secret,
    },
    cache: "no-store",
  });

  const payload = (await response.json()) as unknown;

  if (!response.ok) {
    throw new Error(
      `daily-attendance returned HTTP ${response.status}`
    );
  }

  return payload;
}

export async function buildSummaryMessage(
  requestOrigin: string
) {
  const date = getBangkokDate();
  const payload = await fetchDailyAttendance(
    requestOrigin,
    date
  );
  const people = findPeople(payload);

  const total =
    findNumber(payload, [
      "total",
      "totalPersonnel",
      "total_personnel",
      "totalMembers",
      "total_members",
      "all",
    ]) ?? 0;

  const present =
    findNumber(payload, [
      "present",
      "presentCount",
      "present_count",
      "working",
      "onTime",
      "on_time",
    ]) ?? 0;

  const late =
    findNumber(payload, [
      "late",
      "lateCount",
      "late_count",
    ]) ?? 0;

  const sick =
    findNumber(payload, [
      "sickLeave",
      "sick_leave",
      "sick",
      "sickCount",
      "sick_count",
    ]) ?? 0;

  const personal =
    findNumber(payload, [
      "personalLeave",
      "personal_leave",
      "personal",
      "personalCount",
      "personal_count",
    ]) ?? 0;

  const officialDuty =
    findNumber(payload, [
      "officialDuty",
      "official_duty",
      "officialDutyCount",
      "official_duty_count",
      "duty",
    ]) ?? 0;

  const absent =
    findNumber(payload, [
      "absent",
      "absentCount",
      "absent_count",
      "missing",
      "notPresent",
      "not_present",
    ]) ??
    Math.max(
      total -
        present -
        sick -
        personal -
        officialDuty,
      0
    );

  const normal = Math.max(present - late, 0);

  const personLines =
    people.length > 0
      ? people.map((person, index) => {
          const status =
            person.status === "มาสาย"
              ? " (มาสาย)"
              : "";

          return `${index + 1}. ${escapeHtml(
            person.checkInTime
          )} น. ${escapeHtml(
            person.fullName
          )}${status}`;
        })
      : ["ยังไม่มีผู้ลงเวลา"];

  return [
    "รายงานการลงเวลาปฏิบัติงาน",
    `${escapeHtml(formatThaiDate(date))} เวลา ${escapeHtml(
      formatThaiTime()
    )} น.`,
    "",
    ...personLines,
    "",
    "สรุป",
    `บุคลากรทั้งหมด ${total.toLocaleString("th-TH")} คน`,
    `ลงเวลาแล้ว ${present.toLocaleString("th-TH")} คน`,
    `มาปกติ ${normal.toLocaleString("th-TH")} คน`,
    `มาสาย ${late.toLocaleString("th-TH")} คน`,
    `ลาป่วย ${sick.toLocaleString("th-TH")} คน`,
    `ลากิจ ${personal.toLocaleString("th-TH")} คน`,
    `ไปราชการ ${officialDuty.toLocaleString("th-TH")} คน`,
    `ยังไม่ลงเวลา ${absent.toLocaleString("th-TH")} คน`,
  ].join("\n");
}
