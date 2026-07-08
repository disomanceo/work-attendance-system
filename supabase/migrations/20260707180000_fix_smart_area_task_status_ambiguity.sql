-- Fix ambiguous book_id reference in Smart Area task status workflow.

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

  select task_row.*
  into v_task
  from public.smart_area_tasks as task_row
  where task_row.id = p_task_id
    and task_row.is_active = true
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

  update public.smart_area_tasks as task_row
  set
    status = p_next_status,
    started_at = case
      when p_next_status in ('in_progress', 'done')
        then coalesce(task_row.started_at, now())
      else task_row.started_at
    end,
    completed_at = case
      when p_next_status = 'done' then coalesce(task_row.completed_at, now())
      when p_next_status <> 'done' and p_can_manage_all then null
      else task_row.completed_at
    end,
    updated_at = now(),
    updated_by = p_actor_id
  where task_row.id = v_task.id;

  select
    count(*)::integer,
    count(*) filter (where task_row.status = 'done')::integer,
    count(*) filter (
      where task_row.status in ('in_progress', 'done')
    )::integer
  into
    v_active_count,
    v_done_count,
    v_progress_count
  from public.smart_area_tasks as task_row
  where task_row.book_id = v_task.book_id
    and task_row.is_active = true;

  if v_active_count = 0 then
    select book_row.status
    into v_book_status
    from public.smart_area_books as book_row
    where book_row.id = v_task.book_id;
  elsif v_done_count = v_active_count then
    v_book_status := 'done';
  elsif v_progress_count > 0 then
    v_book_status := 'in_progress';
  else
    v_book_status := 'assigned';
  end if;

  update public.smart_area_books as book_row
  set
    status = v_book_status,
    updated_at = now(),
    updated_by = p_actor_id
  where book_row.id = v_task.book_id;

  return query
  select
    v_task.id::uuid,
    v_task.book_id::uuid,
    p_next_status::text,
    v_book_status::text;
end;
$$;

revoke all on function public.update_smart_area_task_status(uuid, uuid, text, boolean)
  from public, anon, authenticated;

grant execute on function public.update_smart_area_task_status(uuid, uuid, text, boolean)
  to service_role;

comment on function public.update_smart_area_task_status(uuid, uuid, text, boolean) is
  'Updates one active Smart Area task and recomputes the parent book status atomically.';
