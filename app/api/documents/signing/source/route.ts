import { NextResponse } from "next/server";
import { requireSmartAreaUser } from "@/lib/smart-area/auth";

export const dynamic = "force-dynamic";

function signingConfig() {
  const url = process.env.SMART_AREA_SIGNING_GAS_URL?.trim();
  const secret = process.env.SMART_AREA_SIGNING_GAS_SECRET?.trim();

  return url && secret ? { url, secret } : null;
}

async function callSigningGas(payload: Record<string, unknown>) {
  const config = signingConfig();

  if (!config) {
    throw new Error(
      "ยังไม่ได้ตั้งค่า SMART_AREA_SIGNING_GAS_URL หรือ SMART_AREA_SIGNING_GAS_SECRET",
    );
  }

  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify({
      secret: config.secret,
      ...payload,
    }),
    cache: "no-store",
    redirect: "follow",
  });

  const raw = await response.text();
  let result: Record<string, unknown>;

  try {
    result = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("Signing API ไม่ได้ตอบกลับเป็น JSON");
  }

  if (!response.ok || result.ok !== true) {
    throw new Error(
      typeof result.message === "string"
        ? result.message
        : "Signing API ทำงานไม่สำเร็จ",
    );
  }

  return result;
}

async function directFetchFile(
  driveFileId: string,
  sourceUrl: string,
): Promise<{ bytes: Buffer; mimeType: string; fileName: string }> {
  const candidates: string[] = [];

  if (driveFileId) {
    candidates.push(
      `https://drive.google.com/uc?export=download&id=${encodeURIComponent(
        driveFileId,
      )}`,
    );
  }

  if (sourceUrl) {
    candidates.push(sourceUrl);
  }

  for (const url of candidates) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        redirect: "follow",
      });

      if (!response.ok) continue;

      const bytes = Buffer.from(await response.arrayBuffer());
      const mimeType =
        response.headers.get("content-type") || "application/octet-stream";

      if (bytes.length > 0) {
        return {
          bytes,
          mimeType,
          fileName: driveFileId ? `${driveFileId}.pdf` : "document.pdf",
        };
      }
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error("ไม่สามารถเปิดไฟล์ต้นฉบับได้");
}

export async function GET(request: Request) {
  const auth = await requireSmartAreaUser(request);

  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, message: auth.message },
      { status: auth.status },
    );
  }

  const isManager =
    auth.profile.role === "admin" || auth.profile.role === "director";

  if (!isManager) {
    return NextResponse.json(
      { ok: false, message: "คุณไม่มีสิทธิ์เปิดไฟล์สำหรับลงนาม" },
      { status: 403 },
    );
  }

  const attachmentId =
    new URL(request.url).searchParams.get("attachmentId")?.trim() || "";

  if (!attachmentId) {
    return NextResponse.json(
      { ok: false, message: "ไม่พบรหัสไฟล์ต้นฉบับ" },
      { status: 400 },
    );
  }

  const { data: attachment, error } = await auth.admin
    .from("smart_area_attachments")
    .select(`
      id,
      drive_file_id,
      source_url,
      file_url,
      file_name,
      mime_type,
      attachment_type,
      status,
      is_active,
      smart_area_books!inner (
        id,
        is_active
      )
    `)
    .eq("id", attachmentId)
    .eq("is_active", true)
    .eq("status", "active")
    .maybeSingle();

  if (error || !attachment) {
    return NextResponse.json(
      { ok: false, message: "ไม่พบไฟล์ต้นฉบับ" },
      { status: 404 },
    );
  }

  const driveFileId = String(attachment.drive_file_id || "").trim();
  const sourceUrl = String(
    attachment.file_url || attachment.source_url || "",
  ).trim();

  try {
    const result = await callSigningGas({
      action: "getFile",
      driveFileId,
      sourceUrl,
    });

    const base64 = typeof result.base64 === "string" ? result.base64 : "";
    const mimeType =
      typeof result.mimeType === "string"
        ? result.mimeType
        : attachment.mime_type || "application/octet-stream";

    if (!base64) {
      throw new Error("Signing API ไม่คืนข้อมูลไฟล์");
    }

    return new NextResponse(Buffer.from(base64, "base64"), {
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(
          String(result.fileName || attachment.file_name || "document.pdf"),
        )}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (gasError) {
    console.error("Signing GAS source error:", gasError);

    try {
      const fallback = await directFetchFile(driveFileId, sourceUrl);

      const responseBytes = new Uint8Array(fallback.bytes);

      return new NextResponse(responseBytes, {
        headers: {
          "Content-Type":
            fallback.mimeType || attachment.mime_type || "application/pdf",
          "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(
            String(attachment.file_name || fallback.fileName || "document.pdf"),
          )}`,
          "Cache-Control": "private, no-store",
        },
      });
    } catch (fallbackError) {
      console.error("Direct source fallback error:", fallbackError);

      return NextResponse.json(
        {
          ok: false,
          message:
            gasError instanceof Error
              ? gasError.message
              : "ไม่สามารถเปิดไฟล์ต้นฉบับได้",
        },
        { status: 502 },
      );
    }
  }
}
