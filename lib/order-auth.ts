import "server-only";

import { createClient } from "@supabase/supabase-js";

export type OrderProfile = {
  id: string;
  full_name: string;
  position: string | null;
  role: string;
  account_status: string;
};

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  return url && publishable && service
    ? { url, publishable, service }
    : null;
}

export async function authorizeOrderRequest(request: Request) {
  const cfg = config();

  if (!cfg) {
    return {
      ok: false as const,
      status: 500,
      message: "ตั้งค่า Supabase ฝั่ง Server ไม่ครบ",
    };
  }

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (!token) {
    return {
      ok: false as const,
      status: 401,
      message: "กรุณาเข้าสู่ระบบใหม่",
    };
  }

  const auth = createClient(cfg.url, cfg.publishable, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: authError,
  } = await auth.auth.getUser(token);

  if (authError || !user) {
    return {
      ok: false as const,
      status: 401,
      message: "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่",
    };
  }

  const admin = createClient(cfg.url, cfg.service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, full_name, position, role, account_status")
    .eq("id", user.id)
    .maybeSingle();

  if (
    profileError ||
    !profile ||
    profile.account_status !== "active"
  ) {
    return {
      ok: false as const,
      status: 403,
      message: "บัญชียังไม่พร้อมใช้งาน",
    };
  }

  return {
    ok: true as const,
    admin,
    user,
    profile: profile as OrderProfile,
  };
}

export function isOrderManager(role: string) {
  return role === "director" || role === "admin";
}
