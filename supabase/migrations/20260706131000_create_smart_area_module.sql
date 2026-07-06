-- Work Attendance System: Smart Area module schema.
-- Data access is restricted to server-side APIs using the Supabase service role.

create extension if not exists pgcrypto;

create table if not exists public.smart_area_books (
  id uuid primary key default gen_random_uuid(),
  legacy_smart_area_id text not null,
  registration_number text,
  received_date date,
  source_agency text,
  subject text not null,
  document_number text,
  document_date date,
  document_type text,
  urgency text,
  status text not null default 'clerk_review',
  note text,
  director_note text,
  acknowledged_without_task boolean not null default false,
  acknowledged_at timestamptz,
  acknowledged_by uuid references public.profiles(id) on delete set null,
  source_system text not null default 'smart-area-legacy',
  is_active boolean not null default true,
  removed_at timestamptz,
  removed_by uuid references public.profiles(id) on delete set null,
  removed_reason text,
  legacy_payload jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint smart_area_books_legacy_id_unique unique (legacy_smart_area_id),
  constraint smart_area_books_status_valid check (
    status in (
      'clerk_review',
      'director_review',
      'assigned',
      'in_progress',
      'done'
    )
  ),
  constraint smart_area_books_removed_state_valid check (
    is_active = true
    or removed_at is not null
  )
);

create table if not exists public.smart_area_tasks (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null
    references public.smart_area_books(id) on delete cascade,
  legacy_smart_area_id text not null,
  legacy_sheet_row integer not null,
  legacy_task_key text not null,
  assignee_id uuid references public.profiles(id) on delete set null,
  assignee_name_snapshot text not null,
  assigned_by uuid references public.profiles(id) on delete set null,
  assignment_note text,
  status text not null default 'assigned',
  started_at timestamptz,
  completed_at timestamptz,
  is_active boolean not null default true,
  removed_at timestamptz,
  removed_by uuid references public.profiles(id) on delete set null,
  removed_reason text,
  legacy_payload jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint smart_area_tasks_legacy_key_unique unique (legacy_task_key),
  constraint smart_area_tasks_status_valid check (
    status in ('assigned', 'in_progress', 'done')
  ),
  constraint smart_area_tasks_started_state_valid check (
    status = 'assigned'
    or started_at is not null
    or legacy_payload is not null
  ),
  constraint smart_area_tasks_completed_state_valid check (
    status <> 'done'
    or completed_at is not null
    or legacy_payload is not null
  ),
  constraint smart_area_tasks_removed_state_valid check (
    is_active = true
    or removed_at is not null
  )
);

create table if not exists public.smart_area_attachments (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null
    references public.smart_area_books(id) on delete cascade,
  legacy_smart_area_id text not null,
  legacy_sheet_row integer not null,
  legacy_attachment_key text not null,
  source_url text,
  file_url text,
  drive_file_id text,
  file_name text,
  mime_type text,
  file_order integer not null default 0,
  attachment_type text not null default 'original',
  status text not null default 'active',
  is_active boolean not null default true,
  removed_at timestamptz,
  removed_by uuid references public.profiles(id) on delete set null,
  removed_reason text,
  legacy_payload jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint smart_area_attachments_legacy_key_unique
    unique (legacy_attachment_key),
  constraint smart_area_attachments_type_valid check (
    attachment_type in ('original', 'signed')
  ),
  constraint smart_area_attachments_status_valid check (
    status in ('active', 'history', 'cancelled')
  ),
  constraint smart_area_attachments_file_order_nonnegative check (
    file_order >= 0
  ),
  constraint smart_area_attachments_removed_state_valid check (
    is_active = true
    or removed_at is not null
  )
);

create index if not exists smart_area_books_status_active_idx
  on public.smart_area_books(status, is_active);

create index if not exists smart_area_books_received_date_idx
  on public.smart_area_books(received_date desc);

create index if not exists smart_area_tasks_book_active_idx
  on public.smart_area_tasks(book_id, is_active);

create index if not exists smart_area_tasks_assignee_active_idx
  on public.smart_area_tasks(assignee_id, is_active);

create index if not exists smart_area_tasks_status_active_idx
  on public.smart_area_tasks(status, is_active);

create index if not exists smart_area_attachments_book_active_order_idx
  on public.smart_area_attachments(book_id, is_active, file_order);

create index if not exists smart_area_attachments_drive_file_idx
  on public.smart_area_attachments(drive_file_id)
  where drive_file_id is not null;

create or replace function public.set_smart_area_updated_at()
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

drop trigger if exists set_smart_area_books_updated_at
  on public.smart_area_books;
create trigger set_smart_area_books_updated_at
before update on public.smart_area_books
for each row execute function public.set_smart_area_updated_at();

drop trigger if exists set_smart_area_tasks_updated_at
  on public.smart_area_tasks;
create trigger set_smart_area_tasks_updated_at
before update on public.smart_area_tasks
for each row execute function public.set_smart_area_updated_at();

drop trigger if exists set_smart_area_attachments_updated_at
  on public.smart_area_attachments;
create trigger set_smart_area_attachments_updated_at
before update on public.smart_area_attachments
for each row execute function public.set_smart_area_updated_at();

alter table public.smart_area_books enable row level security;
alter table public.smart_area_tasks enable row level security;
alter table public.smart_area_attachments enable row level security;

revoke all on table public.smart_area_books from anon, authenticated;
revoke all on table public.smart_area_tasks from anon, authenticated;
revoke all on table public.smart_area_attachments from anon, authenticated;

grant all on table public.smart_area_books to service_role;
grant all on table public.smart_area_tasks to service_role;
grant all on table public.smart_area_attachments to service_role;

revoke all on function public.set_smart_area_updated_at()
  from public, anon, authenticated;
grant execute on function public.set_smart_area_updated_at()
  to service_role;

comment on table public.smart_area_books is
  'Official document records migrated from the legacy Smart Area system.';

comment on table public.smart_area_tasks is
  'Document assignment tasks with preserved legacy identity and soft deletion.';

comment on table public.smart_area_attachments is
  'Legacy source URLs and Google Drive file references for Smart Area documents.';
