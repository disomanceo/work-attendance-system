alter table public.attendance_settings
  add column if not exists active_fiscal_year integer null,
  add column if not exists fiscal_year_start_date date null,
  add column if not exists fiscal_year_end_date date null;

alter table public.attendance_settings
  drop constraint if exists attendance_settings_active_fiscal_year_check;

alter table public.attendance_settings
  add constraint attendance_settings_active_fiscal_year_check
  check (
    active_fiscal_year is null
    or active_fiscal_year between 2500 and 2700
  );

alter table public.attendance_settings
  drop constraint if exists attendance_settings_fiscal_date_check;

alter table public.attendance_settings
  add constraint attendance_settings_fiscal_date_check
  check (
    (
      fiscal_year_start_date is null
      and fiscal_year_end_date is null
    )
    or (
      fiscal_year_start_date is not null
      and fiscal_year_end_date is not null
      and fiscal_year_end_date >= fiscal_year_start_date
    )
  );

update public.leave_requests
set fiscal_year = fiscal_year + 543
where fiscal_year between 1900 and 2200;
