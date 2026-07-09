import "server-only";

import { createClient } from "@supabase/supabase-js";
import {
  currentBangkokDateKey,
  parseReportDateFromText,
  removeReportDateFromText,
} from "@/lib/attendance-report-date";

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
  const command = removeReportDateFromText(text)
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

export function getTelegramCommandDate(text: string) {
  return parseReportDateFromText(text);
}

export function buildHelpMessage() {
  return [
    "คำสั่ง Telegram Bot",
    "",
    "สรุป — รายงานการลงเวลาวันนี้",
    "สรุป 09-07-2569 — รายงานการลงเวลาของวันที่ระบุ",
    "ช่วยเหลือ — แสดงรายการคำสั่ง",
    "",
    "คำที่รองรับ:",
    "สรุปวันนี้, รายงาน, รายงานวันนี้, ลงเวลาวันนี้, สรุป 09-07-2569",
  ].join("\n");
}

type DailyProfile = {
  id: string;
  full_name: string;
  account_status: string;
};

type DailyAttendanceRecord = {
  user_id: string;
  check_in_at: string | null;
  check_in_status: string | null;
};

type DailyLeaveRequest = {
  user_id: string;
  leave_type: string;
};

type DailyOfficialDutyRequest = {
  user_id: string;
};

function formatBangkokCheckInTime(value: string | null) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

async function fetchDailyAttendance(
  requestOrigin: string,
  date: string
): Promise<unknown> {
  void requestOrigin;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase server environment variables are not configured"
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const [
    profilesResult,
    attendanceResult,
    leavesResult,
    officialDutyResult,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, account_status")
      .eq("account_status", "active"),
    supabase
      .from("attendance_records")
      .select("user_id, check_in_at, check_in_status")
      .eq("work_date", date),
    supabase
      .from("leave_requests")
      .select("user_id, leave_type")
      .in("status", ["pending", "approved"])
      .lte("start_date", date)
      .gte("end_date", date),
    supabase
      .from("official_duty_requests")
      .select("user_id")
      .in("status", ["pending", "approved"])
      .lte("duty_date", date)
      .or(`duty_end_date.is.null,duty_end_date.gte.${date}`),
  ]);

  if (profilesResult.error) {
    throw new Error(
      `daily profiles query failed: ${profilesResult.error.message}`
    );
  }

  if (attendanceResult.error) {
    throw new Error(
      `daily attendance query failed: ${attendanceResult.error.message}`
    );
  }

  if (leavesResult.error) {
    throw new Error(
      `daily leave query failed: ${leavesResult.error.message}`
    );
  }

  if (officialDutyResult.error) {
    throw new Error(
      `daily official duty query failed: ${officialDutyResult.error.message}`
    );
  }

  const profiles =
    (profilesResult.data ?? []) as DailyProfile[];
  const attendanceRecords =
    (attendanceResult.data ?? []) as DailyAttendanceRecord[];
  const leaves =
    (leavesResult.data ?? []) as DailyLeaveRequest[];
  const officialDuties =
    (officialDutyResult.data ?? []) as DailyOfficialDutyRequest[];

  const profileMap = new Map(
    profiles.map((profile) => [profile.id, profile])
  );

  const checkedInRecords = attendanceRecords.filter(
    (record) => record.check_in_at && profileMap.has(record.user_id)
  );

  const people = checkedInRecords
    .map((record) => {
      const profile = profileMap.get(record.user_id);

      return {
        fullName: profile?.full_name ?? "",
        checkInTime: formatBangkokCheckInTime(record.check_in_at),
        status:
          record.check_in_status === "late" ? "late" : "normal",
      };
    })
    .filter(
      (person) => person.fullName && person.checkInTime
    );

  const sick = leaves.filter(
    (leave) => leave.leave_type === "sick"
  ).length;
  const personal = leaves.filter(
    (leave) => leave.leave_type === "personal"
  ).length;
  const officialDuty = new Set(
    officialDuties.map((duty) => duty.user_id)
  ).size;
  const present = checkedInRecords.length;
  const late = checkedInRecords.filter(
    (record) => record.check_in_status === "late"
  ).length;
  const total = profiles.length;
  const absent = Math.max(
    total - present - sick - personal - officialDuty,
    0
  );

  return {
    total,
    present,
    late,
    sick,
    personal,
    officialDuty,
    absent,
    people,
  };
}

export async function buildSummaryMessage(
  requestOrigin: string,
  date = currentBangkokDateKey()
) {
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
            person.status === "late"
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

