import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  signature_file_id: string | null;
  alternate_workplace: string | null;
  count_as_present_when_no_checkin: boolean;
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
  duty_end_date: string | null;
  subject: string | null;
  reason: string | null;
};

type GasPdfResponse = {
  ok: boolean;
  found?: boolean;
  message?: string;
  fileName?: string;
  size?: number | string | null;
  modifiedTime?: string | null;
  mimeType?: string;
  base64?: string;
  deleted?: boolean;
  replaced?: boolean;
  recordCount?: number;
};

type GasAssetResponse = {
  ok?: boolean;
  message?: string;
  base64?: string;
  mimeType?: string;
};

function getConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const gasUrl = process.env.GAS_DAILY_PDF_API_URL;
  const gasSecret = process.env.GAS_DAILY_PDF_SECRET;
  const profileGasUrl = process.env.GAS_PROFILE_UPLOAD_URL;
  const profileGasSecret = process.env.GAS_PROFILE_UPLOAD_SECRET;

  if (
    !supabaseUrl ||
    !publishableKey ||
    !serviceRoleKey ||
    !gasUrl ||
    !gasSecret ||
    !profileGasUrl ||
    !profileGasSecret
  ) {
    return null;
  }

  return {
    supabaseUrl,
    publishableKey,
    serviceRoleKey,
    gasUrl,
    gasSecret,
    profileGasUrl,
    profileGasSecret,
  };
}

function isValidDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
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

function formatThaiTime(value: string | null) {
  if (!value) return "";

  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
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
  if (record.check_in_status === "official_duty_morning") {
    return "ไปราชการช่วงเช้า";
  }
  if (record.check_in_status === "late") return "มาสาย";
  if (record.check_out_status === "early") return "ออกก่อนเวลา";
  return "ปกติ";
}

function reportAttendanceStatus(record: AttendanceRecord) {
  if (!record.check_in_at) return "";
  if (record.check_in_status === "official_duty_morning") {
    return "ไปราชการช่วงเช้า";
  }
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

async function authorizeAdmin(
  request: Request,
  config: NonNullable<ReturnType<typeof getConfig>>
) {
  const authorization = request.headers.get("authorization") ?? "";
  const accessToken = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";

  if (!accessToken) {
    return {
      ok: false as const,
      status: 401,
      message: "กรุณาเข้าสู่ระบบ",
    };
  }

  const authClient = createClient(
    config.supabaseUrl,
    config.publishableKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(accessToken);

  if (userError || !user) {
    return {
      ok: false as const,
      status: 401,
      message: "Session ไม่ถูกต้องหรือหมดอายุ",
    };
  }

  const adminClient = createClient(
    config.supabaseUrl,
    config.serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("role, account_status")
    .eq("id", user.id)
    .maybeSingle();

  if (
    profileError ||
    !profile ||
    profile.account_status !== "active" ||
    !["admin", "director", "staff"].includes(profile.role)
  ) {
    return {
      ok: false as const,
      status: 403,
      message: "ไม่มีสิทธิ์จัดการรายงาน PDF",
    };
  }

  return {
    ok: true as const,
    adminClient,
  };
}

async function callGasGet(
  config: NonNullable<ReturnType<typeof getConfig>>,
  date: string,
  mode: "metadata" | "file" | "delete"
) {
  const url = new URL(config.gasUrl);
  url.searchParams.set(
    "action",
    mode === "delete" ? "deleteDailyPdf" : "dailyPdf"
  );
  url.searchParams.set("date", date);
  url.searchParams.set("mode", mode === "delete" ? "metadata" : mode);
  url.searchParams.set("secret", config.gasSecret);

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
    redirect: "follow",
  });

  const text = await response.text();
  let result: GasPdfResponse;

  try {
    result = JSON.parse(text) as GasPdfResponse;
  } catch {
    throw new Error(
      "GAS ส่งข้อมูลกลับมาไม่ถูกต้อง กรุณาตรวจสอบการ Deploy เวอร์ชันล่าสุด"
    );
  }

  if (!response.ok || !result.ok) {
    throw new Error(
      result.message || "ไม่สามารถเรียกข้อมูล PDF จาก GAS ได้"
    );
  }

  return result;
}

async function getSignatureAsset(
  config: NonNullable<ReturnType<typeof getConfig>>,
  fileId: string | null | undefined
) {
  if (!fileId) {
    return null;
  }

  const response = await fetch(config.profileGasUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify({
      secret: config.profileGasSecret,
      action: "get",
      fileId,
    }),
    cache: "no-store",
    redirect: "follow",
  });

  const responseText = await response.text();
  let result: GasAssetResponse;

  try {
    result = JSON.parse(responseText) as GasAssetResponse;
  } catch {
    throw new Error(
      "GAS รูปภาพไม่ได้ส่งข้อมูลลายเซ็นกลับมาเป็น JSON"
    );
  }

  if (!response.ok || result.ok !== true) {
    throw new Error(
      result.message || "ไม่สามารถโหลดลายเซ็นของผู้อำนวยการได้"
    );
  }

  if (!result.base64) {
    return null;
  }

  return {
    base64: result.base64,
    mimeType: result.mimeType || "image/png",
  };
}

