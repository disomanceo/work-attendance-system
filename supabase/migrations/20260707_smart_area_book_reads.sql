create table if not exists public.smart_area_book_reads (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.smart_area_books(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (book_id, user_id)
);

create index if not exists smart_area_book_reads_user_id_idx
  on public.smart_area_book_reads(user_id);

create index if not exists smart_area_book_reads_book_id_idx
  on public.smart_area_book_reads(book_id);

alter table public.smart_area_book_reads enable row level security;

drop policy if exists "smart_area_book_reads_select_own"
  on public.smart_area_book_reads;

create policy "smart_area_book_reads_select_own"
  on public.smart_area_book_reads
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "smart_area_book_reads_insert_own"
  on public.smart_area_book_reads;

create policy "smart_area_book_reads_insert_own"
  on public.smart_area_book_reads
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "smart_area_book_reads_update_own"
  on public.smart_area_book_reads;

create policy "smart_area_book_reads_update_own"
  on public.smart_area_book_reads
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
