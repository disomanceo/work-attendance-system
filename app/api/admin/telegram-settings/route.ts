import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !service) {
    throw new Error("Supabase server environment variables are not configured");
  }

  return createClient(url, service, {
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

async function requireAdmin(request: Request) {
  const token = bearerToken(request);

  if (!token) {
    return { error: "Missing access token", status: 401 } as const;
  }

  const client = adminClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser(token);

  if (error || !user) {
    return { error: "Invalid session", status: 401 } as const;
  }

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("role, account_status")
    .eq("id", user.id)
    .maybeSingle();

  if (
    profileError ||
    !profile ||
    profile.account_status !== "active" ||
    !["admin", "director"].includes(profile.role)
  ) {
    return { error: "Forbidden", status: 403 } as const;
  }

  return { user, client } as const;
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);

  if ("error" in auth) {
    return NextResponse.json(
      { ok: false, message: auth.error },
      { status: auth.status }
    );
  }

  const { data, error } = await auth.client
    .from("telegram_notification_settings")
    .select("setting_key, is_enabled, updated_at")
    .order("setting_key");

  if (error) {
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    settings: Object.fromEntries(
      (data ?? []).map((item) => [item.setting_key, item.is_enabled])
    ),
  });
}

export async function PUT(request: Request) {
  const auth = await requireAdmin(request);

  if ("error" in auth) {
    return NextResponse.json(
      { ok: false, message: auth.error },
      { status: auth.status }
    );
  }

  const body = (await request.json()) as {
    settings?: Record<string, unknown>;
  };

  const entries = Object.entries(body.settings ?? {}).filter(
    ([key, value]) =>
      typeof key === "string" && typeof value === "boolean"
  );

  if (entries.length === 0) {
    return NextResponse.json(
      { ok: false, message: "No settings to save" },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const rows = entries.map(([setting_key, is_enabled]) => ({
    setting_key,
    is_enabled,
    updated_by: auth.user.id,
    updated_at: now,
  }));

  const { error } = await auth.client
    .from("telegram_notification_settings")
    .upsert(rows, { onConflict: "setting_key" });

  if (error) {
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
