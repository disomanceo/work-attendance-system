import "server-only";

import { createClient } from "@supabase/supabase-js";

const DEFAULT_ENABLED = true;

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

export async function isTelegramNotificationEnabled(settingKey: string) {
  const client = adminClient();

  const { data: master, error: masterError } = await client
    .from("telegram_notification_settings")
    .select("is_enabled")
    .eq("setting_key", "telegram.enabled")
    .maybeSingle();

  if (masterError) {
    console.error("Cannot load Telegram master setting:", masterError);
    return DEFAULT_ENABLED;
  }

  if (master && master.is_enabled === false) {
    return false;
  }

  const { data, error } = await client
    .from("telegram_notification_settings")
    .select("is_enabled")
    .eq("setting_key", settingKey)
    .maybeSingle();

  if (error) {
    console.error(`Cannot load Telegram setting ${settingKey}:`, error);
    return DEFAULT_ENABLED;
  }

  return data?.is_enabled ?? DEFAULT_ENABLED;
}
