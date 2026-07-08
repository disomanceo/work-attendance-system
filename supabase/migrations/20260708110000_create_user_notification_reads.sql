create table if not exists public.user_notification_reads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  notification_key text not null,
  notification_kind text not null,
  reference_id text,
  seen_at timestamptz,
  dismissed_at timestamptz,
  dismiss_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, notification_key),
  constraint user_notification_reads_key_not_blank check (btrim(notification_key) <> ''),
  constraint user_notification_reads_kind_not_blank check (btrim(notification_kind) <> ''),
  constraint user_notification_reads_dismiss_count_nonnegative check (dismiss_count >= 0)
);

create index if not exists user_notification_reads_user_kind_idx
  on public.user_notification_reads(user_id, notification_kind);

create index if not exists user_notification_reads_user_seen_idx
  on public.user_notification_reads(user_id, seen_at);

create or replace function public.set_user_notification_reads_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_user_notification_reads_updated_at
  on public.user_notification_reads;

create trigger set_user_notification_reads_updated_at
before update on public.user_notification_reads
for each row execute function public.set_user_notification_reads_updated_at();

alter table public.user_notification_reads enable row level security;

drop policy if exists "user_notification_reads_select_own"
  on public.user_notification_reads;

create policy "user_notification_reads_select_own"
  on public.user_notification_reads
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "user_notification_reads_insert_own"
  on public.user_notification_reads;

create policy "user_notification_reads_insert_own"
  on public.user_notification_reads
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "user_notification_reads_update_own"
  on public.user_notification_reads;

create policy "user_notification_reads_update_own"
  on public.user_notification_reads
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant all on table public.user_notification_reads to service_role;
grant select, insert, update on table public.user_notification_reads to authenticated;

revoke all on function public.set_user_notification_reads_updated_at()
  from anon, authenticated;
grant execute on function public.set_user_notification_reads_updated_at()
  to service_role;
