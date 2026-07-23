import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  callSchoolLibraryDriveGas,
  getSchoolLibraryDriveConfig,
} from "@/lib/school-library/drive-gas";
import { normalizeSchoolLibraryCategory } from "@/lib/school-library/categories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_FILE_SIZE = 30 * 1024 * 1024;
const MAX_CHUNK_BASE64_LENGTH = 2_200_000;

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

function numberInRange(value: unknown, min: number, max: number) {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max
    ? number
    : null;
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

    const body = (await request.json().catch(() => null)) as
      | Record<string, unknown>
      | null;

    if (!body) {
      return NextResponse.json(
        { ok: false, message: "ข้อมูล chunk ไม่ถูกต้อง" },
        { status: 400 },
      );
    }

    const uploadId = String(body.uploadId || "").trim();
    const chunkIndex = numberInRange(body.chunkIndex, 0, 500);
    const totalChunks = numberInRange(body.totalChunks, 1, 501);
    const base64 = String(body.base64 || "").trim();
    const fileSize = Number(body.fileSize) || 0;

    if (!uploadId || chunkIndex === null || totalChunks === null) {
      return NextResponse.json(
        { ok: false, message: "ข้อมูลลำดับ chunk ไม่ครบ" },
        { status: 400 },
      );
    }

    if (chunkIndex >= totalChunks) {
      return NextResponse.json(
        { ok: false, message: "ลำดับ chunk ไม่ถูกต้อง" },
        { status: 400 },
      );
    }

    if (!base64 || base64.length > MAX_CHUNK_BASE64_LENGTH) {
      return NextResponse.json(
        { ok: false, message: "chunk มีขนาดใหญ่เกินไป" },
        { status: 400 },
      );
    }

    if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_FILE_SIZE) {
      return NextResponse.json(
        { ok: false, message: "ไฟล์ต้องมีขนาดไม่เกิน 30 MB" },
        { status: 400 },
      );
    }

    const result = await callSchoolLibraryDriveGas(cfg.url, {
      action: "uploadSchoolLibraryFileChunk",
      secret: cfg.secret,
      uploadId,
      chunkIndex,
      totalChunks,
      base64,
      title: String(body.title || "").trim(),
      category: normalizeSchoolLibraryCategory(body.category),
      academicYear: String(body.academicYear || "").trim(),
      originalName: String(body.originalName || "").trim(),
      mimeType: String(body.mimeType || "application/octet-stream"),
      fileType: String(body.fileType || "DRIVE"),
      fileSize,
      uploadedBy: auth.user.id,
    });

    return NextResponse.json({
      ok: true,
      complete: result.complete === true,
      fileId: String(result.fileId ?? ""),
      fileUrl: String(result.fileUrl ?? ""),
      fileName: String(result.fileName ?? body.originalName ?? ""),
      mimeType: String(result.mimeType ?? body.mimeType ?? ""),
      fileType: String(result.fileType ?? body.fileType ?? "DRIVE"),
      fileSize: Number(result.fileSize ?? fileSize),
    });
  } catch (error) {
    console.error("School library chunk upload error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "ไม่สามารถอัปโหลดไฟล์ใหญ่ไป Google Drive ได้",
      },
      { status: 500 },
    );
  }
}
