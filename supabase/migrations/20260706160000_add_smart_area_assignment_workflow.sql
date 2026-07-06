-- Smart Area clerk submission, director assignment, reassignment, and direct close workflow.

create or replace function public.submit_smart_area_book_to_director(
  p_book_id uuid,
  p_actor_id uuid,
  p_allowed boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if not p_allowed then
    raise exception 'The actor cannot submit this Smart Area book.';
  end if;

  select status
  into v_status
  from public.smart_area_books
  where id = p_book_id
    and is_active = true
  for update;

  if not found then
    raise exception 'Smart Area book was not found.';
  end if;

  if v_status <> 'clerk_review' then
    raise exception 'Smart Area book is not waiting for clerk review.';
  end if;

  update public.smart_area_books
  set
    status = 'director_review',
    updated_at = now(),
    updated_by = p_actor_id
  where id = p_book_id;

  return 'director_review';
end;
$$;

create or replace function public.replace_smart_area_assignments(
  p_book_id uuid,
  p_actor_id uuid,
  p_assignee_ids uuid[],
  p_assignment_note text,
  p_allowed boolean
)
returns table (
  book_status text,
  retained_count integer,
  added_count integer,
  removed_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_book public.smart_area_books%rowtype;
  v_ids uuid[];
  v_retained integer := 0;
  v_added integer := 0;
  v_removed integer := 0;
  v_active_count integer := 0;
  v_done_count integer := 0;
  v_progress_count integer := 0;
  v_book_status text := 'assigned';
begin
  if not p_allowed then
    raise exception 'The actor cannot assign this Smart Area book.';
  end if;

  select *
  into v_book
  from public.smart_area_books
  where id = p_book_id
    and is_active = true
  for update;

  if not found then
    raise exception 'Smart Area book was not found.';
  end if;

  select coalesce(array_agg(distinct value), '{}'::uuid[])
  into v_ids
  from unnest(coalesce(p_assignee_ids, '{}'::uuid[])) as value
  where value is not null;

  if cardinality(v_ids) = 0 then
    raise exception 'At least one assignee is required.';
  end if;

  if exists (
    select 1
    from unnest(v_ids) as requested_id
    left join public.profiles p on p.id = requested_id
    where p.id is null or p.account_status <> 'active'
  ) then
    raise exception 'One or more assignees are invalid.';
  end if;

  select count(*)::integer
  into v_retained
  from public.smart_area_tasks
  where book_id = p_book_id
    and is_active = true
    and assignee_id = any(v_ids);

  update public.smart_area_tasks
  set
    is_active = false,
    removed_at = now(),
    removed_by = p_actor_id,
    removed_reason = 'Reassigned',
    updated_at = now(),
    updated_by = p_actor_id
  where book_id = p_book_id
    and is_active = true
    and (
      assignee_id is null
      or not (assignee_id = any(v_ids))
    );

  get diagnostics v_removed = row_count;

  insert into public.smart_area_tasks (
    book_id,
    legacy_smart_area_id,
    legacy_sheet_row,
    legacy_task_key,
    assignee_id,
    assignee_name_snapshot,
    assigned_by,
    assignment_note,
    status,
    is_active,
    created_by,
    updated_by
  )
  select
    v_book.id,
    v_book.legacy_smart_area_id,
    0,
    v_book.legacy_smart_area_id || ':new:' || gen_random_uuid()::text,
    p.id,
    p.full_name,
    p_actor_id,
    nullif(trim(coalesce(p_assignment_note, '')), ''),
    'assigned',
    true,
    p_actor_id,
    p_actor_id
  from public.profiles p
  where p.id = any(v_ids)
    and p.account_status = 'active'
    and not exists (
      select 1
      from public.smart_area_tasks t
      where t.book_id = p_book_id
        and t.is_active = true
        and t.assignee_id = p.id
    );

  get diagnostics v_added = row_count;

  select
    count(*)::integer,
    count(*) filter (where status = 'done')::integer,
    count(*) filter (where status in ('in_progress', 'done'))::integer
  into
    v_active_count,
    v_done_count,
    v_progress_count
  from public.smart_area_tasks
  where book_id = p_book_id
    and is_active = true;

  if v_active_count = 0 then
    raise exception 'Assignment update produced no active tasks.';
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
    acknowledged_without_task = false,
    acknowledged_at = null,
    acknowledged_by = null,
    director_note = nullif(trim(coalesce(p_assignment_note, '')), ''),
    updated_at = now(),
    updated_by = p_actor_id
  where id = p_book_id;

  return query
  select v_book_status, v_retained, v_added, v_removed;
end;
$$;

create or replace function public.close_smart_area_book_without_task(
  p_book_id uuid,
  p_actor_id uuid,
  p_note text,
  p_allowed boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not p_allowed then
    raise exception 'The actor cannot close this Smart Area book.';
  end if;

  perform 1
  from public.smart_area_books
  where id = p_book_id
    and is_active = true
  for update;

  if not found then
    raise exception 'Smart Area book was not found.';
  end if;

  update public.smart_area_tasks
  set
    is_active = false,
    removed_at = now(),
    removed_by = p_actor_id,
    removed_reason = 'Book closed without active task',
    updated_at = now(),
    updated_by = p_actor_id
  where book_id = p_book_id
    and is_active = true;

  update public.smart_area_books
  set
    status = 'done',
    acknowledged_without_task = true,
    acknowledged_at = now(),
    acknowledged_by = p_actor_id,
    director_note = nullif(trim(coalesce(p_note, '')), ''),
    updated_at = now(),
    updated_by = p_actor_id
  where id = p_book_id;

  return 'done';
end;
$$;

revoke all on function public.submit_smart_area_book_to_director(uuid, uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.replace_smart_area_assignments(uuid, uuid, uuid[], text, boolean)
  from public, anon, authenticated;
revoke all on function public.close_smart_area_book_without_task(uuid, uuid, text, boolean)
  from public, anon, authenticated;

grant execute on function public.submit_smart_area_book_to_director(uuid, uuid, boolean)
  to service_role;
grant execute on function public.replace_smart_area_assignments(uuid, uuid, uuid[], text, boolean)
  to service_role;
grant execute on function public.close_smart_area_book_without_task(uuid, uuid, text, boolean)
  to service_role;
