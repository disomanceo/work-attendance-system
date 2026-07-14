import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  canRecordAttendance,
  forbidden,
  loadStudentAccess,
  requireStudentAuth,
} from "@/lib/students/access";

type AttendanceStatus = "present" | "absent" | "sick" | "leave" | "late";

type AttendanceRecordInput = {
  studentId?: unknown;
  status?: unknown;
  note?: unknown;
};

type SaveBody = {
  date?: unknown;
  classLevel?: unknown;
  classRoom?: unknown;
  records?: AttendanceRecordInput[];
};

type ClassAdviserSettingRow = {
  adviser_profile_id: string | null;
  adviser_profile_ids: string[] | null;
};

type AdviserProfileRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
};

type StudentCodeRow = {
  id: string;
  student_code: string | null;
};

const allowedStatuses = new Set<AttendanceStatus>([
  "present",
  "absent",
  "sick",
  "leave",
  "late",
]);

function config() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !publishableKey || !serviceRoleKey) return null;
  return { supabaseUrl, publishableKey, serviceRoleKey };
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function accessToken(request: Request) {
  const value = request.headers.get("authorization");
  return value?.startsWith("Bearer ")
    ? value.slice("Bearer ".length).trim()
    : "";
}

function todayBangkok() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeStatus(value: unknown): AttendanceStatus {
  const status = text(value);
  if (status === "personal") return "leave";
  if (allowedStatuses.has(status as AttendanceStatus)) {
    return status as AttendanceStatus;
  }
  return "present";
}

async function requireActiveUser(request: Request) {
  const env = config();

  if (!env) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, message: "ระบบยังไม่ได้ตั้งค่า Supabase ฝั่ง Server" },
        { status: 500 },
      ),
    };
  }

  const token = accessToken(request);
  if (!token) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, message: "กรุณาเข้าสู่ระบบใหม่" },
        { status: 401 },
      ),
    };
  }

  const authClient = createClient(env.supabaseUrl, env.publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(token);

  if (userError || !user) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, message: "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่" },
        { status: 401 },
      ),
    };
  }

  const adminClient = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("id, role, account_status")
    .eq("id", user.id)
    .single();

  if (profileError || !profile || profile.account_status !== "active") {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, message: "คุณไม่มีสิทธิ์เข้าใช้งานระบบเช็คชื่อนักเรียน" },
        { status: 403 },
      ),
    };
  }

  return { ok: true as const, user, profile, adminClient };
}

async function loadAdviserNames(
  adminClient: any,
  classLevel: string,
  classRoom: string,
) {
  let query = adminClient
    .from("student_class_settings")
    .select("adviser_profile_id, adviser_profile_ids")
    .eq("class_level", classLevel)
    .eq("is_active", true);

  if (classRoom) query = query.eq("class_room", classRoom);

  const { data: setting, error: settingError } = await query.maybeSingle();

  if (settingError || !setting) return [];

  const adviserSetting = setting as ClassAdviserSettingRow;

  const ids = Array.from(
    new Set(
      [
        adviserSetting.adviser_profile_id,
        ...(Array.isArray(adviserSetting.adviser_profile_ids)
          ? adviserSetting.adviser_profile_ids
          : []),
      ].filter((id): id is string => Boolean(id)),
    ),
  );

  if (ids.length === 0) return [];

  const { data: profiles } = await adminClient
    .from("profiles")
    .select("id, full_name, phone")
    .in("id", ids);

  const profileRows = (profiles ?? []) as AdviserProfileRow[];
  const profileMap = new Map(
    profileRows.map((profile) => [
      profile.id,
      profile.full_name || profile.phone || profile.id,
    ]),
  );

  return ids.map((id) => profileMap.get(id)).filter((name): name is string => Boolean(name));
}

