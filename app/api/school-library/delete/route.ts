import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  callSchoolLibraryDriveGas,
  getSchoolLibraryDriveConfig,
} from "@/lib/school-library/drive-gas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getAccessToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return "";
  return authorization.slice("Bearer ".length).trim();
}

async function authorize(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, message: "Supabase config is missing" },
        { status: 500 },
      ),
    };
  }

  const accessToken = getAccessToken(request);
  if (!accessToken) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, message: "กรุณาเข้าสู่ระบบใหม่" },
        { status: 401 },
      ),
    };
  }

  const authClient = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(accessToken);

  if (userError || !user) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, message: "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่" },
        { status: 401 },
      ),
    };
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
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
        { ok: false, message: "คุณไม่มีสิทธิ์ใช้งานส่วนนี้" },
        { status: 403 },
      ),
    };
  }

  return { ok: true as const, user, profile };
}

export async function POST(request: Request) {
  try {
    const auth = await authorize(request);
    if (!auth.ok) return auth.response;

    const cfg = getSchoolLibraryDriveConfig();
    if (!cfg) {
      return NextResponse.json(
        { ok: false, message: "ยังไม่ได้ตั้งค่า Apps Script สำหรับคลังงานโรงเรียน" },
        { status: 500 },
      );
    }

    const body = (await request.json()) as {
      driveFileId?: unknown;
      uploadedByUserId?: unknown;
    };
    const driveFileId = String(body.driveFileId || "").trim();
    const uploadedByUserId = String(body.uploadedByUserId || "").trim();

    if (!driveFileId) {
      return NextResponse.json(
        { ok: false, message: "ไม่พบ Drive file id สำหรับลบไฟล์" },
        { status: 400 },
      );
    }

    const role = String(auth.profile.role || "");
    const canDelete =
      role === "director" ||
      (!!uploadedByUserId && uploadedByUserId === auth.user.id);

    if (!canDelete) {
      return NextResponse.json(
        { ok: false, message: "ลบได้เฉพาะผู้ที่อัปโหลดไฟล์หรือ ผอ. เท่านั้น" },
        { status: 403 },
      );
    }

    const result = await callSchoolLibraryDriveGas(cfg.url, {
      action: "deleteSchoolLibraryFile",
      secret: cfg.secret,
      fileId: driveFileId,
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("School library delete error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "ไม่สามารถลบไฟล์คลังงานโรงเรียนได้",
      },
      { status: 500 },
    );
  }
}
