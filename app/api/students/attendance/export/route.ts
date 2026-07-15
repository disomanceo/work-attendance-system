import { NextResponse } from "next/server";
import { STUDENT_CLASS_LEVELS } from "@/lib/students/settings";
import {
  loadStudentAccess,
  requireStudentAuth,
  studentDataClassLevels,
} from "@/lib/students/access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type AttendanceStatus = "present" | "late" | "leave" | "sick" | "personal" | "absent";

type ExportRequest = {
  classLevel?: unknown;
  month?: unknown;
  format?: unknown;
};

type StudentRow = {
  id: string;
  student_code?: string | null;
  full_name?: string | null;
};

type AttendanceRow = {
  student_id?: string | null;
  attendance_date?: string | null;
  status?: AttendanceStatus | string | null;
};

type ClassSettingRow = {
  adviser_profile_id?: string | null;
  adviser_profile_ids?: string[] | null;
};

type AdviserProfileRow = {
  id: string;
  full_name?: string | null;
  phone?: string | null;
  role?: string | null;
};

type SignerInfo = {
  name: string;
};

const DEFAULT_TEMPLATE_ID = "1PzumW4--bM2HJyA-PEoYaFeGpBFPm3YkzpxaMCOSHlo";
const DEFAULT_TEMPLATE_SHEET_ID = "995448101";
const DEFAULT_FOLDER_ID = "1_m6s1SpEJXoatUM9kqgu9j3rE-sQEVmx";
const SCHOOL_NAME = "โรงเรียนวัดไผ่มุ้ง";
const DIRECTOR_NAME = "นายสุธน พุทธรัตน์";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function isValidMonth(value: string) {
  return /^\d{4}-\d{2}$/.test(value);
}

function daysInMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const total = new Date(year, monthNumber, 0).getDate();
  return Array.from({ length: total }, (_, index) => index + 1);
}

function isoDateForDay(month: string, day: number) {
  return `${month}-${String(day).padStart(2, "0")}`;
}

function statusMark(value: unknown) {
  if (value === "absent") return "×";
  if (value === "leave" || value === "sick" || value === "personal") return "!";
  return "✓";
}

function countStatus(counts: { present: number; absent: number; leave: number; total: number }, value: unknown) {
  counts.total += 1;
  if (value === "absent") {
    counts.absent += 1;
  } else if (value === "leave" || value === "sick" || value === "personal") {
    counts.leave += 1;
  } else {
    counts.present += 1;
  }
}

function printStatusMark(value: unknown) {
  if (value === "absent") return "ข";
  if (value === "leave" || value === "sick" || value === "personal") return "ล";
  return "✓";
}

function studentNo(index: number) {
  return String(index + 1);
}

const studentCodeCollator = new Intl.Collator("th", {
  numeric: true,
  sensitivity: "base",
});

function compareStudents(left: StudentRow, right: StudentRow) {
  const leftCode = text(left.student_code);
  const rightCode = text(right.student_code);
  const codeCompare = studentCodeCollator.compare(leftCode, rightCode);

  if (codeCompare !== 0) return codeCompare;

  return studentCodeCollator.compare(text(left.full_name), text(right.full_name));
}

function academicYear(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const thaiYear = year + 543;
  return monthNumber >= 5 ? thaiYear : thaiYear - 1;
}

async function loadAdviserSigners(adminClient: any, classLevel: string): Promise<SignerInfo[]> {
  const { data: settings } = await adminClient
    .from("student_class_settings")
    .select("adviser_profile_id, adviser_profile_ids")
    .eq("class_level", classLevel)
    .eq("is_active", true);

  const ids = Array.from(
    new Set(
      ((settings ?? []) as ClassSettingRow[]).flatMap((setting) => [
        setting.adviser_profile_id,
        ...(Array.isArray(setting.adviser_profile_ids) ? setting.adviser_profile_ids : []),
      ]),
    ),
  ).filter((id): id is string => Boolean(id));

  if (ids.length === 0) return [];

  const { data: profiles } = await adminClient
    .from("profiles")
    .select("id, full_name, phone, role")
    .in("id", ids);

  const profileMap = new Map(
    ((profiles ?? []) as AdviserProfileRow[]).map((profile) => [
      profile.id,
      {
        name: profile.full_name || profile.phone || profile.id,
      },
    ]),
  );

  return ids.map((id) => profileMap.get(id)).filter((profile): profile is SignerInfo => Boolean(profile));
}

async function loadDirectorSigner(adminClient: any): Promise<SignerInfo | null> {
  const { data } = await adminClient
    .from("profiles")
    .select("id, full_name, phone, role")
    .in("role", ["director", "admin"])
    .eq("account_status", "active")
    .order("role", { ascending: false })
    .limit(5);

  const profiles = (data ?? []) as AdviserProfileRow[];
  const profile = profiles.find((row) => row.role === "director") || profiles[0] || null;
  if (!profile) return null;

  return {
    name: profile.full_name || profile.phone || DIRECTOR_NAME,
  };
}

