-- Add Smart Area work permission without modifying the original migration.
alter table public.profiles
  drop constraint if exists profiles_work_permissions_allowed;

alter table public.profiles
  add constraint profiles_work_permissions_allowed
  check (
    work_permissions <@ array[
      'budget.procurement',
      'budget.finance',
      'smart_area.clerk'
    ]::text[]
  );

comment on column public.profiles.work_permissions is
  'Work permissions including budget.procurement, budget.finance, and smart_area.clerk.';