async function buildDailyPdf(
  config: NonNullable<ReturnType<typeof getConfig>>,
  date: string
) {
  const adminClient = createClient(
    config.supabaseUrl,
    config.serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  const settingsPromise = adminClient
    .from("attendance_settings")
    .select("director_end_time, teacher_end_time, staff_end_time, janitor_end_time")
    .eq("id", 1)
    .maybeSingle();
  // WORK_CALENDAR_PDF_STEP15
  const calendarPromise = adminClient
    .from("work_calendar_days")
    .select("work_date, day_type, title, report_text, note")
    .eq("work_date", date)
    .maybeSingle();

  const leavePromise = adminClient
    .from("leave_requests")
    .select("id, user_id, leave_type, start_date, end_date, reason")
    .in("status", ["pending", "approved"])
    .lte("start_date", date)
    .gte("end_date", date);

  const officialDutyPromise = adminClient
    .from("official_duty_requests")
    .select("id, user_id, duty_date, duty_end_date, subject, reason")
    .in("status", ["pending", "approved"])
    .lte("duty_date", date)
    .gte("duty_end_date", date);

  const { data: attendanceData, error: attendanceError } =
    await adminClient
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
      .eq("work_date", date)
      .order("check_in_at", {
        ascending: true,
        nullsFirst: false,
      });

  if (attendanceError) {
    throw new Error(
      "ไม่สามารถโหลดข้อมูลการลงเวลาประจำวันที่เลือกได้"
    );
  }

  const attendance =
    (attendanceData ?? []) as AttendanceRecord[];

  const { data: profileData, error: profileError } =
    await adminClient
      .from("profiles")
      .select(
        "id, full_name, position, role, account_status, signature_file_id, alternate_workplace, count_as_present_when_no_checkin"
      )
      .eq("account_status", "active")
      .order("full_name", { ascending: true });

  if (profileError) {
    throw new Error("ไม่สามารถโหลดข้อมูลบุคลากรได้");
  }

  const { data: settingsData } = await settingsPromise;
  const { data: calendarDayData, error: calendarDayError } =
    await calendarPromise;

  if (calendarDayError) {
    throw new Error("ไม่สามารถโหลดปฏิทินปฏิบัติงานได้");
  }

  const dateParts = date.split("-").map(Number);
  const dayOfWeek = new Date(
    Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2])
  ).getUTCDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const calendarDay = calendarDayData as {
    work_date: string;
    day_type: "PUBLIC_HOLIDAY" | "SCHOOL_HOLIDAY" | "SPECIAL_WORKDAY";
    title: string;
    report_text: string;
    note: string;
  } | null;
  const isSpecialWorkday =
    calendarDay?.day_type === "SPECIAL_WORKDAY";
  const isHoliday =
    !isSpecialWorkday &&
    (isWeekend ||
      calendarDay?.day_type === "PUBLIC_HOLIDAY" ||
      calendarDay?.day_type === "SCHOOL_HOLIDAY");
  const calendarNote = isSpecialWorkday
    ? calendarDay?.report_text?.trim() ||
      (calendarDay?.title?.trim()
        ? `เปิดปฏิบัติงานพิเศษ: ${calendarDay.title.trim()}`
        : "เปิดปฏิบัติงานพิเศษ")
    : calendarDay?.report_text?.trim() ||
      calendarDay?.title?.trim() ||
      (dayOfWeek === 6
        ? "หยุดเรียนวันเสาร์"
        : dayOfWeek === 0
          ? "หยุดเรียนวันอาทิตย์"
          : "");

  const [
    { data: leaveData, error: leaveError },
    { data: officialDutyData, error: officialDutyError },
  ] = await Promise.all([
    leavePromise,
    officialDutyPromise,
  ]);

  if (leaveError) {
    throw new Error("ไม่สามารถโหลดข้อมูลการลาประจำวันที่เลือกได้");
  }

  if (officialDutyError) {
    throw new Error("ไม่สามารถโหลดข้อมูลไปราชการประจำวันที่เลือกได้");
  }

  const settings = (settingsData ?? null) as AttendanceSettings | null;
  const profiles = (profileData ?? []) as Profile[];
  const leaveRequests = (leaveData ?? []) as LeaveRequest[];
  const officialDutyRequests =
    (officialDutyData ?? []) as OfficialDutyRequest[];

  const directorProfile =
    profiles.find(
      (profile) =>
        profile.role === "director" &&
        Boolean(profile.signature_file_id)
    ) ??
    profiles.find((profile) => profile.role === "director") ??
    null;

  const directorSignature =
    directorProfile?.signature_file_id
      ? await getSignatureAsset(
          config,
          directorProfile.signature_file_id
        )
      : null;

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
    .sort((a, b) => {
      const first = a.check_in_at ?? "9999";
      const second = b.check_in_at ?? "9999";
      return first.localeCompare(second);
    });

  const rows = presentRecords.map((record, index) => {
    const profile = profileMap.get(record.user_id);
    const scheduledEndTime = getRoleEndTime(profile?.role ?? "", settings);
    const isDirectorMorningDuty =
      profile?.role === "director" &&
      record.check_in_status === "late";

    return {
      order: index + 1,
      fullName: profile?.full_name ?? "ไม่พบชื่อสมาชิก",
      position:
        profile?.position ||
        getRoleLabel(profile?.role ?? ""),
      checkIn: formatThaiTime(record.check_in_at),
      status: isDirectorMorningDuty
        ? "ไปราชการช่วงเช้า"
        : reportAttendanceStatus(record) || attendanceStatus(record),
      checkOut: formatThaiTime(record.check_out_at) || scheduledEndTime,
      signature: "",
      note:
        ["late", "official_duty_morning"].includes(
          record.check_in_status ?? ""
        )
          ? formatLateReason(record.note)
          : "",
    };
  });
  // ALTERNATE_WORKPLACE_CALENDAR_FIX_V5
  const selectedDateDay = new Date(`${date}T12:00:00+07:00`).getDay();

  const allowAlternateWorkplace =
    calendarDayData?.day_type === "special_workday" ||
    (calendarDayData?.day_type !== "holiday" &&
      selectedDateDay !== 0 &&
      selectedDateDay !== 6);

  const absentPeople = profiles
    .filter((profile) => !attendanceMap.get(profile.id)?.check_in_at)
    .map((profile) => {
      const record = attendanceMap.get(profile.id);
      const leave = leaveByUser.get(profile.id);
      const hasOfficialDuty = officialDutyByUser.has(profile.id);
      const isAlternateWorkplace =
        allowAlternateWorkplace &&
        !leave &&
        !hasOfficialDuty &&
        profile.count_as_present_when_no_checkin &&
        Boolean(profile.alternate_workplace?.trim());

      const note = isAlternateWorkplace
        ? `ปฏิบัติหน้าที่${profile.alternate_workplace?.trim()}`
        : record?.note?.trim() ||
          getAbsenceReason(profile.id, leaveByUser, officialDutyByUser);

      return {
        fullName: profile.full_name,
        status:
          leave?.leave_type ??
          (hasOfficialDuty
            ? "official_duty"
            : isAlternateWorkplace
              ? "alternate_workplace"
              : "absent"),
        reason: note,
      };
    });

    const personnelNoteItems = absentPeople
    .filter((person) => person.status !== "absent")
    .map((person) =>
      person.status === "alternate_workplace"
        ? `${person.fullName} (${person.reason})`
        : `${person.fullName} (${getAbsenceLabel(person.status)})`
    );

  const noteItems = [
    ...(calendarNote ? [calendarNote] : []),
    ...(!isHoliday ? personnelNoteItems : []),
  ];
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

  const alternateWorkplaceCount = absentPeople.filter(
    (person) => person.status === "alternate_workplace"
  ).length;

  const late = presentRecords.filter(
    (record) =>
      record.check_in_status === "late" &&
      profileMap.get(record.user_id)?.role !== "director"
  ).length;

  const payload = {
    action: "buildDailyPdf",
    secret: config.gasSecret,
    date,
    rows,
    notes: noteItems,
    allowEmptyRows: isHoliday,
    calendarDayType: calendarDay?.day_type ?? (isWeekend ? "WEEKEND" : "WORKDAY"),
    director: {
      fullName: directorProfile?.full_name ?? "",
      position:
        directorProfile?.position ||
        (directorProfile
          ? getRoleLabel(directorProfile.role)
          : ""),
    },
    directorSignature,
    summary: {
      total: profiles.length,
      present: presentRecords.length + alternateWorkplaceCount,
      sickLeave: isHoliday ? 0 : sickLeave,
      personalLeave: isHoliday ? 0 : personalLeave,
      officialDuty: isHoliday ? 0 : officialDuty,
      late,
      absent: isHoliday ? 0 : absentPeople.filter((person) => person.status === "absent").length,
    },
  };

  const response = await fetch(config.gasUrl, {
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
      "GAS ส่งผลการสร้าง PDF กลับมาไม่ถูกต้อง กรุณา Deploy doPost เวอร์ชันล่าสุด"
    );
  }

  if (!response.ok || !result.ok) {
    throw new Error(
      result.message || "ไม่สามารถสร้าง PDF รายวันได้"
    );
  }

  return result;
}

