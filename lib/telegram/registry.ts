import "server-only";

import { createClient } from "@supabase/supabase-js";

type TelegramUser = {
  id?: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
};

type TelegramChat = {
  id?: number;
  type?: string;
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  description?: string;
  invite_link?: string;
};

type TelegramChatMember = {
  status?: string;
  user?: TelegramUser;
};

type TelegramMessage = {
  date?: number;
  from?: TelegramUser;
  chat?: TelegramChat;
};

export type TelegramRegistryUpdate = {
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
  my_chat_member?: {
    date?: number;
    from?: TelegramUser;
    chat?: TelegramChat;
    old_chat_member?: TelegramChatMember;
    new_chat_member?: TelegramChatMember;
  };
  chat_member?: {
    date?: number;
    from?: TelegramUser;
    chat?: TelegramChat;
    old_chat_member?: TelegramChatMember;
    new_chat_member?: TelegramChatMember;
  };
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

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function chatType(value: unknown) {
  const type = stringValue(value);

  if (["private", "group", "supergroup", "channel"].includes(type)) {
    return type;
  }

  return "unknown";
}

function isoFromUnix(value: unknown) {
  const seconds = Number(value);

  if (!Number.isFinite(seconds) || seconds <= 0) {
    return new Date().toISOString();
  }

  return new Date(seconds * 1000).toISOString();
}

function userPayload(user: TelegramUser, privateChatId?: string) {
  return {
    telegram_user_id: String(user.id),
    username: stringValue(user.username) || null,
    first_name: stringValue(user.first_name) || null,
    last_name: stringValue(user.last_name) || null,
    language_code: stringValue(user.language_code) || null,
    is_bot: user.is_bot === true,
    is_premium:
      typeof user.is_premium === "boolean" ? user.is_premium : null,
    last_private_chat_id: privateChatId || null,
    last_seen_at: new Date().toISOString(),
    is_active: true,
    raw_profile: user,
    updated_at: new Date().toISOString(),
  };
}

function chatPayload(
  chat: TelegramChat,
  seenAt: string,
  botStatus?: string,
) {
  return {
    telegram_chat_id: String(chat.id),
    chat_type: chatType(chat.type),
    title: stringValue(chat.title) || null,
    username: stringValue(chat.username) || null,
    first_name: stringValue(chat.first_name) || null,
    last_name: stringValue(chat.last_name) || null,
    description: stringValue(chat.description) || null,
    invite_link: stringValue(chat.invite_link) || null,
    bot_status: botStatus || null,
    last_seen_at: seenAt,
    last_message_at: seenAt,
    is_active: !["left", "kicked"].includes(botStatus || ""),
    raw_chat: chat,
    updated_at: new Date().toISOString(),
  };
}

async function upsertUser(
  user: TelegramUser | undefined,
  privateChatId?: string,
) {
  if (!user?.id) return;

  const { error } = await adminClient()
    .from("telegram_users")
    .upsert(userPayload(user, privateChatId), {
      onConflict: "telegram_user_id",
    });

  if (error) {
    throw new Error(`Cannot save Telegram user: ${error.message}`);
  }
}

async function upsertChat(
  chat: TelegramChat | undefined,
  seenAt: string,
  botStatus?: string,
) {
  if (!chat?.id) return;

  const { error } = await adminClient()
    .from("telegram_chats")
    .upsert(chatPayload(chat, seenAt, botStatus), {
      onConflict: "telegram_chat_id",
    });

  if (error) {
    throw new Error(`Cannot save Telegram chat: ${error.message}`);
  }
}

async function upsertMembership(
  chat: TelegramChat | undefined,
  user: TelegramUser | undefined,
  status: string,
  seenAt: string,
) {
  if (!chat?.id || !user?.id) return;

  const { error } = await adminClient()
    .from("telegram_chat_members")
    .upsert(
      {
        telegram_chat_id: String(chat.id),
        telegram_user_id: String(user.id),
        member_status: status || "observed",
        is_admin: ["administrator", "creator"].includes(status),
        last_seen_at: seenAt,
        is_active: !["left", "kicked"].includes(status),
        raw_member: {
          status: status || "observed",
          user,
        },
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "telegram_chat_id,telegram_user_id",
      },
    );

  if (error) {
    throw new Error(`Cannot save Telegram membership: ${error.message}`);
  }
}

function primaryMessage(update: TelegramRegistryUpdate) {
  return (
    update.message ||
    update.edited_message ||
    update.channel_post ||
    update.edited_channel_post
  );
}

export async function registerTelegramUpdate(
  update: TelegramRegistryUpdate,
) {
  const message = primaryMessage(update);

  if (message?.chat?.id) {
    const seenAt = isoFromUnix(message.date);
    const privateChatId =
      message.chat.type === "private"
        ? String(message.chat.id)
        : undefined;

    await upsertChat(message.chat, seenAt);
    await upsertUser(message.from, privateChatId);
    await upsertMembership(
      message.chat,
      message.from,
      "observed",
      seenAt,
    );
  }

  const memberUpdate = update.my_chat_member || update.chat_member;

  if (memberUpdate?.chat?.id) {
    const seenAt = isoFromUnix(memberUpdate.date);
    const changedMember = memberUpdate.new_chat_member;
    const changedUser = changedMember?.user;
    const status = stringValue(changedMember?.status) || "observed";

    await upsertChat(
      memberUpdate.chat,
      seenAt,
      update.my_chat_member ? status : undefined,
    );
    await upsertUser(memberUpdate.from);
    await upsertUser(changedUser);
    await upsertMembership(
      memberUpdate.chat,
      changedUser,
      status,
      seenAt,
    );
    await upsertMembership(
      memberUpdate.chat,
      memberUpdate.from,
      "actor",
      seenAt,
    );
  }

  return { saved: true };
}
