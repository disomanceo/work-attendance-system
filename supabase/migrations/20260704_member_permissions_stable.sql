-- Stable member work permissions and four administration departments.
alter table public.profiles
  add column if not exists work_permissions text[] not null default '{}'::text[],
  add column if not exists departments text[] not null default '{}'::text[];

alter table public.profiles
  drop constraint if exists profiles_work_permissions_allowed;

alter table public.profiles
  add constraint profiles_work_permissions_allowed
  check (
    work_permissions <@ array[
      'budget.procurement',
      'budget.finance'
    ]::text[]
  );

alter table public.profiles
  drop constraint if exists profiles_departments_allowed;

update public.profiles
set departments = coalesce(
  (
    select array_agg(distinct mapped_department order by mapped_department)
    from (
      select case department
        when 'academic' then 'academic_administration'
        when 'academic_administration' then 'academic_administration'
        when 'personnel' then 'personnel_administration'
        when 'personnel_administration' then 'personnel_administration'
        when 'budget_administration' then 'budget_administration'
        when 'general_administration' then 'general_administration'
        else null
      end as mapped_department
      from unnest(coalesce(profiles.departments, '{}'::text[])) as department
    ) normalized
    where mapped_department is not null
  ),
  '{}'::text[]
);

alter table public.profiles
  add constraint profiles_departments_allowed
  check (
    departments <@ array[
      'academic_administration',
      'budget_administration',
      'personnel_administration',
      'general_administration'
    ]::text[]
  );
