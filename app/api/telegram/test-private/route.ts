import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyTelegramProfiles } from "@/lib/telegram/private-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function adminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase server environment variables are not configured");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

export async function POST(request: Request) {
  try {
    const accessToken = bearerToken(request);

    if (!accessToken) {
      return NextResponse.json(
        { ok: false, message: "Missing access token" },
        { status: 401 },
      );
    }

    const supabase = adminClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json(
        { ok: false, message: "Invalid session" },
        { status: 401 },
      );
    }

    const result = await notifyTelegramProfiles({
      event: "document.assigned",
      recipientProfileIds: [user.id],
      actorProfileId: user.id,
      entityType: "telegram_private_self_test",
      entityId: user.id,
      text: [
        "🧪 <b>ทดสอบ Telegram Phase 2</b>",
        "",
        "บัญชี Telegram ของคุณเชื่อมกับระบบเรียบร้อยแล้ว",
        "ระบบสามารถส่งการแจ้งเตือนส่วนตัวตามงานและสิทธิ์ได้",
      ].join("\n"),
      metadata: {
        source: "self_test",
      },
    });

    const delivered = result.sent > 0;

    return NextResponse.json(
      {
        ok: delivered,
        delivered,
        result,
        message: delivered
          ? "Telegram private message sent"
          : "Telegram account is not linked or private chat is unavailable",
      },
      { status: delivered ? 200 : 409 },
    );
  } catch (error) {
    console.error("Telegram private self-test failed:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Cannot send Telegram private test message",
      },
      { status: 500 },
    );
  }
}
