import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type BudgetSupabaseConfig = {
  url: string;
  publishableKey: string;
  serviceRoleKey: string;
};

export function getBudgetSupabaseConfig(): BudgetSupabaseConfig {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !publishableKey || !serviceRoleKey) {
    throw new Error("ยังตั้งค่า Supabase ฝั่ง Server ไม่ครบ");
  }

  return { url, publishableKey, serviceRoleKey };
}

export function createBudgetAdminClient(): SupabaseClient {
  const config = getBudgetSupabaseConfig();

  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function requireBudgetUser(request: Request) {
  const config = getBudgetSupabaseConfig();
  const authorization = request.headers.get("authorization") ?? "";
  const accessToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (!accessToken) {
    return { ok: false as const, status: 401, message: "กรุณาเข้าสู่ระบบใหม่" };
  }

  const authClient = createClient(config.url, config.publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const {
    data: { user },
    error,
  } = await authClient.auth.getUser(accessToken);

  if (error || !user) {
    return {
      ok: false as const,
      status: 401,
      message: "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่",
    };
  }

  const admin = createBudgetAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, full_name, role, position, account_status")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile || profile.account_status !== "active") {
    return {
      ok: false as const,
      status: 403,
      message: "บัญชีผู้ใช้ยังไม่พร้อมใช้งาน",
    };
  }

  return { ok: true as const, user, profile, admin };
}
