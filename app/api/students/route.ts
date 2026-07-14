import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  canManageStudentData,
  forbidden,
  loadStudentAccess,
  requireStudentAuth,
  studentDataClassLevels,
} from "@/lib/students/access";

type StudentInput = {
  student_code?: unknown;
  full_name?: unknown;
  class_level?: unknown;
  class_room?: unknown;
  status?: unknown;
};

const STUDENT_SELECT = "id, student_code, full_name, class_level, class_room, status, photo_file_id, photo_file_url, photo_mime_type, photo_uploaded_at, created_at, updated_at";

function config() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !publishableKey || !serviceRoleKey) return null;
  return { supabaseUrl, publishableKey, serviceRoleKey };
}

function tokenOf(request: Request) {
  const value = request.headers.get("authorization");
  return value?.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

async function requireActiveUser(request: Request) {
  const env = config();

  if (!env) {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, message: "ระบบยังไม่ได้ตั้งค่า Supabase ฝั่ง Server" }, { status: 500 }),
    };
  }

  const token = tokenOf(request);
  if (!token) {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, message: "กรุณาเข้าสู่ระบบใหม่" }, { status: 401 }),
    };
  }

  const authClient = createClient(env.supabaseUrl, env.publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: { user }, error: userError } = await authClient.auth.getUser(token);
  if (userError || !user) {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, message: "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่" }, { status: 401 }),
    };
  }

  const adminClient = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("id, role, account_status, departments")
    .eq("id", user.id)
    .single();

  if (profileError || !profile || profile.account_status !== "active") {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, message: "คุณไม่มีสิทธิ์ใช้งานข้อมูลนักเรียน" }, { status: 403 }),
    };
  }

  return { ok: true as const, user, profile, adminClient };
}

function normalizeStudent(input: StudentInput) {
  const student_code = text(input.student_code);
  const full_name = text(input.full_name);
  const class_level = text(input.class_level);
  const class_room = text(input.class_room) || "-";
  const status = text(input.status) || "active";

  if (!student_code) throw new Error("กรุณาระบุรหัสนักเรียน");
  if (!full_name) throw new Error("กรุณาระบุชื่อนักเรียน");
  if (!class_level) throw new Error("กรุณาระบุชั้นเรียน");

  return {
    student_code,
    full_name,
    class_level,
    class_room,
    status,
    updated_at: new Date().toISOString(),
  };
}

export async function GET(request: Request) {
  const auth = await requireStudentAuth(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const classLevel = text(url.searchParams.get("classLevel"));
  const classRoom = text(url.searchParams.get("classRoom"));
  const queryText = text(url.searchParams.get("q"));
  const access = await loadStudentAccess(auth.adminClient, auth.user.id, auth.profile);
  const allowedLevels = studentDataClassLevels(access);

  if (allowedLevels.length === 0) {
    return NextResponse.json({ ok: true, students: [], access: { studentDataClassLevels: [] } });
  }

  let query = auth.adminClient
    .from("students")
    .select(STUDENT_SELECT)
    .neq("status", "deleted")
    .order("class_level", { ascending: true })
    .order("class_room", { ascending: true })
    .order("student_code", { ascending: true });

  if (classLevel && classLevel !== "ทั้งหมด") {
    if (!allowedLevels.includes(classLevel)) {
      return forbidden("คุณไม่มีสิทธิ์ดูข้อมูลนักเรียนชั้นนี้");
    }
    query = query.eq("class_level", classLevel);
  } else {
    query = query.in("class_level", allowedLevels);
  }
  if (classRoom && classRoom !== "ทั้งหมด") query = query.eq("class_room", classRoom);
  if (queryText) query = query.or(`student_code.ilike.%${queryText}%,full_name.ilike.%${queryText}%`);

  const { data, error } = await query;
  if (error) {
    console.error("Load students error:", error);
    return NextResponse.json({ ok: false, message: `โหลดข้อมูลนักเรียนไม่สำเร็จ: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    students: data ?? [],
    access: {
      canManageStudentData: allowedLevels.length > 0,
      studentDataClassLevels: allowedLevels,
    },
  });
}

export async function POST(request: Request) {
  const auth = await requireStudentAuth(request);
  if (!auth.ok) return auth.response;

  let body: StudentInput;
  try {
    body = (await request.json()) as StudentInput;
  } catch {
    return NextResponse.json({ ok: false, message: "ข้อมูลที่ส่งมาไม่ถูกต้อง" }, { status: 400 });
  }

  let payload: ReturnType<typeof normalizeStudent>;
  try {
    payload = normalizeStudent(body);
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const access = await loadStudentAccess(auth.adminClient, auth.user.id, auth.profile);
  if (!canManageStudentData(access, payload.class_level)) {
    return forbidden("คุณไม่มีสิทธิ์เพิ่มข้อมูลนักเรียนชั้นนี้");
  }

  const { data, error } = await auth.adminClient
    .from("students")
    .insert({ ...payload, created_at: new Date().toISOString() })
    .select(STUDENT_SELECT)
    .single();

  if (error) {
    console.error("Create student error:", error);
    return NextResponse.json({ ok: false, message: `เพิ่มนักเรียนไม่สำเร็จ: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, student: data, message: "เพิ่มนักเรียนแล้ว" });
}
