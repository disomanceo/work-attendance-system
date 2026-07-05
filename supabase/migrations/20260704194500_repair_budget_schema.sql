-- Repair Budget Supabase schema after text/uuid mismatch.
-- Safe guard: abort when any budget table already contains data.

do $$
declare
  project_count bigint := 0;
  activity_count bigint := 0;
  payment_count bigint := 0;
  project_attachment_count bigint := 0;
  payment_attachment_count bigint := 0;
begin
  if to_regclass('public.budget_projects') is not null then
    execute 'select count(*) from public.budget_projects' into project_count;
  end if;

  if to_regclass('public.budget_activities') is not null then
    execute 'select count(*) from public.budget_activities' into activity_count;
  end if;

  if to_regclass('public.budget_payment_records') is not null then
    execute 'select count(*) from public.budget_payment_records' into payment_count;
  end if;

  if to_regclass('public.budget_project_attachments') is not null then
    execute 'select count(*) from public.budget_project_attachments'
      into project_attachment_count;
  end if;

  if to_regclass('public.budget_payment_attachments') is not null then
    execute 'select count(*) from public.budget_payment_attachments'
      into payment_attachment_count;
  end if;

  if project_count + activity_count + payment_count
     + project_attachment_count + payment_attachment_count > 0 then
    raise exception
      'Budget tables contain data. Repair stopped. Counts: projects %, activities %, payments %, project attachments %, payment attachments %',
      project_count,
      activity_count,
      payment_count,
      project_attachment_count,
      payment_attachment_count;
  end if;
end;
$$;

drop view if exists public.budget_project_financial_summary;

drop table if exists public.budget_payment_attachments cascade;
drop table if exists public.budget_project_attachments cascade;
drop table if exists public.budget_payment_records cascade;
drop table if exists public.budget_activities cascade;
drop table if exists public.budget_projects cascade;

drop function if exists public.set_budget_updated_at();

create extension if not exists pgcrypto;

create table public.budget_projects (
  id uuid primary key default gen_random_uuid(),
  legacy_project_id text unique,
  project_code text,
  fiscal_year integer,
  name text not null,
  plan_name text,
  department text,
  owner_id uuid references public.profiles(id) on delete set null,
  owner_name_snapshot text,
  status text not null default 'ยังไม่เริ่ม',
  approved_budget numeric(14,2) not null default 0,
  legacy_actual_amount numeric(14,2) not null default 0,
  start_date date,
  end_date date,
  funding_sources jsonb not null default '[]'::jsonb,
  custom_funding_source text,
  source_system text not null default 'supabase',
  legacy_payload jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint budget_projects_approved_budget_nonnegative
    check (approved_budget >= 0)
);

create table public.budget_activities (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null
    references public.budget_projects(id) on delete cascade,
  legacy_activity_id text,
  name text not null,
  owner_id uuid references public.profiles(id) on delete set null,
  owner_name_snapshot text,
  status text not null default 'ยังไม่เริ่ม',
  funding_source text,
  approved_budget numeric(14,2) not null default 0,
  legacy_actual_amount numeric(14,2) not null default 0,
  start_date date,
  end_date date,
  sort_order integer not null default 0,
  legacy_payload jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint budget_activities_approved_budget_nonnegative
    check (approved_budget >= 0),
  unique(project_id, legacy_activity_id)
);

create table public.budget_payment_records (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null
    references public.budget_projects(id) on delete restrict,
  activity_id uuid
    references public.budget_activities(id) on delete set null,
  payment_sequence integer,
  installment_label text,
  description text not null,
  amount numeric(14,2) not null,
  notes text,
  status text not null default 'active',
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete set null,
  cancellation_reason text,
  constraint budget_payment_records_amount_positive check (amount > 0),
  constraint budget_payment_records_status_valid
    check (status in ('active', 'cancelled'))
);

