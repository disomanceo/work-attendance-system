import { randomBytes, createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

function createLinkCode() {
  return randomBytes(6).toString("base64url").replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 8)
    .toUpperCase();
}

function hashLinkCode(value: string) {
  return createHash("sha256").update(value).digest("hex");
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

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile) {
      return NextResponse.json(
        { ok: false, message: "Profile not found" },
        { status: 404 },
      );
    }

    const code = createLinkCode();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);

    await supabase
      .from("telegram_link_tokens")
      .delete()
      .eq("profile_id", profile.id)
      .is("used_at", null);

    const { error: insertError } = await supabase
      .from("telegram_link_tokens")
      .insert({
        profile_id: profile.id,
        code_hash: hashLinkCode(code),
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      throw new Error(`Cannot create Telegram link code: ${insertError.message}`);
    }

    return NextResponse.json({
      ok: true,
      code,
      expiresAt: expiresAt.toISOString(),
      command: `/link ${code}`,
    });
  } catch (error) {
    console.error("Telegram link start error:", error);
    return NextResponse.json(
      { ok: false, message: "Cannot create Telegram link code" },
      { status: 500 },
    );
  }
}
