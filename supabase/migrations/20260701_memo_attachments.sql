begin;

alter table public.memo_requests
  add column if not exists attachment_bucket text null,
  add column if not exists attachment_path text null,
  add column if not exists attachment_file_name text null,
  add column if not exists attachment_mime_type text null,
  add column if not exists attachment_size_bytes bigint null;

insert into storage.buckets (id, name, public, file_size_limit)
values ('memo-attachments', 'memo-attachments', false, 10485760)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

commit;
