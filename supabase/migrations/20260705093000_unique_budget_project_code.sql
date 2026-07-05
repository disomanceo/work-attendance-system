create unique index if not exists budget_projects_project_code_unique
  on public.budget_projects (project_code)
  where project_code is not null and btrim(project_code) <> '';
