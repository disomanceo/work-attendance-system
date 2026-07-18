create table if not exists public.order_document_recipients (
  id uuid primary key default gen_random_uuid(),
  order_document_id uuid not null references public.order_documents(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  recipient_name_snapshot text not null,
  recipient_position_snapshot text,
  notified_by uuid references public.profiles(id) on delete set null,
  notified_at timestamptz not null default now(),
  acknowledged_by uuid references public.profiles(id) on delete set null,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_document_id, profile_id),
  constraint order_document_recipients_name_not_blank
    check (btrim(recipient_name_snapshot) <> '')
);

create index if not exists order_document_recipients_order_idx
  on public.order_document_recipients(order_document_id);

create index if not exists order_document_recipients_profile_idx
  on public.order_document_recipients(profile_id);

create index if not exists order_document_recipients_pending_idx
  on public.order_document_recipients(profile_id, acknowledged_at)
  where acknowledged_at is null;

create or replace function public.set_order_document_recipients_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_order_document_recipients_updated_at
  on public.order_document_recipients;

create trigger set_order_document_recipients_updated_at
before update on public.order_document_recipients
for each row execute function public.set_order_document_recipients_updated_at();

alter table public.order_document_recipients enable row level security;

drop policy if exists "order_document_recipients_select_related"
  on public.order_document_recipients;

create policy "order_document_recipients_select_related"
  on public.order_document_recipients
  for select
  to authenticated
  using (
    (select auth.uid()) = profile_id
    or exists (
      select 1
      from public.profiles manager_profile
      where manager_profile.id = (select auth.uid())
        and manager_profile.account_status = 'active'
        and manager_profile.role in ('director', 'admin')
    )
  );

drop policy if exists "order_document_recipients_update_own_ack"
  on public.order_document_recipients;

create policy "order_document_recipients_update_own_ack"
  on public.order_document_recipients
  for update
  to authenticated
  using ((select auth.uid()) = profile_id)
  with check ((select auth.uid()) = profile_id);

grant all on table public.order_document_recipients to service_role;
grant select, update on table public.order_document_recipients to authenticated;

revoke all on function public.set_order_document_recipients_updated_at()
  from anon, authenticated;
grant execute on function public.set_order_document_recipients_updated_at()
  to service_role;
