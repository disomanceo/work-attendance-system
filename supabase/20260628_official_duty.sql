begin;

create table if not exists public.official_duty_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  full_name text not null,
  position text,
  duty_date date not null,
  reason text not null check (char_length(trim(reason)) >= 3),
  note text,
  attachment_file_id text,
  attachment_file_url text,
  attachment_file_name text,
  attachment_mime_type text,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','cancelled')),
  reviewed_by uuid references public.profiles(id),
  reviewer_name text,
  reviewed_at timestamptz,
  review_note text,
  attendance_record_id uuid references public.attendance_records(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists official_duty_requests_user_date_idx
  on public.official_duty_requests(user_id, duty_date);

create index if not exists official_duty_requests_status_date_idx
  on public.official_duty_requests(status, duty_date);

create unique index if not exists official_duty_one_active_per_day_idx
  on public.official_duty_requests(user_id, duty_date)
  where status in ('pending','approved');

alter table public.official_duty_requests enable row level security;

drop policy if exists "official duty own read" on public.official_duty_requests;
create policy "official duty own read"
on public.official_duty_requests for select
using (auth.uid() = user_id);

drop policy if exists "official duty own insert" on public.official_duty_requests;
create policy "official duty own insert"
on public.official_duty_requests for insert
with check (auth.uid() = user_id);

drop policy if exists "official duty own cancel" on public.official_duty_requests;
create policy "official duty own cancel"
on public.official_duty_requests for update
using (auth.uid() = user_id and status = 'pending')
with check (auth.uid() = user_id and status = 'cancelled');

commit;
