import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  callSchoolLibraryDriveGas,
  getSchoolLibraryDriveConfig,
} from "@/lib/school-library/drive-gas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_FILE_SIZE = 30 * 1024 * 1024;

function getAccessToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return "";
  return authorization.slice("Bearer ".length).trim();
}

async function authorize(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !publishableKey) {
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
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const {
    data: { user },
    error,
  } = await authClient.auth.getUser(accessToken);

  if (error || !user) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, message: "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่" },
        { status: 401 },
      ),
    };
  }

  return { ok: true as const, user };
}

function extensionFromName(name: string) {
  return name.split(".").pop()?.trim().toLowerCase() ?? "";
}

function inferFileType(file: File) {
  const extension = extensionFromName(file.name);

  if (extension === "pdf" || file.type === "application/pdf") return "PDF";

  if (
    ["doc", "docx", "docm", "dot", "dotx", "rtf"].includes(extension) ||
    file.type.includes("word") ||
    file.type.includes("officedocument.wordprocessingml")
  ) {
    return "DOCX";
  }

  return "DRIVE";
}

function sanitizeFileName(value: string) {
  return value
    .replace(/[<>:"/\\|?*\n\r]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function buildDriveFileName(title: string, originalName: string) {
  const dot = originalName.lastIndexOf(".");
  const extension = dot >= 0 ? originalName.slice(dot) : "";
  const baseName = sanitizeFileName(title || originalName || "document");

  return `${baseName}-${Date.now()}${extension}`;
}

export async function POST(request: Request) {
  try {
    const auth = await authorize(request);
    if (!auth.ok) return auth.response;

    const cfg = getSchoolLibraryDriveConfig();
    if (!cfg) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "ยังไม่ได้ตั้งค่า Apps Script สำหรับคลังงานโรงเรียน: SCHOOL_LIBRARY_DRIVE_GAS_URL และ SCHOOL_LIBRARY_DRIVE_GAS_SECRET",
        },
        { status: 500 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const title = String(formData.get("title") || "").trim();
    const category = String(formData.get("category") || "").trim();
    const academicYear = String(formData.get("academicYear") || "").trim();

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { ok: false, message: "กรุณาเลือกไฟล์จากเครื่อง" },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { ok: false, message: "ไฟล์ต้องมีขนาดไม่เกิน 30 MB" },
        { status: 400 },
      );
    }

    const safeTitle = sanitizeFileName(title || file.name);
    const originalName = sanitizeFileName(file.name);
    const fileType = inferFileType(file);
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const driveFileName = buildDriveFileName(safeTitle, originalName);

    const result = await callSchoolLibraryDriveGas(cfg.url, {
      action: cfg.action,
      secret: cfg.secret,
      title: safeTitle,
      category,
      academicYear,
      originalName,
      mimeType: file.type || "application/octet-stream",
      fileType,
      base64,
      uploadedBy: auth.user.id,
    });

    return NextResponse.json({
      ok: true,
      fileId: String(result.fileId ?? ""),
      fileUrl: String(result.fileUrl ?? ""),
      fileName: String(result.fileName ?? driveFileName),
      mimeType: String(result.mimeType ?? file.type),
      fileType,
      fileSize: file.size,
    });
  } catch (error) {
    console.error("School library upload error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "ไม่สามารถอัปโหลดไฟล์ไป Google Drive ได้",
      },
      { status: 500 },
    );
  }
}
