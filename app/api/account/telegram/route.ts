import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendTelegramMessage } from "@/lib/telegram/send-message";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getAccessToken(request: Request) {
  const authorization = request.headers.get("authorization");
  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

function getConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN?.trim();

  if (!supabaseUrl || !publishableKey || !serviceRoleKey || !telegramToken) {
    return null;
  }

  return { supabaseUrl, publishableKey, serviceRoleKey, telegramToken };
}

async function authorize(request: Request) {
  const config = getConfig();

  if (!config) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, message: "ยังตั้งค่าระบบ Telegram ไม่ครบ" },
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

  const authClient = createClient(
    config.supabaseUrl,
    config.publishableKey,
    { auth: { persistSession: false, autoRefreshToken: false } },
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
        { status: 401 },
      ),
    };
  }

  const adminClient = createClient(
    config.supabaseUrl,
    config.serviceRoleKey,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("id, full_name, account_status")
    .eq("id", user.id)
    .single();

  if (profileError || !profile || profile.account_status !== "active") {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, message: "ไม่มีสิทธิ์ใช้งาน" },
        { status: 403 },
      ),
    };
  }

  return { ok: true as const, config, adminClient, profile };
}

async function getBotUsername(token: string) {
  const response = await fetch(
    `https://api.telegram.org/bot${token}/getMe`,
    { cache: "no-store" },
  );

  const payload = (await response.json()) as {
    ok?: boolean;
    result?: { username?: string };
  };

  const username = payload.result?.username?.trim();

  if (!response.ok || !payload.ok || !username) {
    throw new Error("ไม่สามารถอ่านชื่อ Telegram Bot ได้");
  }

  return username;
}

export async function GET(request: Request) {
  const auth = await authorize(request);
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.adminClient
    .from("telegram_users")
    .select(
      "telegram_user_id, username, first_name, last_name, last_private_chat_id, is_active",
    )
    .eq("profile_id", auth.profile.id)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    connected: Boolean(data?.last_private_chat_id),
    telegram: data
      ? {
          userId: data.telegram_user_id,
          username: data.username,
          firstName: data.first_name,
          lastName: data.last_name,
        }
      : null,
  });
}

export async function POST(request: Request) {
  const auth = await authorize(request);
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
  };

  if (body.action === "test") {
    const { data, error } = await auth.adminClient
      .from("telegram_users")
      .select("last_private_chat_id")
      .eq("profile_id", auth.profile.id)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { ok: false, message: error.message },
        { status: 500 },
      );
    }

    if (!data?.last_private_chat_id) {
      return NextResponse.json(
        { ok: false, message: "ยังไม่ได้เชื่อม Telegram" },
        { status: 400 },
      );
    }

    await sendTelegramMessage(
      data.last_private_chat_id,
      [
        "✅ <b>ทดสอบการแจ้งเตือนสำเร็จ</b>",
        "",
        `บัญชีของ ${auth.profile.full_name} เชื่อมกับระบบเรียบร้อยแล้ว`,
      ].join("\n"),
    );

    return NextResponse.json({
      ok: true,
      message: "ส่งข้อความทดสอบแล้ว",
    });
  }

  const plainCode = randomBytes(12).toString("hex").toUpperCase();
  const codeHash = createHash("sha256").update(plainCode).digest("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString();

  await auth.adminClient
    .from("telegram_link_tokens")
    .update({
      used_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("profile_id", auth.profile.id)
    .is("used_at", null);

  const { error: tokenError } = await auth.adminClient
    .from("telegram_link_tokens")
    .insert({
      profile_id: auth.profile.id,
      code_hash: codeHash,
      expires_at: expiresAt,
      updated_at: now.toISOString(),
    });

  if (tokenError) {
    return NextResponse.json(
      { ok: false, message: tokenError.message },
      { status: 500 },
    );
  }

  const username = await getBotUsername(auth.config.telegramToken);

  return NextResponse.json({
    ok: true,
    url: `https://t.me/${username}?start=${plainCode}`,
    expiresAt,
  });
}

export async function DELETE(request: Request) {
  const auth = await authorize(request);
  if (!auth.ok) return auth.response;

  const { error } = await auth.adminClient
    .from("telegram_users")
    .update({
      profile_id: null,
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("profile_id", auth.profile.id);

  if (error) {
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    message: "ยกเลิกการเชื่อม Telegram แล้ว",
  });
}
