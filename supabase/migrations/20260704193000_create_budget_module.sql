-- Work Attendance System: Budget module migration to Supabase
-- Generated for branch feature/budget-module
-- Apply this file in Supabase SQL Editor before running the importer.

create extension if not exists pgcrypto;

create table if not exists public.budget_projects (
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
  constraint budget_projects_approved_budget_nonnegative check (approved_budget >= 0)
);

create table if not exists public.budget_activities (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.budget_projects(id) on delete cascade,
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
  constraint budget_activities_approved_budget_nonnegative check (approved_budget >= 0),
  unique(project_id, legacy_activity_id)
);

create table if not exists public.budget_payment_records (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.budget_projects(id) on delete restrict,
  activity_id uuid references public.budget_activities(id) on delete set null,
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
  constraint budget_payment_records_status_valid check (status in ('active', 'cancelled'))
);

create table if not exists public.budget_project_attachments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.budget_projects(id) on delete cascade,
  activity_id uuid references public.budget_activities(id) on delete cascade,
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

create unique index if not exists budget_project_attachments_drive_file_unique
  on public.budget_project_attachments(drive_file_id)
  where is_active = true;

create table if not exists public.budget_payment_attachments (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.budget_payment_records(id) on delete cascade,
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

create unique index if not exists budget_payment_attachments_drive_file_unique
  on public.budget_payment_attachments(drive_file_id)
  where is_active = true;

create index if not exists budget_projects_fiscal_year_idx
  on public.budget_projects(fiscal_year);
create index if not exists budget_projects_status_idx
  on public.budget_projects(status);
create index if not exists budget_projects_owner_idx
  on public.budget_projects(owner_id);
create index if not exists budget_activities_project_idx
  on public.budget_activities(project_id);
create index if not exists budget_payments_project_status_idx
  on public.budget_payment_records(project_id, status);
create index if not exists budget_project_attachments_project_idx
  on public.budget_project_attachments(project_id);
create index if not exists budget_payment_attachments_payment_idx
  on public.budget_payment_attachments(payment_id);

create or replace function public.set_budget_updated_at()
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

drop trigger if exists set_budget_projects_updated_at on public.budget_projects;
create trigger set_budget_projects_updated_at
before update on public.budget_projects
for each row execute function public.set_budget_updated_at();

drop trigger if exists set_budget_activities_updated_at on public.budget_activities;
create trigger set_budget_activities_updated_at
before update on public.budget_activities
for each row execute function public.set_budget_updated_at();

drop trigger if exists set_budget_payment_records_updated_at on public.budget_payment_records;
create trigger set_budget_payment_records_updated_at
before update on public.budget_payment_records
for each row execute function public.set_budget_updated_at();

create or replace view public.budget_project_financial_summary
with (security_invoker = true)
as
select
  p.id as project_id,
  p.legacy_project_id,
  p.approved_budget,
  coalesce(sum(r.amount) filter (where r.status = 'active'), 0)::numeric(14,2)
    as active_payment_total,
  coalesce(sum(r.amount) filter (where r.status = 'cancelled'), 0)::numeric(14,2)
    as cancelled_payment_total,
  (p.approved_budget -
    coalesce(sum(r.amount) filter (where r.status = 'active'), 0))::numeric(14,2)
    as remaining_budget,
  count(r.id) filter (where r.status = 'active')::integer as active_payment_count,
  count(r.id) filter (where r.status = 'cancelled')::integer as cancelled_payment_count
from public.budget_projects p
left join public.budget_payment_records r on r.project_id = p.id
group by p.id;

alter table public.budget_projects enable row level security;
alter table public.budget_activities enable row level security;
alter table public.budget_payment_records enable row level security;
alter table public.budget_project_attachments enable row level security;
alter table public.budget_payment_attachments enable row level security;

-- Authenticated users can read budget data.
drop policy if exists "budget_projects_authenticated_read" on public.budget_projects;
create policy "budget_projects_authenticated_read"
on public.budget_projects for select
to authenticated
using (true);

drop policy if exists "budget_activities_authenticated_read" on public.budget_activities;
create policy "budget_activities_authenticated_read"
on public.budget_activities for select
to authenticated
using (true);

drop policy if exists "budget_payments_authenticated_read" on public.budget_payment_records;
create policy "budget_payments_authenticated_read"
on public.budget_payment_records for select
to authenticated
using (true);

drop policy if exists "budget_project_attachments_authenticated_read" on public.budget_project_attachments;
create policy "budget_project_attachments_authenticated_read"
on public.budget_project_attachments for select
to authenticated
using (true);

drop policy if exists "budget_payment_attachments_authenticated_read" on public.budget_payment_attachments;
create policy "budget_payment_attachments_authenticated_read"
on public.budget_payment_attachments for select
to authenticated
using (true);

comment on table public.budget_projects is
  'Supabase source of truth for budget projects; legacy_project_id preserves Google Sheets ID.';
comment on column public.budget_projects.legacy_actual_amount is
  'Imported historical amount for verification only. New actual spending comes from active payment records.';
