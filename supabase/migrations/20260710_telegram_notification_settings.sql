create table if not exists public.telegram_notification_settings (
  setting_key text primary key,
  is_enabled boolean not null default true,
  updated_by uuid null references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.telegram_notification_settings enable row level security;

insert into public.telegram_notification_settings (setting_key, is_enabled)
values
  ('telegram.enabled', true),
  ('attendance.check_in_group', true),
  ('attendance.daily_summary', true),
  ('document.assigned', true),
  ('document.started', true),
  ('document.completed', true),
  ('leave.submitted', true),
  ('leave.approved', true),
  ('leave.rejected', true),
  ('official_duty.submitted', true),
  ('official_duty.approved', true),
  ('official_duty.rejected', true),
  ('memo.submitted', true),
  ('memo.approved', true),
  ('memo.acknowledged', true),
  ('memo.rejected', true),
  ('memo.revision', true),
  ('order.submitted', true),
  ('order.resubmitted', true),
  ('order.approved', true),
  ('order.revision', true)
on conflict (setting_key) do nothing;
