begin;

create table if not exists public.smart_area_sync_state (
  id text primary key,
  version bigint not null default 0,
  last_change_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.smart_area_sync_state (
  id,
  version,
  last_change_at,
  created_at,
  updated_at
)
values (
  'documents',
  0,
  now(),
  now(),
  now()
)
on conflict (id) do nothing;

create or replace function public.bump_smart_area_document_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.smart_area_sync_state (
    id,
    version,
    last_change_at,
    created_at,
    updated_at
  )
  values (
    'documents',
    1,
    now(),
    now(),
    now()
  )
  on conflict (id) do update
  set
    version = public.smart_area_sync_state.version + 1,
    last_change_at = now(),
    updated_at = now();

  return coalesce(new, old);
end;
$$;

drop trigger if exists smart_area_books_track_change
  on public.smart_area_books;

create trigger smart_area_books_track_change
after insert or update or delete
on public.smart_area_books
for each row
execute function public.bump_smart_area_document_version();

create or replace function public.touch_smart_area_parent_book()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_book_id uuid;
begin
  target_book_id := coalesce(new.book_id, old.book_id);

  if target_book_id is not null then
    update public.smart_area_books
    set updated_at = now()
    where id = target_book_id;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists smart_area_tasks_touch_parent_book
  on public.smart_area_tasks;

create trigger smart_area_tasks_touch_parent_book
after insert or update or delete
on public.smart_area_tasks
for each row
execute function public.touch_smart_area_parent_book();

drop trigger if exists smart_area_attachments_touch_parent_book
  on public.smart_area_attachments;

create trigger smart_area_attachments_touch_parent_book
after insert or update or delete
on public.smart_area_attachments
for each row
execute function public.touch_smart_area_parent_book();

alter table public.smart_area_sync_state enable row level security;

revoke all on table public.smart_area_sync_state from anon;
revoke all on table public.smart_area_sync_state from authenticated;

notify pgrst, 'reload schema';

commit;
