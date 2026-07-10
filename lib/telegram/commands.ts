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

type TelegramAttendanceNote = {
  fullName: string;
  note: string;
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
    .filter((person) => Boolean(person.fullName));
}

function findNotes(value: unknown): TelegramAttendanceNote[] {
  if (!isRecord(value) || !Array.isArray(value.notes)) {
    return [];
  }

  return value.notes
    .filter(isRecord)
    .map((item) => ({
      fullName:
        typeof item.fullName === "string"
          ? item.fullName.trim()
          : "",
      note:
        typeof item.note === "string"
          ? item.note.trim()
          : "",
    }))
    .filter((item) => Boolean(item.fullName) && Boolean(item.note));
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
      "เธชเธฃเธธเธ",
      "เธชเธฃเธธเธเธงเธฑเธเธเธตเน",
      "เธฃเธฒเธขเธเธฒเธ",
      "เธฃเธฒเธขเธเธฒเธเธงเธฑเธเธเธตเน",
      "เธฃเธฒเธขเธเธฒเธเธฅเธเน€เธงเธฅเธฒ",
      "เธชเธฃเธธเธเธเธฒเธฃเธฅเธเน€เธงเธฅเธฒ",
      "เธฅเธเน€เธงเธฅเธฒเธงเธฑเธเธเธตเน",
    ].includes(command)
  ) {
    return "summary";
  }

  if (
    [
      "เธเนเธงเธขเน€เธซเธฅเธทเธญ",
      "เธเธณเธชเธฑเนเธ",
      "เน€เธกเธเธน",
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
    "เธเธณเธชเธฑเนเธ Telegram Bot",
    "",
    "เธชเธฃเธธเธ โ€” เธฃเธฒเธขเธเธฒเธเธเธฒเธฃเธฅเธเน€เธงเธฅเธฒเธงเธฑเธเธเธตเน",
    "เธชเธฃเธธเธ 09-07-2569 โ€” เธฃเธฒเธขเธเธฒเธเธเธฒเธฃเธฅเธเน€เธงเธฅเธฒเธเธญเธเธงเธฑเธเธ—เธตเนเธฃเธฐเธเธธ",
    "เธเนเธงเธขเน€เธซเธฅเธทเธญ โ€” เนเธชเธ”เธเธฃเธฒเธขเธเธฒเธฃเธเธณเธชเธฑเนเธ",
    "",
    "เธเธณเธ—เธตเนเธฃเธญเธเธฃเธฑเธ:",
    "เธชเธฃเธธเธเธงเธฑเธเธเธตเน, เธฃเธฒเธขเธเธฒเธ, เธฃเธฒเธขเธเธฒเธเธงเธฑเธเธเธตเน, เธฅเธเน€เธงเธฅเธฒเธงเธฑเธเธเธตเน, เธชเธฃเธธเธ 09-07-2569",
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

  const profiles = (profilesResult.data ?? []) as DailyProfile[];
  const attendanceRecords =
    (attendanceResult.data ?? []) as DailyAttendanceRecord[];
  const leaves = (leavesResult.data ?? []) as DailyLeaveRequest[];
  const officialDuties =
    (officialDutyResult.data ?? []) as DailyOfficialDutyRequest[];

  const attendanceByUser = new Map(
    attendanceRecords.map((record) => [record.user_id, record])
  );
  const leaveByUser = new Map(
    leaves.map((leave) => [leave.user_id, leave.leave_type])
  );
  const officialDutyUserIds = new Set(
    officialDuties.map((duty) => duty.user_id)
  );

  const sortedProfiles = [...profiles].sort((a, b) =>
    a.full_name.localeCompare(b.full_name, "th")
  );

  const people = sortedProfiles.map((profile) => {
    const record = attendanceByUser.get(profile.id);

    return {
      fullName: profile.full_name,
      checkInTime: formatBangkokCheckInTime(record?.check_in_at ?? null),
      status:
        record?.check_in_at
          ? record.check_in_status === "late"
            ? "late"
            : "normal"
          : "",
    };
  });

  const notes = sortedProfiles.flatMap((profile) => {
    const leaveType = leaveByUser.get(profile.id);

    if (leaveType === "sick") {
      return [{ fullName: profile.full_name, note: "ลาป่วย" }];
    }

    if (leaveType === "personal") {
      return [{ fullName: profile.full_name, note: "ลากิจ" }];
    }

    if (officialDutyUserIds.has(profile.id)) {
      return [{ fullName: profile.full_name, note: "ไปราชการ" }];
    }

    return [];
  });

  const checkedInRecords = attendanceRecords.filter(
    (record) =>
      Boolean(record.check_in_at) &&
      profiles.some((profile) => profile.id === record.user_id)
  );
  const sick = leaves.filter(
    (leave) => leave.leave_type === "sick"
  ).length;
  const personal = leaves.filter(
    (leave) => leave.leave_type === "personal"
  ).length;
  const officialDuty = officialDutyUserIds.size;
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
    notes,
  };
}

export async function buildSummaryMessage(
  requestOrigin: string,
  date = currentBangkokDateKey()
) {
  const payload = await fetchDailyAttendance(requestOrigin, date);
  const people = findPeople(payload);
  const notes = findNotes(payload);

  const total =
    findNumber(payload, ["total", "totalPersonnel", "total_personnel"]) ?? 0;
  const present =
    findNumber(payload, ["present", "presentCount", "present_count"]) ?? 0;
  const sick =
    findNumber(payload, ["sick", "sickCount", "sick_count"]) ?? 0;
  const personal =
    findNumber(payload, ["personal", "personalCount", "personal_count"]) ?? 0;
  const officialDuty =
    findNumber(payload, [
      "officialDuty",
      "official_duty",
      "officialDutyCount",
      "official_duty_count",
    ]) ?? 0;
  const absent =
    findNumber(payload, ["absent", "absentCount", "absent_count"]) ??
    Math.max(total - present - sick - personal - officialDuty, 0);

  const personLines =
    people.length > 0
      ? people.map((person, index) => {
          const time = person.checkInTime || "-";
          const status =
            person.status === "late"
              ? "มาสาย"
              : person.status === "normal"
                ? "ปกติ"
                : "-";

          return `${index + 1}. ${escapeHtml(person.fullName)} | ${escapeHtml(
            time
          )} | ${status}`;
        })
      : ["ยังไม่มีรายชื่อบุคลากร"];

  const noteLines =
    notes.length > 0
      ? [
          "",
          "หมายเหตุ",
          ...notes.map(
            (item) =>
              `- ${escapeHtml(item.fullName)}: ${escapeHtml(item.note)}`
          ),
        ]
      : [];

  return [
    "📊 <b>สรุปการลงเวลา</b>",
    `วันที่ ${escapeHtml(formatThaiDate(date))}`,
    "",
    ...personLines,
    ...noteLines,
    "",
    `มาแล้ว ${present.toLocaleString("th-TH")} คน   ยังไม่ลงเวลา ${absent.toLocaleString("th-TH")} คน`,
    `ลาป่วย ${sick.toLocaleString("th-TH")} คน   ลากิจ ${personal.toLocaleString("th-TH")} คน`,
    `ไปราชการ ${officialDuty.toLocaleString("th-TH")} คน`,
  ].join("\n");
}

