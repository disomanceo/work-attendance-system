alter table public.students
  add column if not exists photo_file_id text null,
  add column if not exists photo_file_url text null,
  add column if not exists photo_mime_type text null,
  add column if not exists photo_uploaded_at timestamptz null;

create index if not exists idx_students_photo_file_id
  on public.students(photo_file_id)
  where photo_file_id is not null;

comment on column public.students.photo_file_id is
  'Google Drive file id for the student profile photo';

comment on column public.students.photo_file_url is
  'Google Drive web URL for the student profile photo';

comment on column public.students.photo_mime_type is
  'MIME type of the student profile photo';

comment on column public.students.photo_uploaded_at is
  'Timestamp when the student profile photo was uploaded';