export async function POST(request: Request) {
  const auth = await requireStudentAuth(request);
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => ({}))) as ExportRequest;
  const classLevel = text(body.classLevel);
  const month = text(body.month);
  const format = text(body.format) === "pdf" ? "pdf" : "sheet";

  if (!STUDENT_CLASS_LEVELS.includes(classLevel as any)) {
    return NextResponse.json({ ok: false, message: "กรุณาเลือกชั้นเรียนก่อนส่งออก" }, { status: 400 });
  }

  if (!isValidMonth(month)) {
    return NextResponse.json({ ok: false, message: "รูปแบบเดือนไม่ถูกต้อง" }, { status: 400 });
  }

  const access = await loadStudentAccess(auth.adminClient, auth.user.id, auth.profile);
  if (!studentDataClassLevels(access).includes(classLevel)) {
    return NextResponse.json({ ok: false, message: "คุณไม่มีสิทธิ์ส่งออกรายงานชั้นนี้" }, { status: 403 });
  }

  const gasUrl = process.env.GAS_STUDENT_ATTENDANCE_REPORT_URL?.trim();
  const secret = process.env.GAS_STUDENT_ATTENDANCE_REPORT_SECRET?.trim();

  if (!gasUrl || !secret) {
    return NextResponse.json(
      {
        ok: false,
        message: "ยังไม่ได้ตั้งค่า GAS_STUDENT_ATTENDANCE_REPORT_URL หรือ GAS_STUDENT_ATTENDANCE_REPORT_SECRET สำหรับสร้าง Sheet/PDF",
      },
      { status: 500 },
    );
  }

  const days = daysInMonth(month);
  const startDate = isoDateForDay(month, 1);
  const endDate = isoDateForDay(month, days.length);

  const [{ data: students, error: studentsError }, { data: records, error: recordsError }, adviserSigners, directorSigner] =
    await Promise.all([
      auth.adminClient
        .from("students")
        .select("id, student_code, full_name")
        .eq("class_level", classLevel)
        .eq("status", "active")
        .order("student_code", { ascending: true }),
      auth.adminClient
        .from("student_attendance")
        .select("student_id, attendance_date, status")
        .eq("class_level", classLevel)
        .gte("attendance_date", startDate)
        .lte("attendance_date", endDate),
      loadAdviserSigners(auth.adminClient, classLevel),
      loadDirectorSigner(auth.adminClient),
    ]);

  if (studentsError || recordsError) {
    console.error("Student attendance export load error:", studentsError || recordsError);
    return NextResponse.json({ ok: false, message: "โหลดข้อมูลสำหรับส่งออกไม่สำเร็จ" }, { status: 500 });
  }

  const recordMap = new Map(
    ((records ?? []) as AttendanceRow[]).map((record) => [
      `${record.student_id}:${record.attendance_date}`,
      record.status,
    ]),
  );

  const sortedStudents = [...((students ?? []) as StudentRow[])].sort(compareStudents);
  const rows = sortedStudents.map((student, index) => {
    const counts = { present: 0, absent: 0, leave: 0, total: 0 };
    const statuses = days.map((day) => {
      const status = recordMap.get(`${student.id}:${isoDateForDay(month, day)}`);
      if (!status) return "";
      countStatus(counts, status);
      return printStatusMark(status);
    });

    return {
      no: studentNo(index),
      name: student.full_name || "",
      statuses,
      presentCount: counts.present,
      absentCount: counts.absent,
      leaveCount: counts.leave,
      totalCount: counts.total,
    };
  });

  const response = await fetch(gasUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "studentAttendanceMonthlyReport",
      secret,
      format,
      templateId: process.env.STUDENT_ATTENDANCE_TEMPLATE_ID || DEFAULT_TEMPLATE_ID,
      templateSheetId: Number(process.env.STUDENT_ATTENDANCE_TEMPLATE_SHEET_ID || DEFAULT_TEMPLATE_SHEET_ID),
      folderId: process.env.STUDENT_ATTENDANCE_EXPORT_FOLDER_ID || DEFAULT_FOLDER_ID,
      schoolName: SCHOOL_NAME,
      directorName: directorSigner?.name || DIRECTOR_NAME,
      adviserName: adviserSigners.map((adviser) => adviser.name).join(", "),
      classLevel,
      month,
      academicYear: academicYear(month),
      days,
      rows,
    }),
    cache: "no-store",
  });

  const responseText = await response.text();
  let result: { ok?: boolean; message?: string; [key: string]: unknown } = {};

  try {
    result = JSON.parse(responseText);
  } catch {
    const shortText = responseText.replace(/\s+/g, " ").slice(0, 180);
    return NextResponse.json(
      {
        ok: false,
        message: `Google Apps Script ไม่ได้ตอบกลับเป็น JSON (${response.status}) ${shortText || "ไม่มีรายละเอียด"}`,
      },
      { status: response.ok ? 500 : response.status },
    );
  }

  if (!response.ok || result.ok === false) {
    return NextResponse.json(
      { ok: false, message: result.message || "สร้างไฟล์รายงานไม่สำเร็จ" },
      { status: response.ok ? 500 : response.status },
    );
  }

  return NextResponse.json({ ok: true, ...result });
}
