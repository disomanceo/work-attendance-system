begin;

alter table public.official_duty_requests
  add column if not exists official_duty_number text null,
  add column if not exists sequence_number integer null,
  add column if not exists document_number_issue_id uuid null
    references public.document_number_issues(id),
  add column if not exists working_document_id text null,
  add column if not exists working_document_url text null,
  add column if not exists drive_request_folder_id text null,
  add column if not exists pdf_file_id text null,
  add column if not exists pdf_file_url text null,
  add column if not exists pdf_file_name text null,
  add column if not exists final_drive_folder_id text null,
  add column if not exists finalized_at timestamptz null;

create unique index if not exists official_duty_document_number_issue_id_idx
  on public.official_duty_requests(document_number_issue_id)
  where document_number_issue_id is not null;

create index if not exists official_duty_requests_number_idx
  on public.official_duty_requests(official_duty_number)
  where official_duty_number is not null;

commit;