export async function GET(request: Request) {
  const auth = await requireStudentAuth(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const requestedDate = text(url.searchParams.get("date"));
  const date = validDate(requestedDate) ? requestedDate : todayBangkok();
  const classLevel = text(url.searchParams.get("classLevel")) || "อนุบาล 2";
  const classRoom = text(url.searchParams.get("classRoom"));
  const access = await loadStudentAccess(auth.adminClient, auth.user.id, auth.profile);

  if (!canRecordAttendance(access, classLevel, date)) {
    return forbidden("คุณไม่มีสิทธิ์ดูหรือเช็คชื่อนักเรียนชั้นนี้");
  }

  let studentsQuery = auth.adminClient
    .from("students")
    .select("id, student_code, full_name, class_level, class_room, status")
    .eq("class_level", classLevel)
    .eq("status", "active")
    .order("student_code", { ascending: true });

  if (classRoom) studentsQuery = studentsQuery.eq("class_room", classRoom);

  let recordsQuery = auth.adminClient
    .from("student_attendance")
    .select("student_id, status, note")
    .eq("attendance_date", date)
    .eq("class_level", classLevel);

  if (classRoom) {
    recordsQuery = recordsQuery.eq("class_room", classRoom);
  } else {
    recordsQuery = recordsQuery.or("class_room.is.null,class_room.eq.");
  }

  const [
    { data: students, error: studentsError },
    { data: records, error: recordsError },
    adviserNames,
  ] = await Promise.all([
    studentsQuery,
    recordsQuery,
    loadAdviserNames(auth.adminClient, classLevel, classRoom),
  ]);

  if (studentsError || recordsError) {
    console.error("Load student attendance error:", studentsError || recordsError);
    return NextResponse.json(
      { ok: false, message: "โหลดข้อมูลเช็คชื่อนักเรียนไม่สำเร็จ" },
      { status: 500 },
    );
  }

  const recordMap = new Map<
    string,
    { status?: AttendanceStatus; note?: string | null }
  >(
    (records ?? []).map((record) => [
      String(record.student_id),
      {
        status: record.status as AttendanceStatus,
        note: record.note,
      },
    ]),
  );

  return NextResponse.json({
    ok: true,
    date,
    classLevel,
    classRoom,
    adviserNames,
    recordedCount: records?.length ?? 0,
    students: (students ?? []).map((student: any, index: number) => {
      const record = recordMap.get(String(student.id));
      return {
        id: student.id,
        code: student.student_code,
        student_code: student.student_code,
        no: index + 1,
        name: student.full_name,
        full_name: student.full_name,
        class_level: student.class_level,
        class_room: student.class_room,
        status: record?.status ?? "present",
        note: record?.note ?? "",
      };
    }),
  });
}

export async function POST(request: Request) {
  const auth = await requireStudentAuth(request);
  if (!auth.ok) return auth.response;

  let body: SaveBody;
  try {
    body = (await request.json()) as SaveBody;
  } catch {
    return NextResponse.json(
      { ok: false, message: "ข้อมูลที่ส่งมาไม่ถูกต้อง" },
      { status: 400 },
    );
  }

  const date = text(body.date);
  const classLevel = text(body.classLevel);
  const classRoom = text(body.classRoom);

  if (!validDate(date) || !classLevel) {
    return NextResponse.json(
      { ok: false, message: "กรุณาระบุวันที่และชั้นเรียนให้ครบ" },
      { status: 400 },
    );
  }

  const access = await loadStudentAccess(auth.adminClient, auth.user.id, auth.profile);
  if (!canRecordAttendance(access, classLevel, date)) {
    return forbidden("คุณไม่มีสิทธิ์บันทึกเช็คชื่อนักเรียนชั้นนี้");
  }

  const records = Array.isArray(body.records) ? body.records : [];
  const studentIds = records.map((record) => text(record.studentId)).filter(Boolean);

  const studentCodeMap = new Map<string, string>();

  if (studentIds.length > 0) {
    const { data: studentCodeRows, error: studentCodeError } = await auth.adminClient
      .from("students")
      .select("id, student_code")
      .in("id", Array.from(new Set(studentIds)));

    if (studentCodeError) {
      console.error("Load student codes for attendance save error:", studentCodeError);
      return NextResponse.json(
        { ok: false, message: `โหลดรหัสนักเรียนไม่สำเร็จ: ${studentCodeError.message}` },
        { status: 500 },
      );
    }

    ((studentCodeRows ?? []) as StudentCodeRow[]).forEach((student) => {
      studentCodeMap.set(student.id, student.student_code || "");
    });
  }

  const now = new Date().toISOString();
  const rows = records
    .map((record) => {
      const studentId = text(record.studentId);
      if (!studentId) return null;
      return {
        student_id: studentId,
        student_code: studentCodeMap.get(studentId) || null,
        attendance_date: date,
        class_level: classLevel,
        class_room: classRoom,
        status: normalizeStatus(record.status),
        note: text(record.note) || null,
        recorded_by: auth.user.id,
        recorded_by_role: String(auth.profile.role || ""),
        recorded_as: "student_attendance",
        recorded_at: now,
        updated_at: now,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  let deleteQuery = auth.adminClient
    .from("student_attendance")
    .delete()
    .eq("attendance_date", date)
    .eq("class_level", classLevel);

  if (classRoom) {
    deleteQuery = deleteQuery.eq("class_room", classRoom);
  } else {
    deleteQuery = deleteQuery.or("class_room.is.null,class_room.eq.");
  }

  const { error: deleteError } = await deleteQuery;

  if (deleteError) {
    console.error("Prepare student attendance save error:", deleteError);
    return NextResponse.json(
      { ok: false, message: `เตรียมบันทึกไม่สำเร็จ: ${deleteError.message}` },
      { status: 500 },
    );
  }

  if (rows.length > 0) {
    const { error: insertError } = await auth.adminClient
      .from("student_attendance")
      .insert(rows);

    if (insertError) {
      console.error("Save student attendance error:", insertError);
      return NextResponse.json(
        { ok: false, message: `บันทึกไม่สำเร็จ: ${insertError.message}` },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    message: "บันทึกเช็คชื่อนักเรียนแล้ว",
    saved: rows.length,
  });
}
