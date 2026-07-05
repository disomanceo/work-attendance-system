create table if not exists public.work_calendar_days (
  id uuid primary key default gen_random_uuid(),
  work_date date not null unique,
  day_type text not null check (day_type in ('PUBLIC_HOLIDAY','SCHOOL_HOLIDAY','SPECIAL_WORKDAY')),
  title text not null default '',
  report_text text not null default '',
  note text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists work_calendar_days_work_date_idx on public.work_calendar_days(work_date);
alter table public.work_calendar_days enable row level security;
