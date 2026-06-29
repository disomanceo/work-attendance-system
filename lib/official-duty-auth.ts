import { createClient } from "@supabase/supabase-js";

export function officialDutyConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const gasUrl = process.env.GAS_OFFICIAL_DUTY_URL;
  const gasSecret = process.env.OFFICIAL_DUTY_GAS_SECRET;

  if (!url || !publishable || !service || !gasUrl || !gasSecret) {
    throw new Error("Environment Variables ของระบบไปราชการยังไม่ครบ");
  }

  return { url, publishable, service, gasUrl, gasSecret };
}

export async function authorizeOfficialDuty(request: Request) {
  const cfg = officialDutyConfig();
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (!token) {
    return { ok: false as const, status: 401, message: "กรุณาเข้าสู่ระบบ" };
  }

  const auth = createClient(cfg.url, cfg.publishable, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user }, error } = await auth.auth.getUser(token);

  if (error || !user) {
    return { ok: false as const, status: 401, message: "Session หมดอายุ" };
  }

  const admin = createClient(cfg.url, cfg.service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: profile } = await admin
    .from("profiles")
    .select("id,full_name,position,role,account_status")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.account_status !== "active") {
    return { ok: false as const, status: 403, message: "บัญชียังไม่พร้อมใช้งาน" };
  }

  return { ok: true as const, user, profile, admin, cfg };
}

export async function callOfficialDutyGas(
  url: string,
  payload: Record<string, unknown>
) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
    cache: "no-store",
    redirect: "follow",
  });

  const text = await response.text();
  let result: Record<string, unknown>;

  try {
    result = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("Google Apps Script ไม่ได้ตอบกลับเป็น JSON");
  }

  if (!response.ok || result.ok !== true) {
    throw new Error(
      typeof result.message === "string"
        ? result.message
        : "อัปโหลดไฟล์ไปราชการไม่สำเร็จ"
    );
  }

  return result;
}
