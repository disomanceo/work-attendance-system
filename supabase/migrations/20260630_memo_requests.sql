begin;

create table if not exists public.memo_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  full_name text not null,
  position text null,
  subject text not null,
  reason text not null,
  body text not null,
  attachment_description text null,
  status text not null default 'draft'
    check (status in ('draft', 'pending', 'revision', 'approved', 'acknowledged', 'rejected', 'cancelled')),
  memo_number text null,
  sequence_number integer null,
  document_number_issue_id uuid null references public.document_number_issues(id),
  submitted_at timestamptz null,
  reviewed_by uuid null references public.profiles(id),
  reviewed_at timestamptz null,
  review_note text null,
  working_document_id text null,
  working_document_url text null,
  pdf_file_id text null,
  pdf_file_url text null,
  pdf_file_name text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists memo_requests_document_number_issue_id_idx
  on public.memo_requests(document_number_issue_id)
  where document_number_issue_id is not null;

create index if not exists memo_requests_user_created_idx
  on public.memo_requests(user_id, created_at desc);

create index if not exists memo_requests_status_created_idx
  on public.memo_requests(status, created_at desc);

create table if not exists public.memo_request_logs (
  id uuid primary key default gen_random_uuid(),
  memo_request_id uuid not null references public.memo_requests(id) on delete cascade,
  actor_id uuid null references public.profiles(id),
  from_status text null,
  to_status text not null,
  note text null,
  created_at timestamptz not null default now()
);

create index if not exists memo_request_logs_request_created_idx
  on public.memo_request_logs(memo_request_id, created_at desc);

alter table public.memo_requests enable row level security;
alter table public.memo_request_logs enable row level security;

revoke all on public.memo_requests from anon, authenticated;
revoke all on public.memo_request_logs from anon, authenticated;

commit;
