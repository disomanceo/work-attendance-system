import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type GasFileResponse = {
  ok?: boolean;
  message?: string;
  base64?: string;
  mimeType?: string;
  fileName?: string;
};

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const leaveGasUrl = process.env.GAS_LEAVE_DOCUMENT_URL;
  const leaveGasSecret = process.env.LEAVE_DOCUMENT_SECRET;

  if (
    !url ||
    !publishable ||
    !service ||
    !leaveGasUrl ||
    !leaveGasSecret
  ) {
    return null;
  }

  return {
    url,
    publishable,
    service,
    leaveGasUrl,
    leaveGasSecret,
  };
}

async function callGas(
  url: string,
  payload: Record<string, unknown>,
  timeoutMs = 50000
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        "Google Apps Script ตอบกลับช้าเกิน 50 วินาที กรุณาตรวจสอบ Deployment และสิทธิ์การเข้าถึง"
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  let result: GasFileResponse;

  try {
    result = JSON.parse(text) as GasFileResponse;
  } catch {
    throw new Error("Google Apps Script ไม่ได้ตอบกลับเป็น JSON");
  }

  if (!response.ok || result.ok !== true) {
    throw new Error(result.message || "ไม่สามารถโหลดหลักฐานจาก Drive ได้");
  }

  return result;
}

export async function GET(request: Request) {
  try {
    const cfg = config();
    if (!cfg) throw new Error("Environment Variables ยังไม่ครบ");

    const tokenHeader = request.headers.get("authorization") ?? "";
    const token = tokenHeader.startsWith("Bearer ")
      ? tokenHeader.slice(7).trim()
      : "";

    const auth = createClient(cfg.url, cfg.publishable, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
    } = await auth.auth.getUser(token);

    if (!user) {
      return NextResponse.json(
        { ok: false, message: "กรุณาเข้าสู่ระบบ" },
        { status: 401 }
      );
    }

    const admin = createClient(cfg.url, cfg.service, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const requestId = new URL(request.url).searchParams.get("requestId");

    if (!requestId) {
      return NextResponse.json(
        { ok: false, message: "ไม่พบ requestId" },
        { status: 400 }
      );
    }

    const { data: viewer } = await admin
      .from("profiles")
      .select("role, account_status")
      .eq("id", user.id)
      .maybeSingle();

    const { data: leave } = await admin
      .from("leave_requests")
      .select(
        "user_id, status, evidence_file_id, attachment_name, attachment_mime_type"
      )
      .eq("id", requestId)
      .maybeSingle();

    if (!leave?.evidence_file_id) {
      return NextResponse.json(
        {
          ok: false,
          message:
            leave?.status === "pending"
              ? "ไม่พบหลักฐานแนบ"
              : "หลักฐานถูกรวมไว้ใน PDF ฉบับสมบูรณ์แล้ว",
        },
        { status: 404 }
      );
    }

    const canRead =
      leave.user_id === user.id ||
      (viewer?.account_status === "active" &&
        ["admin", "director"].includes(viewer.role));

    if (!canRead) {
      return NextResponse.json(
        { ok: false, message: "ไม่มีสิทธิ์ดูไฟล์นี้" },
        { status: 403 }
      );
    }

    const result = await callGas(cfg.leaveGasUrl, {
      action: "leaveGetFile",
      secret: cfg.leaveGasSecret,
      fileId: leave.evidence_file_id,
    });

    if (!result.base64) {
      throw new Error("GAS ไม่คืนข้อมูลหลักฐาน");
    }

    const body = Buffer.from(result.base64, "base64");

    return new NextResponse(body, {
      headers: {
        "Content-Type":
          result.mimeType ||
          leave.attachment_mime_type ||
          "application/octet-stream",
        "Content-Length": String(body.length),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(
          result.fileName || leave.attachment_name || "หลักฐานการลา"
        )}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "เกิดข้อผิดพลาด",
      },
      { status: 500 }
    );
  }
}