async function handle(request: Request, allowWrite: boolean) {
  try {
    const config = getConfig();

    if (!config) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Environment Variables สำหรับ Supabase, GAS PDF หรือ GAS รูปภาพยังไม่ครบ",
        },
        { status: 500 }
      );
    }

    const authorization = await authorizeAdmin(
      request,
      config
    );

    if (!authorization.ok) {
      return NextResponse.json(
        {
          ok: false,
          message: authorization.message,
        },
        {
          status: authorization.status,
        }
      );
    }

    const url = new URL(request.url);
    const date = url.searchParams.get("date")?.trim() ?? "";
    const modeValue =
      url.searchParams.get("mode")?.trim() ?? "metadata";

    if (!isValidDate(date)) {
      return NextResponse.json(
        {
          ok: false,
          message: "กรุณาระบุ date รูปแบบ YYYY-MM-DD",
        },
        { status: 400 }
      );
    }

    if (
      allowWrite &&
      (modeValue === "delete" || modeValue === "build")
    ) {
      const result =
        modeValue === "delete"
          ? await callGasGet(config, date, "delete")
          : await buildDailyPdf(
              config,
              date
            );

      return NextResponse.json(result);
    }

    if (
      modeValue !== "metadata" &&
      modeValue !== "file"
    ) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "mode ต้องเป็น metadata, file, build หรือ delete",
        },
        { status: 400 }
      );
    }

    const mode = modeValue as "metadata" | "file";
    const result = await callGasGet(config, date, mode);

    if (mode === "metadata") {
      return NextResponse.json({
        ok: true,
        found: Boolean(result.found),
        message: result.message,
        fileName: result.fileName,
        size: result.size ?? null,
        modifiedTime: result.modifiedTime ?? null,
      });
    }

    if (!result.found || !result.base64) {
      return NextResponse.json(
        {
          ok: true,
          found: false,
          message:
            result.message ||
            "ยังไม่พบรายงาน PDF ประจำวันที่เลือก",
        },
        { status: 404 }
      );
    }

    const body = Buffer.from(result.base64, "base64");
    const fileName =
      result.fileName || `daily-attendance-${date}.pdf`;

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(body.length),
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(
          fileName
        )}`,
      },
    });
  } catch (error) {
    console.error("Daily PDF API error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "เกิดข้อผิดพลาดระหว่างจัดการ PDF รายวัน",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return handle(request, false);
}

export async function POST(request: Request) {
  return handle(request, true);
}
