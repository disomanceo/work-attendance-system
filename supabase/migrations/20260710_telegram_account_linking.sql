-- Telegram Phase 2: one-time account linking codes.

create table if not exists public.telegram_link_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  code_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by_telegram_user_id text references public.telegram_users(telegram_user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists telegram_link_tokens_profile_idx
  on public.telegram_link_tokens(profile_id, created_at desc);

create index if not exists telegram_link_tokens_expiry_idx
  on public.telegram_link_tokens(expires_at)
  where used_at is null;

create unique index if not exists telegram_users_profile_unique_idx
  on public.telegram_users(profile_id)
  where profile_id is not null;

alter table public.telegram_link_tokens enable row level security;

comment on table public.telegram_link_tokens is
  'Short-lived one-time codes used to link an authenticated profile to a private Telegram account.';
