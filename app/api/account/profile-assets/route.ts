import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type ProfileAssetType = "profile" | "signature";

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

async function authorize(request: Request) {
  const config = getServerConfig();

  if (!config) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          message:
            "ยังไม่ได้ตั้งค่า GAS_PROFILE_UPLOAD_URL หรือ GAS_PROFILE_UPLOAD_SECRET",
        },
        { status: 500 }
      ),
    };
  }

  const accessToken = getAccessToken(request);

  if (!accessToken) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, message: "กรุณาเข้าสู่ระบบใหม่" },
        { status: 401 }
      ),
    };
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
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, message: "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่" },
        { status: 401 }
      ),
    };
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

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select(
      "id, full_name, role, account_status, profile_image_file_id, signature_file_id"
    )
    .eq("id", user.id)
    .single();

  if (
    profileError ||
    !profile ||
    profile.account_status !== "active"
  ) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, message: "ไม่มีสิทธิ์ใช้งาน" },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true as const,
    config,
    adminClient,
    profile,
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

export async function POST(request: Request) {
  try {
    const authResult = await authorize(request);

    if (!authResult.ok) {
      return authResult.response;
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const type = String(formData.get("type") || "") as ProfileAssetType;

    if (
      !(file instanceof File) ||
      !["profile", "signature"].includes(type)
    ) {
      return NextResponse.json(
        { ok: false, message: "ข้อมูลอัปโหลดไม่ถูกต้อง" },
        { status: 400 }
      );
    }

    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type)
    ) {
      return NextResponse.json(
        { ok: false, message: "รองรับเฉพาะ JPG, PNG และ WEBP" },
        { status: 400 }
      );
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { ok: false, message: "ไฟล์ต้องมีขนาดไม่เกิน 5 MB" },
        { status: 400 }
      );
    }

    const oldFileId =
      type === "profile"
        ? authResult.profile.profile_image_file_id
        : authResult.profile.signature_file_id;

    const extension =
      file.type === "image/png"
        ? "png"
        : file.type === "image/webp"
          ? "webp"
          : "jpg";

    const safeName = String(authResult.profile.full_name)
      .replace(/[^\p{L}\p{N}-]+/gu, "-")
      .replace(/^-+|-+$/g, "");

    const fileName =
      `${type}-${safeName}-${Date.now()}.${extension}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");

    const gasResult = await callGas(authResult.config.gasUrl, {
      secret: authResult.config.gasSecret,
      action: "upload",
      fileName,
      mimeType: file.type,
      base64,
      description:
        type === "profile"
          ? `Profile image for ${authResult.profile.full_name}`
          : `Signature for ${authResult.profile.full_name}`,
    });

    const fileId =
      typeof gasResult.fileId === "string"
        ? gasResult.fileId
        : "";

    if (!fileId) {
      throw new Error("Google Apps Script ไม่คืนค่า File ID");
    }

    const column =
      type === "profile"
        ? "profile_image_file_id"
        : "signature_file_id";

    const { error: updateError } = await authResult.adminClient
      .from("profiles")
      .update({
        [column]: fileId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", authResult.profile.id);

    if (updateError) {
      await callGas(authResult.config.gasUrl, {
        secret: authResult.config.gasSecret,
        action: "delete",
        fileId,
      }).catch(() => undefined);

      throw updateError;
    }

    if (oldFileId && oldFileId !== fileId) {
      await callGas(authResult.config.gasUrl, {
        secret: authResult.config.gasSecret,
        action: "delete",
        fileId: oldFileId,
      }).catch(() => undefined);
    }

    return NextResponse.json({
      ok: true,
      fileId,
    });
  } catch (error) {
    console.error("GAS profile asset upload error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "ไม่สามารถอัปโหลดไฟล์ได้",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const authResult = await authorize(request);

    if (!authResult.ok) {
      return authResult.response;
    }

    const fileId =
      new URL(request.url).searchParams.get("fileId")?.trim() || "";

    const allowedFileIds = [
      authResult.profile.profile_image_file_id,
      authResult.profile.signature_file_id,
    ].filter(Boolean);

    const ownsRequestedFile = allowedFileIds.includes(fileId);
    let canReadMemberProfileImage = false;

    if (
      fileId &&
      !ownsRequestedFile &&
      ["director", "admin"].includes(authResult.profile.role)
    ) {
      const { data: memberProfile } = await authResult.adminClient
        .from("profiles")
        .select("id")
        .eq("account_status", "active")
        .eq("profile_image_file_id", fileId)
        .limit(1)
        .maybeSingle();

      canReadMemberProfileImage = Boolean(memberProfile);
    }

    if (!fileId || (!ownsRequestedFile && !canReadMemberProfileImage)) {
      return NextResponse.json(
        { ok: false, message: "ไม่มีสิทธิ์เปิดไฟล์นี้" },
        { status: 403 }
      );
    }

    const gasResult = await callGas(authResult.config.gasUrl, {
      secret: authResult.config.gasSecret,
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
    console.error("GAS profile asset read error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "ไม่สามารถเปิดไฟล์ได้",
      },
      { status: 500 }
    );
  }
}
