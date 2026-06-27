import { createClient } from "@supabase/supabase-js";

export type LineMessage = Record<string, unknown>;

export function getLineAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return null;

  return createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function getLineTarget() {
  const envGroupId = process.env.LINE_GROUP_ID?.trim();
  if (envGroupId) {
    return {
      ok: true as const,
      groupId: envGroupId,
      settings: {
        notify_leave_submitted: true,
        notify_leave_reviewed: true,
        notify_daily_attendance: true,
      },
    };
  }

  const admin = getLineAdminClient();
  if (!admin) {
    return { ok: false as const, message: "Supabase Environment Variables ยังไม่ครบ" };
  }

  const { data, error } = await admin
    .from("line_notification_settings")
    .select("group_id,is_enabled,notify_leave_submitted,notify_leave_reviewed,notify_daily_attendance")
    .eq("id", 1)
    .maybeSingle();

  if (error) return { ok: false as const, message: error.message };
  if (!data?.is_enabled || !data.group_id) {
    return { ok: false as const, message: "ยังไม่ได้ลงทะเบียนกลุ่ม LINE" };
  }

  return { ok: true as const, groupId: data.group_id, settings: data };
}

export async function pushLineMessages(to: string, messages: LineMessage[]) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
  if (!token) return { ok: false as const, message: "ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN" };

  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to, messages }),
    cache: "no-store",
  });

  const text = await response.text();
  let detail: unknown = text;
  try { detail = text ? JSON.parse(text) : null; } catch {}

  return response.ok
    ? { ok: true as const, status: response.status }
    : { ok: false as const, status: response.status, message: "LINE ส่งข้อความไม่สำเร็จ", detail };
}

export async function getLineGroupSummary(groupId: string) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
  if (!token) return null;

  const response = await fetch(
    `https://api.line.me/v2/bot/group/${encodeURIComponent(groupId)}/summary`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
  );

  if (!response.ok) return null;
  return (await response.json()) as { groupName?: string };
}
