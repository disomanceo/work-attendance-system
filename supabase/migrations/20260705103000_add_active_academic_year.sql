alter table public.attendance_settings
  add column if not exists active_academic_year integer null;

alter table public.attendance_settings
  drop constraint if exists attendance_settings_active_academic_year_check;

alter table public.attendance_settings
  add constraint attendance_settings_active_academic_year_check
  check (
    active_academic_year is null
    or active_academic_year between 2500 and 2700
  );

comment on column public.attendance_settings.active_academic_year is
  'Active Buddhist academic year used by school project codes and academic modules';
