create extension if not exists pgcrypto;

create table if not exists public.budget_payment_records (
  id uuid primary key default gen_random_uuid(),
  project_id text not null,
  project_name text not null,
  details text not null,
  payment_period text,
  amount numeric(14,2) not null check (amount > 0),
  evidence_name text,
  evidence_path text,
  note text,
  status text not null default 'active'
    check (status in ('active', 'cancelled')),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  created_by_name text not null,
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete set null,
  cancelled_by_name text
);

create index if not exists budget_payment_records_project_id_idx
  on public.budget_payment_records(project_id);

create index if not exists budget_payment_records_created_at_idx
  on public.budget_payment_records(created_at desc);

alter table public.budget_payment_records enable row level security;

drop policy if exists "budget payment records service role only"
  on public.budget_payment_records;

insert into storage.buckets (id, name, public, file_size_limit)
values (
  'budget-payment-evidence',
  'budget-payment-evidence',
  false,
  10485760
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;
