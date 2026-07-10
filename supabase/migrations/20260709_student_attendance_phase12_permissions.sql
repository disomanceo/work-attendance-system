create table if not exists public.student_class_settings (
  id uuid primary key default gen_random_uuid(),
  class_level text not null,
  class_room text not null default '',
  adviser_profile_id uuid null references public.profiles(id) on delete set null,
  adviser_profile_ids uuid[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_level, class_room)
);

create table if not exists public.student_work_permissions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  permission_key text not null,
  class_levels text[] not null default '{}',
  granted_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, permission_key)
);

create table if not exists public.student_duty_roster (
  id uuid primary key default gen_random_uuid(),
  weekday integer not null check (weekday between 1 and 7),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  is_active boolean not null default true,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (weekday, profile_id)
);

create index if not exists idx_student_class_settings_level_room on public.student_class_settings(class_level, class_room);
create index if not exists idx_student_work_permissions_profile on public.student_work_permissions(profile_id);
create index if not exists idx_student_duty_roster_weekday on public.student_duty_roster(weekday);

alter table public.student_attendance
  add column if not exists session_id uuid null,
  add column if not exists recorded_by_role text null,
  add column if not exists recorded_as text null;

create table if not exists public.student_attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  attendance_date date not null,
  class_level text not null,
  class_room text not null default '',
  status text not null default 'draft',
  expected_recorder_id uuid null references public.profiles(id) on delete set null,
  actual_recorder_id uuid null references public.profiles(id) on delete set null,
  actual_recorder_role text null,
  recorded_as text null,
  takeover_reason text null,
  recorded_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (attendance_date, class_level, class_room)
);

alter table public.student_attendance
  add constraint student_attendance_session_fk
  foreign key (session_id) references public.student_attendance_sessions(id)
  on delete set null;

alter table public.student_class_settings enable row level security;
alter table public.student_work_permissions enable row level security;
alter table public.student_duty_roster enable row level security;
alter table public.student_attendance_sessions enable row level security;