create table public.budget_project_attachments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid
    references public.budget_projects(id) on delete cascade,
  activity_id uuid
    references public.budget_activities(id) on delete cascade,
  drive_file_id text not null,
  file_name text not null,
  file_url text not null,
  mime_type text,
  file_size bigint,
  attachment_type text,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references public.profiles(id) on delete set null,
  is_active boolean not null default true,
  removed_at timestamptz,
  removed_by uuid references public.profiles(id) on delete set null,
  legacy_payload jsonb,
  constraint budget_project_attachments_parent_required
    check (project_id is not null or activity_id is not null)
);

create table public.budget_payment_attachments (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null
    references public.budget_payment_records(id) on delete cascade,
  drive_file_id text not null,
  file_name text not null,
  file_url text not null,
  mime_type text,
  file_size bigint,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references public.profiles(id) on delete set null,
  is_active boolean not null default true,
  removed_at timestamptz,
  removed_by uuid references public.profiles(id) on delete set null
);

create unique index budget_project_attachments_drive_file_unique
  on public.budget_project_attachments(drive_file_id)
  where is_active = true;

create unique index budget_payment_attachments_drive_file_unique
  on public.budget_payment_attachments(drive_file_id)
  where is_active = true;

create index budget_projects_fiscal_year_idx
  on public.budget_projects(fiscal_year);
create index budget_projects_status_idx
  on public.budget_projects(status);
create index budget_projects_owner_idx
  on public.budget_projects(owner_id);
create index budget_activities_project_idx
  on public.budget_activities(project_id);
create index budget_payments_project_status_idx
  on public.budget_payment_records(project_id, status);
create index budget_project_attachments_project_idx
  on public.budget_project_attachments(project_id);
create index budget_payment_attachments_payment_idx
  on public.budget_payment_attachments(payment_id);

create function public.set_budget_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_budget_projects_updated_at
before update on public.budget_projects
for each row execute function public.set_budget_updated_at();

create trigger set_budget_activities_updated_at
before update on public.budget_activities
for each row execute function public.set_budget_updated_at();

create trigger set_budget_payment_records_updated_at
before update on public.budget_payment_records
for each row execute function public.set_budget_updated_at();

create view public.budget_project_financial_summary
with (security_invoker = true)
as
select
  p.id as project_id,
  p.legacy_project_id,
  p.approved_budget,
  coalesce(
    sum(r.amount) filter (where r.status = 'active'),
    0
  )::numeric(14,2) as active_payment_total,
  coalesce(
    sum(r.amount) filter (where r.status = 'cancelled'),
    0
  )::numeric(14,2) as cancelled_payment_total,
  (
    p.approved_budget -
    coalesce(sum(r.amount) filter (where r.status = 'active'), 0)
  )::numeric(14,2) as remaining_budget,
  count(r.id) filter (where r.status = 'active')::integer
    as active_payment_count,
  count(r.id) filter (where r.status = 'cancelled')::integer
    as cancelled_payment_count
from public.budget_projects p
left join public.budget_payment_records r
  on r.project_id = p.id
group by p.id;

alter table public.budget_projects enable row level security;
alter table public.budget_activities enable row level security;
alter table public.budget_payment_records enable row level security;
alter table public.budget_project_attachments enable row level security;
alter table public.budget_payment_attachments enable row level security;

create policy "budget_projects_authenticated_read"
on public.budget_projects
for select to authenticated
using (true);

create policy "budget_activities_authenticated_read"
on public.budget_activities
for select to authenticated
using (true);

create policy "budget_payments_authenticated_read"
on public.budget_payment_records
for select to authenticated
using (true);

create policy "budget_project_attachments_authenticated_read"
on public.budget_project_attachments
for select to authenticated
using (true);

create policy "budget_payment_attachments_authenticated_read"
on public.budget_payment_attachments
for select to authenticated
using (true);

comment on table public.budget_projects is
  'Supabase source of truth for budget projects; legacy_project_id preserves Google Sheets ID.';

comment on column public.budget_projects.legacy_actual_amount is
  'Imported historical amount for verification only. New actual spending comes from active payment records.';
