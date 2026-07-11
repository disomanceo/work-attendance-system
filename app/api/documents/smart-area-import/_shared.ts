import { createClient } from "@supabase/supabase-js";
export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase server config");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function requireUser(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const admin = adminClient();
  const { data } = await admin.auth.getUser(token);
  return data.user || null;
}
