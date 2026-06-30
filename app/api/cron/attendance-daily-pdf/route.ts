import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AttendanceRecord = {
  id: string;
  user_id: string;
  work_date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  check_in_status: string | null;
  check_out_status: string | null;
  note: string | null;
};

type Profile = {
  id: string;
  full_name: string;
  position: string | null;
  role: string;
  account_status: string;
};

type AttendanceSettings = {
  director_end_time?: string | null;
  teacher_end_time?: string | null;
  staff_end_time?: string | null;
  janitor_end_time?: string | null;
};

type LeaveRequest = {
  id: string;
  user_id: string;
  leave_type: "personal" | "sick" | string;
  start_date: string;
  end_date: string;
  reason: string | null;
};

type OfficialDutyRequest = {
  id: string;
  user_id: string;
  duty_date: string;
  reason: string | null;
};

type GasPdfResponse = {
  ok: boolean;
  message?: string;
  fileName?: string;
  replaced?: boolean;
  recordCount?: number;
};

function getBangkokDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatThaiTime(value: string | null) {
  if (!value) return "";

  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function getRoleLabel(role: string) {
  const labels: Record<string, string> = {
    admin: "ผู้ดูแลระบบ",
    director: "ผู้บริหาร",
    teacher: "ครู",
    staff: "เจ้าหน้าที่",
    janitor: "ภารโรง",
  };

  return labels[role] ?? role ?? "";
}

function normalizeTime(value: string | null | undefined, fallback: string) {
  const match = value?.trim().match(/^(\d{1,2}):(\d{2})/);

  if (!match) return fallback;

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return fallback;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function getRoleEndTime(role: string, settings: AttendanceSettings | null) {
  const normalizedRole = role.trim().toLowerCase();

  if (normalizedRole === "janitor") {
    return normalizeTime(settings?.janitor_end_time, "18:00");
  }

  if (normalizedRole === "director" || normalizedRole === "admin") {
    return normalizeTime(settings?.director_end_time, "16:30");
  }

  if (normalizedRole === "teacher") {
    return normalizeTime(settings?.teacher_end_time, "16:30");
  }

  return normalizeTime(settings?.staff_end_time, "16:30");
}

function attendanceStatus(record: AttendanceRecord) {
  if (!record.check_in_at) return "";
  if (record.check_in_status === "late") return "มาสาย";
  if (record.check_out_status === "early") return "ออกก่อนเวลา";
  return "ปกติ";
}

function reportAttendanceStatus(record: AttendanceRecord) {
  if (!record.check_in_at) return "";
  if (record.check_in_status === "late") return "มาสาย";
  if (record.check_out_status === "early") return "ออกก่อนเวลา";
  return "ปกติ";
}

function leaveLabel(leaveType: string) {
  return leaveType === "sick" ? "ลาป่วย" : "ลากิจ";
}

function getAbsenceReason(
  profileId: string,
  leaveByUser: Map<string, LeaveRequest>,
  officialDutyByUser: Map<string, OfficialDutyRequest>
) {
  const leave = leaveByUser.get(profileId);

  if (leave) {
    const label = leaveLabel(leave.leave_type);
    return leave.reason?.trim()
      ? `${label}: ${leave.reason.trim()}`
      : label;
  }

  const officialDuty = officialDutyByUser.get(profileId);

  if (officialDuty) {
    return officialDuty.reason?.trim()
      ? `ไปราชการ: ${officialDuty.reason.trim()}`
      : "ไปราชการ";
  }

  return "";
}

function getAbsenceLabel(status: string) {
  if (status === "sick") return "ลาป่วย";
  if (status === "personal") return "ลากิจ";
  if (status === "official_duty") return "ไปราชการ";
  return "ไม่มาปฏิบัติราชการ";
}

function formatLateReason(note: string | null) {
  if (!note) return "";

  return note
    .trim()
    .replace(/^ขออนุญาตมาสาย\s*/u, "")
    .replace(/^เนื่องจาก\s*/u, "")
    .replace(/^เพราะ\s*/u, "")
    .trim();
}

export async function GET(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const authorization = request.headers.get("authorization");

    if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { ok: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const gasUrl = process.env.GAS_DAILY_PDF_API_URL;
    const gasSecret = process.env.GAS_DAILY_PDF_SECRET;

    if (!supabaseUrl || !serviceRoleKey || !gasUrl || !gasSecret) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Environment Variables สำหรับ Supabase หรือ GAS ยังไม่ครบ",
        },
        { status: 500 }
      );
    }

    const today = getBangkokDate();
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: attendanceData, error: attendanceError } =
      await supabase
        .from("attendance_records")
        .select(
          `
            id,
            user_id,
            work_date,
            check_in_at,
            check_out_at,
            check_in_status,
            check_out_status,
            note
          `
        )
        .eq("work_date", today)
        .order("check_in_at", {
          ascending: true,
          nullsFirst: false,
        });

    if (attendanceError) {
      throw new Error(
        "ไม่สามารถโหลดข้อมูลการลงเวลาประจำวันได้"
      );
    }

    const { data: profileData, error: profileError } =
      await supabase
        .from("profiles")
        .select("id, full_name, position, role, account_status")
        .eq("account_status", "active")
        .order("full_name", { ascending: true });

    if (profileError) {
      throw new Error("ไม่สามารถโหลดข้อมูลบุคลากรได้");
    }

    const attendance =
      (attendanceData ?? []) as AttendanceRecord[];
    const { data: settingsData } = await supabase
      .from("attendance_settings")
      .select("director_end_time, teacher_end_time, staff_end_time, janitor_end_time")
      .eq("id", 1)
      .maybeSingle();

    const [
      { data: leaveData, error: leaveError },
      { data: officialDutyData, error: officialDutyError },
    ] = await Promise.all([
      supabase
        .from("leave_requests")
        .select("id, user_id, leave_type, start_date, end_date, reason")
        .in("status", ["pending", "approved"])
        .lte("start_date", today)
        .gte("end_date", today),
      supabase
        .from("official_duty_requests")
        .select("id, user_id, duty_date, reason")
        .in("status", ["pending", "approved"])
        .eq("duty_date", today),
    ]);

    if (leaveError) {
      throw new Error("ไม่สามารถโหลดข้อมูลการลาประจำวันได้");
    }

    if (officialDutyError) {
      throw new Error("ไม่สามารถโหลดข้อมูลไปราชการประจำวันได้");
    }

    const settings = (settingsData ?? null) as AttendanceSettings | null;
    const profiles = (profileData ?? []) as Profile[];
    const leaveRequests = (leaveData ?? []) as LeaveRequest[];
    const officialDutyRequests =
      (officialDutyData ?? []) as OfficialDutyRequest[];

    const profileMap = new Map(
      profiles.map((profile) => [profile.id, profile])
    );

    const attendanceMap = new Map(
      attendance.map((record) => [record.user_id, record])
    );
    const leaveByUser = new Map(
      leaveRequests.map((request) => [request.user_id, request])
    );
    const officialDutyByUser = new Map(
      officialDutyRequests.map((request) => [request.user_id, request])
    );

    const presentRecords = attendance
      .filter((record) => Boolean(record.check_in_at))
      .sort((a, b) =>
        (a.check_in_at ?? "9999").localeCompare(
          b.check_in_at ?? "9999"
        )
      );

    const rows = presentRecords.map((record, index) => {
      const profile = profileMap.get(record.user_id);
      const scheduledEndTime = getRoleEndTime(profile?.role ?? "", settings);

      return {
        order: index + 1,
        fullName: profile?.full_name ?? "ไม่พบชื่อสมาชิก",
        position:
          profile?.position ||
          getRoleLabel(profile?.role ?? ""),
        checkIn: formatThaiTime(record.check_in_at),
        status: reportAttendanceStatus(record) || attendanceStatus(record),
        checkOut: formatThaiTime(record.check_out_at) || scheduledEndTime,
        signature: "",
        note:
          record.check_in_status === "late"
            ? formatLateReason(record.note)
            : "",
      };
    });

    const absentPeople = profiles
      .filter((profile) => !attendanceMap.get(profile.id)?.check_in_at)
      .map((profile) => {
        const record = attendanceMap.get(profile.id);
        const reason =
          record?.note?.trim() ||
          getAbsenceReason(profile.id, leaveByUser, officialDutyByUser);

        return {
          fullName: profile.full_name,
          status:
            leaveByUser.get(profile.id)?.leave_type ??
            (officialDutyByUser.has(profile.id)
              ? "official_duty"
              : "absent"),
          reason,
        };
      });

    const notes = absentPeople
      .filter((person) => person.status !== "absent")
      .map(
        (person) => `${person.fullName} (${getAbsenceLabel(person.status)})`
      );

    const normalizeReason = (value: string) =>
      value.replace(/\s+/g, "").toLowerCase();

    const sickLeave = absentPeople.filter((person) =>
      normalizeReason(person.reason).includes("ลาป่วย")
    ).length;

    const personalLeave = absentPeople.filter((person) =>
      normalizeReason(person.reason).includes("ลากิจ")
    ).length;

    const officialDuty = absentPeople.filter((person) =>
      normalizeReason(person.reason).includes("ไปราชการ")
    ).length;

    const late = presentRecords.filter(
      (record) => record.check_in_status === "late"
    ).length;

    const payload = {
      action: "buildDailyPdf",
      secret: gasSecret,
      date: today,
      rows,
      notes,
      summary: {
        total: profiles.length,
        present: presentRecords.length,
        sickLeave,
        personalLeave,
        officialDuty,
        late,
        absent: absentPeople.filter((person) => person.status === "absent")
          .length,
      },
    };

    const response = await fetch(gasUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      redirect: "follow",
    });

    const responseText = await response.text();
    let result: GasPdfResponse;

    try {
      result = JSON.parse(responseText) as GasPdfResponse;
    } catch {
      throw new Error(
        "GAS ส่งผลกลับมาไม่ถูกต้อง กรุณาตรวจสอบ Deployment ล่าสุด"
      );
    }

    if (!response.ok || !result.ok) {
      throw new Error(
        result.message || "ไม่สามารถสร้าง PDF รายวันได้"
      );
    }

    return NextResponse.json({
      ok: true,
      date: today,
      fileName: result.fileName,
      replaced: Boolean(result.replaced),
      recordCount: result.recordCount ?? rows.length,
      message:
        result.message || "สร้างรายงาน PDF อัตโนมัติสำเร็จ",
    });
  } catch (error) {
    console.error("Attendance daily PDF cron error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "เกิดข้อผิดพลาดระหว่างสร้าง PDF อัตโนมัติ",
      },
      { status: 500 }
    );
  }
}
