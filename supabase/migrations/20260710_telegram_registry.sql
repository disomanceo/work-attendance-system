-- Telegram registry for private users, groups, supergroups, and channels.
-- Apply this migration in Supabase before relying on webhook persistence.

create table if not exists public.telegram_users (
  telegram_user_id text primary key,
  username text,
  first_name text,
  last_name text,
  language_code text,
  is_bot boolean not null default false,
  is_premium boolean,
  profile_id uuid references public.profiles(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_private_chat_id text,
  is_active boolean not null default true,
  raw_profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.telegram_chats (
  telegram_chat_id text primary key,
  chat_type text not null,
  title text,
  username text,
  first_name text,
  last_name text,
  description text,
  invite_link text,
  member_count integer,
  bot_status text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_message_at timestamptz,
  is_active boolean not null default true,
  raw_chat jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint telegram_chats_type_check
    check (chat_type in ('private', 'group', 'supergroup', 'channel', 'unknown'))
);

create table if not exists public.telegram_chat_members (
  telegram_chat_id text not null references public.telegram_chats(telegram_chat_id) on delete cascade,
  telegram_user_id text not null references public.telegram_users(telegram_user_id) on delete cascade,
  member_status text,
  is_admin boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  is_active boolean not null default true,
  raw_member jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (telegram_chat_id, telegram_user_id)
);

create index if not exists telegram_users_profile_id_idx
  on public.telegram_users(profile_id);

create index if not exists telegram_users_username_idx
  on public.telegram_users(username);

create index if not exists telegram_chats_type_idx
  on public.telegram_chats(chat_type);

create index if not exists telegram_chats_last_seen_idx
  on public.telegram_chats(last_seen_at desc);

create index if not exists telegram_chat_members_user_idx
  on public.telegram_chat_members(telegram_user_id);

alter table public.telegram_users enable row level security;
alter table public.telegram_chats enable row level security;
alter table public.telegram_chat_members enable row level security;

comment on table public.telegram_users is
  'Telegram accounts observed by the bot. profile_id is reserved for later Work Attendance account linking.';

comment on table public.telegram_chats is
  'Private chats, groups, supergroups, and channels observed by the Telegram bot.';

comment on table public.telegram_chat_members is
  'Observed relationship between Telegram users and chats.';
