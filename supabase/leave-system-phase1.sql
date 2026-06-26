-- Work Attendance System: Leave System Phase 1
-- Types: personal leave (ลากิจ), sick leave (ลาป่วย)

create extension if not exists pgcrypto;

create table if not exists public.leave_holidays (
  holiday_date date primary key,
  holiday_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,

  leave_type text not null
    check (leave_type in ('personal', 'sick')),

  start_date date not null,
  end_date date not null,
  total_work_days integer not null check (total_work_days > 0),

  reason text not null check (char_length(trim(reason)) >= 5),

  fiscal_year integer not null,
  submission_kind text not null
    check (
      submission_kind in (
        'advance',
        'urgent',
        'retrospective',
        'overdue'
      )
    ),

  advance_work_days integer not null default 0,
  retrospective_work_days integer not null default 0,
  late_submission_reason text null,

  attachment_bucket text null,
  attachment_path text null,
  attachment_name text null,
  attachment_mime_type text null,
  attachment_size_bytes bigint null,

  medical_certificate_required boolean not null default false,

  status text not null default 'pending'
    check (
      status in ('pending', 'approved', 'rejected', 'cancelled')
    ),

  sequence_number integer null,

  reviewed_by uuid null references public.profiles(id),
  reviewed_at timestamptz null,
  review_note text null,

  cancelled_at timestamptz null,
  cancelled_reason text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (end_date >= start_date),
  check (
    submission_kind <> 'overdue'
    or char_length(trim(coalesce(late_submission_reason, ''))) >= 5
  ),
  check (
    medical_certificate_required = false
    or (
      attachment_path is not null
      and attachment_name is not null
    )
  )
);

create index if not exists leave_requests_user_fiscal_idx
  on public.leave_requests(user_id, fiscal_year, leave_type, status);

create index if not exists leave_requests_status_created_idx
  on public.leave_requests(status, created_at desc);

create index if not exists leave_requests_date_range_idx
  on public.leave_requests(start_date, end_date);

create unique index if not exists leave_requests_sequence_unique_idx
  on public.leave_requests(user_id, fiscal_year, leave_type, sequence_number)
  where sequence_number is not null and status = 'approved';

alter table public.leave_requests enable row level security;
alter table public.leave_holidays enable row level security;

drop policy if exists "leave users read own requests" on public.leave_requests;
create policy "leave users read own requests"
on public.leave_requests
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "leave holidays readable" on public.leave_holidays;
create policy "leave holidays readable"
on public.leave_holidays
for select
to authenticated
using (is_active = true);

insert into storage.buckets (id, name, public, file_size_limit)
values ('leave-attachments', 'leave-attachments', false, 5242880)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

-- Server routes use SUPABASE_SERVICE_ROLE_KEY for create/update/upload.
-- Do not create direct client insert/update policies.
