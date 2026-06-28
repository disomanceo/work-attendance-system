begin;

create table if not exists public.document_number_series (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  prefix text not null default '',
  buddhist_year integer not null check (buddhist_year between 2500 and 2700),
  start_number integer not null default 1 check (start_number >= 1),
  current_number integer not null default 0 check (current_number >= 0),
  padding integer not null default 3 check (padding between 1 and 8),
  mode text not null default 'TEST' check (mode in ('TEST', 'LIVE', 'ARCHIVED')),
  is_active boolean not null default true,
  created_by uuid null references public.profiles(id),
  updated_by uuid null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null,
  constraint document_number_series_unique_active
    unique nulls not distinct (code, buddhist_year, mode, is_active)
);

create unique index if not exists document_number_series_one_active_code_idx
  on public.document_number_series (code)
  where is_active = true;

create table if not exists public.document_number_issues (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.document_number_series(id),
  document_type text not null,
  reference_id uuid not null,
  running_number integer not null,
  buddhist_year integer not null,
  prefix text not null default '',
  formatted_number text not null,
  issue_status text not null default 'ISSUED'
    check (issue_status in ('ISSUED', 'COMPLETED', 'FAILED', 'CANCELLED', 'TEST_ARCHIVED')),
  issued_by uuid null references public.profiles(id),
  issued_at timestamptz not null default now(),
  completed_at timestamptz null,
  failure_reason text null,
  metadata jsonb not null default '{}'::jsonb,
  unique (series_id, running_number),
  unique (document_type, reference_id)
);

create unique index if not exists document_number_issues_formatted_live_idx
  on public.document_number_issues (formatted_number)
  where issue_status <> 'TEST_ARCHIVED';

create table if not exists public.document_number_backups (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null,
  backup_reason text not null,
  series_snapshot jsonb not null,
  issues_snapshot jsonb not null,
  backed_up_by uuid null references public.profiles(id),
  backed_up_at timestamptz not null default now()
);

create table if not exists public.document_number_reset_logs (
  id uuid primary key default gen_random_uuid(),
  old_series_id uuid not null,
  new_series_id uuid not null,
  action text not null default 'GO_LIVE',
  reason text not null,
  confirmation_text text not null,
  performed_by uuid not null references public.profiles(id),
  performed_at timestamptz not null default now(),
  before_snapshot jsonb not null,
  after_snapshot jsonb not null
);

alter table public.document_number_series enable row level security;
alter table public.document_number_issues enable row level security;
alter table public.document_number_backups enable row level security;
alter table public.document_number_reset_logs enable row level security;

-- ทุกการอ่าน/เขียนผ่าน Server API ด้วย service role เท่านั้น
revoke all on public.document_number_series from anon, authenticated;
revoke all on public.document_number_issues from anon, authenticated;
revoke all on public.document_number_backups from anon, authenticated;
revoke all on public.document_number_reset_logs from anon, authenticated;

create or replace function public.format_document_number(
  p_prefix text,
  p_number integer,
  p_padding integer,
  p_year integer
) returns text
language sql
immutable
as $$
  select concat(
    case when trim(coalesce(p_prefix, '')) = '' then '' else trim(p_prefix) || ' ' end,
    lpad(p_number::text, p_padding, '0'),
    '/',
    p_year::text
  );
$$;

create or replace function public.issue_document_number(
  p_series_code text,
  p_document_type text,
  p_reference_id uuid,
  p_issued_by uuid,
  p_metadata jsonb default '{}'::jsonb
) returns table (
  issue_id uuid,
  series_id uuid,
  running_number integer,
  buddhist_year integer,
  prefix text,
  formatted_number text,
  mode text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_series public.document_number_series%rowtype;
  v_next integer;
  v_issue public.document_number_issues%rowtype;
begin
  select *
    into v_issue
  from public.document_number_issues
  where document_type = p_document_type
    and reference_id = p_reference_id;

  if found then
    select s.mode
      into mode
    from public.document_number_series s
    where s.id = v_issue.series_id;

    issue_id := v_issue.id;
    series_id := v_issue.series_id;
    running_number := v_issue.running_number;
    buddhist_year := v_issue.buddhist_year;
    prefix := v_issue.prefix;
    formatted_number := v_issue.formatted_number;
    return next;
    return;
  end if;

  select *
    into v_series
  from public.document_number_series
  where code = p_series_code
    and is_active = true
    and mode in ('TEST', 'LIVE')
  for update;

  if not found then
    raise exception 'ไม่พบชุดเลขเอกสารที่เปิดใช้งาน: %', p_series_code;
  end if;

  v_next := greatest(v_series.current_number + 1, v_series.start_number);

  update public.document_number_series
  set current_number = v_next,
      updated_by = p_issued_by,
      updated_at = now()
  where id = v_series.id;

  insert into public.document_number_issues (
    series_id,
    document_type,
    reference_id,
    running_number,
    buddhist_year,
    prefix,
    formatted_number,
    issued_by,
    metadata
  ) values (
    v_series.id,
    p_document_type,
    p_reference_id,
    v_next,
    v_series.buddhist_year,
    v_series.prefix,
    public.format_document_number(
      v_series.prefix,
      v_next,
      v_series.padding,
      v_series.buddhist_year
    ),
    p_issued_by,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into v_issue;

  issue_id := v_issue.id;
  series_id := v_issue.series_id;
  running_number := v_issue.running_number;
  buddhist_year := v_issue.buddhist_year;
  prefix := v_issue.prefix;
  formatted_number := v_issue.formatted_number;
  mode := v_series.mode;
  return next;
end;
$$;

revoke all on function public.issue_document_number(text, text, uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.issue_document_number(text, text, uuid, uuid, jsonb)
  to service_role;

create or replace function public.mark_document_number_issue(
  p_document_type text,
  p_reference_id uuid,
  p_status text,
  p_failure_reason text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('COMPLETED', 'FAILED', 'CANCELLED') then
    raise exception 'สถานะเลขเอกสารไม่ถูกต้อง';
  end if;

  update public.document_number_issues
  set issue_status = p_status,
      completed_at = case when p_status = 'COMPLETED' then now() else completed_at end,
      failure_reason = p_failure_reason
  where document_type = p_document_type
    and reference_id = p_reference_id;
end;
$$;

revoke all on function public.mark_document_number_issue(text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.mark_document_number_issue(text, uuid, text, text)
  to service_role;

-- เพิ่มข้อมูลเชื่อมเลขกลางกับใบลา
alter table public.leave_requests
  add column if not exists document_number_issue_id uuid null
    references public.document_number_issues(id);

create unique index if not exists leave_requests_document_number_issue_id_idx
  on public.leave_requests(document_number_issue_id)
  where document_number_issue_id is not null;

-- ชุดเลขใบลาเริ่มต้นสำหรับช่วงทดสอบ
insert into public.document_number_series (
  code, name, prefix, buddhist_year, start_number, current_number, padding, mode, is_active
)
select 'LEAVE', 'เลขที่ใบลา', 'ผม.', 2569, 1, 0, 3, 'TEST', true
where not exists (
  select 1 from public.document_number_series where code = 'LEAVE' and is_active = true
);

commit;
