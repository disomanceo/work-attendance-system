import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAccessToken(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return "";
  }

  return authorization.slice("Bearer ".length).trim();
}

function getServerConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const gasUrl = process.env.GAS_PROFILE_UPLOAD_URL;
  const gasSecret = process.env.GAS_PROFILE_UPLOAD_SECRET;

  if (
    !supabaseUrl ||
    !publishableKey ||
    !serviceRoleKey ||
    !gasUrl ||
    !gasSecret
  ) {
    return null;
  }

  return {
    supabaseUrl,
    publishableKey,
    serviceRoleKey,
    gasUrl,
    gasSecret,
  };
}

async function callGas(
  gasUrl: string,
  payload: Record<string, unknown>
) {
  const response = await fetch(gasUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
    redirect: "follow",
  });

  const text = await response.text();

  let result: Record<string, unknown>;

  try {
    result = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(
      "Google Apps Script ไม่ได้ตอบกลับเป็น JSON กรุณาตรวจสอบ Web App URL"
    );
  }

  if (!response.ok || result.ok !== true) {
    throw new Error(
      typeof result.message === "string"
        ? result.message
        : "Google Apps Script ทำงานไม่สำเร็จ"
    );
  }

  return result;
}

export async function GET(request: Request) {
  try {
    const config = getServerConfig();

    if (!config) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "ยังไม่ได้ตั้งค่า GAS_PROFILE_UPLOAD_URL หรือ GAS_PROFILE_UPLOAD_SECRET",
        },
        { status: 500 }
      );
    }

    const accessToken = getAccessToken(request);

    if (!accessToken) {
      return NextResponse.json(
        { ok: false, message: "กรุณาเข้าสู่ระบบใหม่" },
        { status: 401 }
      );
    }

    const authClient = createClient(
      config.supabaseUrl,
      config.publishableKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json(
        { ok: false, message: "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่" },
        { status: 401 }
      );
    }

    const adminClient = createClient(
      config.supabaseUrl,
      config.serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const { data: requester, error: requesterError } =
      await adminClient
        .from("profiles")
        .select("id, role, account_status")
        .eq("id", user.id)
        .single();

    if (
      requesterError ||
      !requester ||
      requester.account_status !== "active" ||
      !["admin", "director"].includes(requester.role)
    ) {
      return NextResponse.json(
        { ok: false, message: "คุณไม่มีสิทธิ์ดูลายเซ็นสมาชิก" },
        { status: 403 }
      );
    }

    const fileId =
      new URL(request.url).searchParams.get("fileId")?.trim() || "";

    if (!fileId) {
      return NextResponse.json(
        { ok: false, message: "ไม่พบรหัสไฟล์ลายเซ็น" },
        { status: 400 }
      );
    }

    const { data: memberProfile, error: memberError } =
      await adminClient
        .from("profiles")
        .select("id")
        .not("phone", "like", "deleted:%")
        .eq("signature_file_id", fileId)
        .limit(1)
        .maybeSingle();

    if (memberError) {
      console.error("Check member signature permission error:", memberError);

      return NextResponse.json(
        { ok: false, message: "ไม่สามารถตรวจสอบสิทธิ์ไฟล์ลายเซ็นได้" },
        { status: 500 }
      );
    }

    if (!memberProfile) {
      return NextResponse.json(
        { ok: false, message: "ไม่มีสิทธิ์เปิดไฟล์ลายเซ็นนี้" },
        { status: 403 }
      );
    }

    const gasResult = await callGas(config.gasUrl, {
      secret: config.gasSecret,
      action: "get",
      fileId,
    });

    const base64 =
      typeof gasResult.base64 === "string"
        ? gasResult.base64
        : "";

    const mimeType =
      typeof gasResult.mimeType === "string"
        ? gasResult.mimeType
        : "application/octet-stream";

    if (!base64) {
      throw new Error("Google Apps Script ไม่คืนข้อมูลไฟล์");
    }

    return new NextResponse(Buffer.from(base64, "base64"), {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    console.error("Admin member signature read error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "ไม่สามารถเปิดลายเซ็นสมาชิกได้",
      },
      { status: 500 }
    );
  }
}
