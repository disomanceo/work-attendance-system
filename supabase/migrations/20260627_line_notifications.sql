create table if not exists public.line_notification_settings (
  id integer primary key default 1 check (id = 1),
  group_id text,
  group_name text,
  is_enabled boolean not null default true,
  notify_leave_submitted boolean not null default true,
  notify_leave_reviewed boolean not null default true,
  notify_daily_attendance boolean not null default true,
  report_time time not null default '08:15:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.line_notification_settings (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.line_notification_logs (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  event_type text not null,
  group_id text,
  status text not null check (status in ('sent','failed','skipped')),
  response_detail jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.line_notification_settings enable row level security;
alter table public.line_notification_logs enable row level security;
revoke all on public.line_notification_settings from anon, authenticated;
revoke all on public.line_notification_logs from anon, authenticated;
