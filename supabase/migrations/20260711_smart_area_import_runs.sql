create table if not exists public.smart_area_import_runs (
  id uuid primary key default gen_random_uuid(),
  github_run_id text,
  status text not null default 'queued',
  scanned integer not null default 0,
  added integer not null default 0,
  updated integer not null default 0,
  duplicate integer not null default 0,
  failed integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists smart_area_import_runs_created_at_idx on public.smart_area_import_runs(created_at desc);
alter table public.smart_area_import_runs enable row level security;
