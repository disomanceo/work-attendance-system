-- Smart Area assignment read/acknowledgement state and one active signed file per book.

alter table public.smart_area_tasks
  add column if not exists assignment_opened_at timestamptz,
  add column if not exists assignment_acknowledged_at timestamptz;

with ranked_signed as (
  select
    id,
    row_number() over (
      partition by book_id
      order by updated_at desc nulls last, created_at desc, id desc
    ) as row_number
  from public.smart_area_attachments
  where attachment_type = 'signed'
    and status = 'active'
    and is_active = true
)
update public.smart_area_attachments attachment
set
  status = 'history',
  is_active = false,
  removed_at = coalesce(attachment.removed_at, now()),
  removed_reason = coalesce(
    attachment.removed_reason,
    'Duplicate signed assignment file removed by migration'
  ),
  updated_at = now()
from ranked_signed ranked
where attachment.id = ranked.id
  and ranked.row_number > 1;

create unique index if not exists smart_area_one_active_signed_attachment_idx
  on public.smart_area_attachments(book_id)
  where attachment_type = 'signed'
    and status = 'active'
    and is_active = true;

create index if not exists smart_area_tasks_assignment_state_idx
  on public.smart_area_tasks(
    assignee_id,
    assignment_opened_at,
    assignment_acknowledged_at
  )
  where is_active = true;

create or replace function public.update_smart_area_task_status(
  p_task_id uuid,
  p_actor_id uuid,
  p_next_status text,
  p_can_manage_all boolean default false
)
returns table (
  task_id uuid,
  book_id uuid,
  task_status text,
  book_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.smart_area_tasks%rowtype;
  v_book_status text;
  v_active_count integer;
  v_done_count integer;
  v_progress_count integer;
begin
  if p_next_status not in ('assigned', 'in_progress', 'done') then
    raise exception 'Invalid Smart Area task status.';
  end if;

  select *
  into v_task
  from public.smart_area_tasks
  where id = p_task_id
    and is_active = true
  for update;

  if not found then
    raise exception 'Smart Area task was not found.';
  end if;

  if not p_can_manage_all and v_task.assignee_id is distinct from p_actor_id then
    raise exception 'The actor cannot update this Smart Area task.';
  end if;

  if v_task.status = 'done' and p_next_status <> 'done' and not p_can_manage_all then
    raise exception 'A completed task cannot be reopened by the assignee.';
  end if;

  update public.smart_area_tasks
  set
    status = p_next_status,
    assignment_opened_at = case
      when p_next_status in ('in_progress', 'done')
        then coalesce(assignment_opened_at, now())
      else assignment_opened_at
    end,
    assignment_acknowledged_at = case
      when p_next_status in ('in_progress', 'done')
        then coalesce(assignment_acknowledged_at, now())
      when p_next_status = 'assigned' and p_can_manage_all
        then null
      else assignment_acknowledged_at
    end,
    started_at = case
      when p_next_status in ('in_progress', 'done')
        then coalesce(started_at, now())
      else started_at
    end,
    completed_at = case
      when p_next_status = 'done' then coalesce(completed_at, now())
      when p_next_status <> 'done' and p_can_manage_all then null
      else completed_at
    end,
    updated_at = now(),
    updated_by = p_actor_id
  where id = v_task.id;

  select
    count(*)::integer,
    count(*) filter (where status = 'done')::integer,
    count(*) filter (where status in ('in_progress', 'done'))::integer
  into
    v_active_count,
    v_done_count,
    v_progress_count
  from public.smart_area_tasks
  where book_id = v_task.book_id
    and is_active = true;

  if v_active_count = 0 then
    select status
    into v_book_status
    from public.smart_area_books
    where id = v_task.book_id;
  elsif v_done_count = v_active_count then
    v_book_status := 'done';
  elsif v_progress_count > 0 then
    v_book_status := 'in_progress';
  else
    v_book_status := 'assigned';
  end if;

  update public.smart_area_books
  set
    status = v_book_status,
    updated_at = now(),
    updated_by = p_actor_id
  where id = v_task.book_id;

  return query
  select
    v_task.id,
    v_task.book_id,
    p_next_status,
    v_book_status;
end;
$$;

revoke all on function public.update_smart_area_task_status(uuid, uuid, text, boolean)
  from public, anon, authenticated;

grant execute on function public.update_smart_area_task_status(uuid, uuid, text, boolean)
  to service_role;
