create table if not exists public.announcement_documents (
  id uuid primary key,
  announcement_number text,
  running_number integer not null,
  buddhist_year integer not null,
  subject text not null,
  announcement_date date not null,
  responsible_user_id uuid not null references public.profiles(id),
  responsible_name_snapshot text not null,
  status text not null default 'PENDING'
    check (status in ('DRAFT', 'PENDING', 'REVISION', 'APPROVED', 'CANCELLED')),
  revision_count integer not null default 0,
  latest_revision_note text,
  docx_file_id text,
  docx_file_url text,
  docx_file_name text,
  docx_mime_type text,
  pdf_file_id text,
  pdf_file_url text,
  pdf_file_name text,
  pdf_mime_type text,
  created_by uuid references public.profiles(id),
  submitted_by uuid references public.profiles(id),
  submitted_at timestamptz,
  last_file_uploaded_by uuid references public.profiles(id),
  last_file_uploaded_at timestamptz,
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  returned_by uuid references public.profiles(id),
  returned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (buddhist_year, running_number)
);

create index if not exists announcement_documents_status_idx
  on public.announcement_documents(status);

create index if not exists announcement_documents_responsible_idx
  on public.announcement_documents(responsible_user_id);

create index if not exists announcement_documents_year_running_idx
  on public.announcement_documents(buddhist_year, running_number desc);

create table if not exists public.announcement_document_logs (
  id uuid primary key default gen_random_uuid(),
  announcement_document_id uuid not null references public.announcement_documents(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  action text not null,
  from_status text,
  to_status text,
  revision_number integer,
  note text,
  file_name text,
  created_at timestamptz not null default now()
);

create index if not exists announcement_document_logs_document_idx
  on public.announcement_document_logs(announcement_document_id, created_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'announcement_documents'
  ) then
    alter publication supabase_realtime add table public.announcement_documents;
  end if;
end $$;
