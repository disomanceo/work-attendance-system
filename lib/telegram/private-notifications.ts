import "server-only";

import { createClient } from "@supabase/supabase-js";
import { sendTelegramMessage } from "@/lib/telegram/send-message";

type NotificationEvent =
  | "document.assigned"
  | "document.started"
  | "document.completed"
  | "leave.submitted"
  | "leave.approved"
  | "leave.rejected"
  | "leave.revision_requested"
  | "official_trip.submitted"
  | "official_trip.approved"
  | "official_trip.rejected"
  | "official_duty.submitted"
  | "official_duty.approved"
  | "official_duty.rejected"
  | "memo.submitted"
  | "memo.approved"
  | "memo.acknowledged"
  | "memo.rejected"
  | "memo.revision"
  | "memo.revision_requested"
  | "order.assigned"
  | "order.acknowledged"
  | "order.submitted"
  | "order.resubmitted"
  | "order.approved"
  | "order.revision";

type NotifyProfilesInput = {
  event: NotificationEvent;
  recipientProfileIds: string[];
  text: string;
  entityType?: string;
  entityId?: string;
  actorProfileId?: string;
  metadata?: Record<string, unknown>;
};

type TelegramRecipient = {
  telegram_user_id: string;
  profile_id: string;
  last_private_chat_id: string | null;
  is_active: boolean;
  is_bot: boolean;
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

function uniqueProfileIds(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function notificationAppUrl() {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");

  if (explicit) {
    return explicit;
  }

  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return production ? `https://${production}` : "http://localhost:3000";
}

function buildNotificationButtons(input: NotifyProfilesInput) {
  const baseUrl = notificationAppUrl();
  const metadata = input.metadata ?? {};
  const bookId =
    typeof metadata.bookId === "string" ? metadata.bookId : "";

  if (input.event === "document.assigned") {
    const url = bookId
      ? `${baseUrl}/documents?book=${encodeURIComponent(bookId)}`
      : `${baseUrl}/documents`;

    return [[{ text: "เปิดงาน", url }]];
  }

  if (
    input.event === "document.started" ||
    input.event === "document.completed"
  ) {
    const url = bookId
      ? `${baseUrl}/documents?book=${encodeURIComponent(bookId)}`
      : `${baseUrl}/documents`;

    return [[{ text: "เปิดหนังสือ", url }]];
  }

  if (input.event === "leave.submitted") {
    return [[{ text: "เปิดพิจารณา", url: `${baseUrl}/admin/leave` }]];
  }

  if (
    input.event === "leave.approved" ||
    input.event === "leave.rejected" ||
    input.event === "leave.revision_requested"
  ) {
    return [[{ text: "เปิดรายการลา", url: `${baseUrl}/leave` }]];
  }

  if (input.event === "official_duty.submitted") {
    return [[
      {
        text: "เปิดพิจารณา",
        url: `${baseUrl}/admin/official-duty`,
      },
    ]];
  }

  if (
    input.event === "official_duty.approved" ||
    input.event === "official_duty.rejected"
  ) {
    return [[
      {
        text: "เปิดรายการไปราชการ",
        url: `${baseUrl}/official-duty`,
      },
    ]];
  }

  if (input.event === "memo.submitted") {
    return [[{ text: "เปิดพิจารณา", url: `${baseUrl}/admin/memo` }]];
  }

  if (
    input.event === "memo.approved" ||
    input.event === "memo.acknowledged" ||
    input.event === "memo.rejected" ||
    input.event === "memo.revision" ||
    input.event === "memo.revision_requested"
  ) {
    return [[{ text: "เปิดบันทึกข้อความ", url: `${baseUrl}/memo` }]];
  }

  if (
    input.event === "order.submitted" ||
    input.event === "order.resubmitted"
  ) {
    return [[{ text: "เปิดพิจารณาคำสั่ง", url: `${baseUrl}/orders` }]];
  }

  if (
    input.event === "order.approved" ||
    input.event === "order.revision" ||
    input.event === "order.assigned" ||
    input.event === "order.acknowledged"
  ) {
    return [[{ text: "เปิดรายการคำสั่ง", url: `${baseUrl}/orders` }]];
  }

  return undefined;
}

async function writeLog(input: {
  event: NotificationEvent;
  profileId: string;
  chatId?: string | null;
  telegramUserId?: string | null;
  status: "sent" | "skipped" | "failed";
  errorMessage?: string | null;
  entityType?: string;
  entityId?: string;
  actorProfileId?: string;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await adminClient()
    .from("telegram_notification_logs")
    .insert({
      event_name: input.event,
      recipient_profile_id: input.profileId,
      telegram_user_id: input.telegramUserId || null,
      telegram_chat_id: input.chatId || null,
      entity_type: input.entityType || null,
      entity_id: input.entityId || null,
      actor_profile_id: input.actorProfileId || null,
      delivery_status: input.status,
      error_message: input.errorMessage || null,
      metadata: input.metadata || {},
    });

  if (error) {
    console.error("Cannot save Telegram notification log:", error);
  }
}

export async function notifyTelegramProfiles(input: NotifyProfilesInput) {
  const profileIds = uniqueProfileIds(input.recipientProfileIds);

  if (profileIds.length === 0) {
    return { requested: 0, sent: 0, skipped: 0, failed: 0 };
  }

  const { data, error } = await adminClient()
    .from("telegram_users")
    .select(
      "telegram_user_id, profile_id, last_private_chat_id, is_active, is_bot",
    )
    .in("profile_id", profileIds)
    .eq("is_active", true)
    .eq("is_bot", false);

  if (error) {
    throw new Error(`Cannot load Telegram recipients: ${error.message}`);
  }

  const recipients = (data || []) as TelegramRecipient[];
  const recipientByProfile = new Map(
    recipients.map((recipient) => [recipient.profile_id, recipient]),
  );

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const profileId of profileIds) {
    const recipient = recipientByProfile.get(profileId);

    if (!recipient?.last_private_chat_id) {
      skipped += 1;
      await writeLog({
        event: input.event,
        profileId,
        telegramUserId: recipient?.telegram_user_id,
        status: "skipped",
        errorMessage: "Telegram account is not linked or private chat is unavailable",
        entityType: input.entityType,
        entityId: input.entityId,
        actorProfileId: input.actorProfileId,
        metadata: input.metadata,
      });
      continue;
    }

    try {
      await sendTelegramMessage(
        recipient.last_private_chat_id,
        input.text,
        { buttons: buildNotificationButtons(input) }
      );
      sent += 1;

      await writeLog({
        event: input.event,
        profileId,
        telegramUserId: recipient.telegram_user_id,
        chatId: recipient.last_private_chat_id,
        status: "sent",
        entityType: input.entityType,
        entityId: input.entityId,
        actorProfileId: input.actorProfileId,
        metadata: input.metadata,
      });
    } catch (notificationError) {
      failed += 1;
      const errorMessage =
        notificationError instanceof Error
          ? notificationError.message
          : "Unknown Telegram delivery error";

      await writeLog({
        event: input.event,
        profileId,
        telegramUserId: recipient.telegram_user_id,
        chatId: recipient.last_private_chat_id,
        status: "failed",
        errorMessage,
        entityType: input.entityType,
        entityId: input.entityId,
        actorProfileId: input.actorProfileId,
        metadata: input.metadata,
      });
    }
  }

  return {
    requested: profileIds.length,
    sent,
    skipped,
    failed,
  };
}
