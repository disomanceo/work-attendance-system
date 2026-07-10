-- Telegram Phase 2: private workflow notification delivery logs.

create table if not exists public.telegram_notification_logs (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  recipient_profile_id uuid references public.profiles(id) on delete set null,
  telegram_user_id text references public.telegram_users(telegram_user_id) on delete set null,
  telegram_chat_id text,
  entity_type text,
  entity_id text,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  delivery_status text not null,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint telegram_notification_logs_status_check
    check (delivery_status in ('sent', 'skipped', 'failed'))
);

create index if not exists telegram_notification_logs_recipient_idx
  on public.telegram_notification_logs(recipient_profile_id, created_at desc);

create index if not exists telegram_notification_logs_entity_idx
  on public.telegram_notification_logs(entity_type, entity_id, created_at desc);

create index if not exists telegram_notification_logs_event_idx
  on public.telegram_notification_logs(event_name, created_at desc);

create unique index if not exists telegram_users_profile_unique_idx
  on public.telegram_users(profile_id)
  where profile_id is not null;

alter table public.telegram_notification_logs enable row level security;

comment on table public.telegram_notification_logs is
  'Delivery audit for Telegram private workflow notifications.';
