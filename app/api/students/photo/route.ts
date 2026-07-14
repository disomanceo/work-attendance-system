import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  canManageStudentData,
  forbidden,
  loadStudentAccess,
  studentDataClassLevels,
} from "@/lib/students/access";

const DEFAULT_STUDENT_PHOTO_ROOT_FOLDER_ID = "1VCUDQlK0LbSlJ5HIhKsCcO2SfC3ySmyM";
const MAX_PHOTO_SIZE = 5 * 1024 * 1024;

type StudentPhotoAsset = {
  studentId: string;
  fileId: string;
  fileUrl: string;
  mimeType: string;
};

function config() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const gasUrl = process.env.GAS_STUDENT_PHOTO_UPLOAD_URL;
  const gasSecret = process.env.GAS_STUDENT_PHOTO_UPLOAD_SECRET;
  const rootFolderId = process.env.GAS_STUDENT_PHOTO_ROOT_FOLDER_ID || DEFAULT_STUDENT_PHOTO_ROOT_FOLDER_ID;

  if (!supabaseUrl || !publishableKey || !serviceRoleKey || !gasUrl || !gasSecret) return null;

  return { supabaseUrl, publishableKey, serviceRoleKey, gasUrl, gasSecret, rootFolderId };
}

function tokenOf(request: Request) {
  const value = request.headers.get("authorization");
  return value?.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function safeName(value: string) {
  return value
    .replace(/[^\p{L}\p{N}-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "student";
}

function photoExtension(mimeType: string) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

function driveFileUrl(fileId: string) {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view?usp=drive_link`;
}

async function authorize(request: Request) {
  const env = config();

  if (!env) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, message: "ยังไม่ได้ตั้งค่า Supabase หรือ GAS สำหรับรูปนักเรียน" },
        { status: 500 },
      ),
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

  return { ok: true as const, env, adminClient, profile };
}

async function callGas(gasUrl: string, payload: Record<string, unknown>) {
  const response = await fetch(gasUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
    cache: "no-store",
    redirect: "follow",
  });

  const responseText = await response.text();
  let result: Record<string, unknown>;

  try {
    result = JSON.parse(responseText) as Record<string, unknown>;
  } catch {
    throw new Error("Google Apps Script ไม่ได้ตอบกลับเป็น JSON");
  }

  if (!response.ok || result.ok !== true) {
    throw new Error(typeof result.message === "string" ? result.message : "Google Apps Script ทำงานไม่สำเร็จ");
  }

  return result;
}

async function academicYear(adminClient: SupabaseClient<any>) {
  const { data } = await adminClient
    .from("attendance_settings")
    .select("active_academic_year")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const settings = data as { active_academic_year?: number | string | null } | null;
  const configuredYear = Number(settings?.active_academic_year);
  if (Number.isInteger(configuredYear) && configuredYear >= 2500 && configuredYear <= 2700) return configuredYear;

  return new Date().getFullYear() + 543;
}

export async function POST(request: Request) {
  const auth = await authorize(request);
  if (!auth.ok) return auth.response;

  try {
    const formData = await request.formData();
    const studentId = text(formData.get("studentId"));
    const file = formData.get("file");

    if (!studentId || !(file instanceof File)) {
      return NextResponse.json({ ok: false, message: "ข้อมูลอัปโหลดรูปนักเรียนไม่ถูกต้อง" }, { status: 400 });
    }

    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      return NextResponse.json({ ok: false, message: "รองรับเฉพาะ JPG, PNG และ WEBP" }, { status: 400 });
    }

    if (file.size > MAX_PHOTO_SIZE) {
      return NextResponse.json({ ok: false, message: "รูปนักเรียนต้องมีขนาดไม่เกิน 5 MB" }, { status: 400 });
    }

    const { data: student, error: studentError } = await auth.adminClient
      .from("students")
      .select("id, student_code, full_name, class_level, photo_file_id")
      .eq("id", studentId)
      .neq("status", "deleted")
      .single();

    if (studentError || !student) {
      return NextResponse.json({ ok: false, message: "ไม่พบนักเรียนสำหรับบันทึกรูป" }, { status: 404 });
    }

    const access = await loadStudentAccess(auth.adminClient, auth.profile.id, auth.profile);
    if (!canManageStudentData(access, String(student.class_level || ""))) {
      return forbidden("คุณไม่มีสิทธิ์อัปโหลดรูปนักเรียนชั้นนี้");
    }

    const year = await academicYear(auth.adminClient);
    const extension = photoExtension(file.type);
    const fileName = `${safeName(String(student.student_code || student.id))}-${safeName(String(student.full_name))}-${Date.now()}.${extension}`;
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");

    const gasResult = await callGas(auth.env.gasUrl, {
      secret: auth.env.gasSecret,
      action: "uploadStudentPhoto",
      rootFolderId: auth.env.rootFolderId,
      folderPath: [`ปีการศึกษา ${year}`, String(student.class_level || "ไม่ระบุชั้น")],
      fileName,
      mimeType: file.type,
      base64,
      description: `Student photo: ${student.full_name} (${student.student_code || student.id})`,
    });

    const fileId = typeof gasResult.fileId === "string" ? gasResult.fileId : "";
    if (!fileId) throw new Error("Google Apps Script ไม่คืนค่า File ID");

    const asset: StudentPhotoAsset = {
      studentId,
      fileId,
      fileUrl: typeof gasResult.fileUrl === "string" ? gasResult.fileUrl : driveFileUrl(fileId),
      mimeType: file.type,
    };

    const { error: updateError } = await auth.adminClient
      .from("students")
      .update({
        photo_file_id: asset.fileId,
        photo_file_url: asset.fileUrl,
        photo_mime_type: asset.mimeType,
        photo_uploaded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", studentId);

    if (updateError) {
      await callGas(auth.env.gasUrl, {
        secret: auth.env.gasSecret,
        action: "delete",
        fileId,
      }).catch(() => undefined);

      throw updateError;
    }

    if (student.photo_file_id && student.photo_file_id !== fileId) {
      await callGas(auth.env.gasUrl, {
        secret: auth.env.gasSecret,
        action: "delete",
        fileId: student.photo_file_id,
      }).catch(() => undefined);
    }

    return NextResponse.json({ ok: true, asset, message: "บันทึกรูปนักเรียนแล้ว" });
  } catch (error) {
    console.error("Upload student photo error:", error);
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "อัปโหลดรูปนักเรียนไม่สำเร็จ" },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  const auth = await authorize(request);
  if (!auth.ok) return auth.response;

  try {
    const fileId = text(new URL(request.url).searchParams.get("fileId"));
    if (!fileId) {
      return NextResponse.json({ ok: false, message: "ไม่พบ File ID" }, { status: 400 });
    }

    const { data: student } = await auth.adminClient
      .from("students")
      .select("id, class_level")
      .eq("photo_file_id", fileId)
      .neq("status", "deleted")
      .limit(1)
      .maybeSingle();

    if (!student) {
      return NextResponse.json({ ok: false, message: "ไม่มีสิทธิ์เปิดรูปนี้" }, { status: 403 });
    }

    const access = await loadStudentAccess(auth.adminClient, auth.profile.id, auth.profile);
    if (!studentDataClassLevels(access).includes(String(student.class_level || ""))) {
      return forbidden("คุณไม่มีสิทธิ์เปิดรูปนักเรียนชั้นนี้");
    }

    const gasResult = await callGas(auth.env.gasUrl, {
      secret: auth.env.gasSecret,
      action: "get",
      fileId,
    });

    const base64 = typeof gasResult.base64 === "string" ? gasResult.base64 : "";
    const mimeType = typeof gasResult.mimeType === "string" ? gasResult.mimeType : "application/octet-stream";

    if (!base64) throw new Error("Google Apps Script ไม่คืนข้อมูลไฟล์");

    return new NextResponse(Buffer.from(base64, "base64"), {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    console.error("Read student photo error:", error);
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "เปิดรูปนักเรียนไม่สำเร็จ" },
      { status: 500 },
    );
  }
}
