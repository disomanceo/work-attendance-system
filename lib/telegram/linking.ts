import "server-only";

import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

type LinkCommandInput = {
  text: string;
  telegramUserId?: number;
  chatId: string | number;
  chatType?: string;
};

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

function normalizeLinkCode(value: string) {
  return value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function hashLinkCode(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function parseLinkCode(text: string) {
  const normalized = text.trim();
  const linkMatch = normalized.match(
    /^\/?(?:link|เชื่อม)\s+([A-Za-z0-9-]+)$/i,
  );
  const startMatch = normalized.match(
    /^\/start(?:@\w+)?\s+([A-Za-z0-9-]+)$/i,
  );
  const value = linkMatch?.[1] || startMatch?.[1] || "";
  return value ? normalizeLinkCode(value) : "";
}

export async function handleTelegramLinkCommand(input: LinkCommandInput) {
  const linkCode = parseLinkCode(input.text);
  if (!linkCode) return null;

  if (input.chatType !== "private") {
    return [
      "⚠️ กรุณาเชื่อมบัญชีผ่านแชตส่วนตัวกับ Bot เท่านั้น",
      "",
      "อย่าส่งรหัสเชื่อมบัญชีในกลุ่ม",
    ].join("\n");
  }

  if (!input.telegramUserId) {
    return "⚠️ ไม่พบข้อมูลบัญชี Telegram กรุณาลองใหม่อีกครั้ง";
  }

  const supabase = adminClient();
  const codeHash = hashLinkCode(linkCode);
  const now = new Date().toISOString();

  const { data: token, error: tokenError } = await supabase
    .from("telegram_link_tokens")
    .select("id, profile_id, expires_at, used_at")
    .eq("code_hash", codeHash)
    .maybeSingle();

  if (tokenError) {
    throw new Error(`Cannot verify Telegram link code: ${tokenError.message}`);
  }

  if (!token) {
    return "❌ รหัสเชื่อมบัญชีไม่ถูกต้อง";
  }

  if (token.used_at) {
    return "❌ รหัสเชื่อมบัญชีนี้ถูกใช้แล้ว กรุณาสร้างรหัสใหม่จากระบบ";
  }

  if (new Date(token.expires_at).getTime() <= Date.now()) {
    return "⌛ รหัสเชื่อมบัญชีหมดอายุแล้ว กรุณาสร้างรหัสใหม่จากระบบ";
  }

  const telegramUserId = String(input.telegramUserId);
  const privateChatId = String(input.chatId);

  const { data: existingProfileLink, error: existingLinkError } = await supabase
    .from("telegram_users")
    .select("telegram_user_id")
    .eq("profile_id", token.profile_id)
    .neq("telegram_user_id", telegramUserId)
    .maybeSingle();

  if (existingLinkError) {
    throw new Error(
      `Cannot inspect existing Telegram profile link: ${existingLinkError.message}`,
    );
  }

  if (existingProfileLink) {
    return [
      "⚠️ สมาชิกคนนี้เชื่อมกับบัญชี Telegram อื่นอยู่แล้ว",
      "",
      "กรุณาให้ผู้ดูแลยกเลิกการเชื่อมเดิมก่อน",
    ].join("\n");
  }

  const { error: updateError } = await supabase
    .from("telegram_users")
    .upsert(
      {
        telegram_user_id: telegramUserId,
        profile_id: token.profile_id,
        last_private_chat_id: privateChatId,
        is_active: true,
        last_seen_at: now,
        updated_at: now,
      },
      {
        onConflict: "telegram_user_id",
      },
    );

  if (updateError) {
    throw new Error(`Cannot link Telegram account: ${updateError.message}`);
  }

  const { error: consumeError } = await supabase
    .from("telegram_link_tokens")
    .update({
      used_at: now,
      used_by_telegram_user_id: telegramUserId,
      updated_at: now,
    })
    .eq("id", token.id)
    .is("used_at", null);

  if (consumeError) {
    throw new Error(`Cannot consume Telegram link code: ${consumeError.message}`);
  }

  return [
    "✅ เชื่อมบัญชีสำเร็จ",
    "",
    "ระบบสามารถส่งการแจ้งเตือนส่วนตัวตามงานและสิทธิ์ของคุณได้แล้ว",
  ].join("\n");
}
