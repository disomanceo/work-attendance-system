alter table public.budget_projects
  add column if not exists record_type text not null default 'project';

alter table public.budget_projects
  drop constraint if exists budget_projects_record_type_check;

alter table public.budget_projects
  add constraint budget_projects_record_type_check
  check (record_type in ('project', 'free_education'));

update public.budget_projects
set record_type = case
  when upper(coalesce(project_code, '')) like 'F15-%' then 'free_education'
  else 'project'
end;

create index if not exists budget_projects_record_type_idx
  on public.budget_projects(record_type);
