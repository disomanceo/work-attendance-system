-- Link Smart Area assignments that require a meeting/training report.

alter table public.smart_area_tasks
  add column if not exists requires_training_report boolean not null default false;

create index if not exists smart_area_tasks_training_report_required_idx
  on public.smart_area_tasks(assignee_id, status, is_active)
  where requires_training_report = true;

comment on column public.smart_area_tasks.requires_training_report is
  'When true, the assignee must submit a meeting/training report before the assignment is considered complete.';
