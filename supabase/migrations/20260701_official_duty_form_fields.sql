begin;

alter table public.official_duty_requests
  add column if not exists duty_end_date date null,
  add column if not exists total_days integer null,
  add column if not exists location text null,
  add column if not exists subject text null,
  add column if not exists evidence_description text null;

update public.official_duty_requests
set
  duty_end_date = coalesce(duty_end_date, duty_date),
  total_days = coalesce(total_days, 1),
  subject = coalesce(subject, reason),
  evidence_description = coalesce(evidence_description, attachment_file_name, '-')
where duty_date is not null;

alter table public.official_duty_requests
  add constraint official_duty_date_range_valid
  check (duty_end_date is null or duty_end_date >= duty_date);

create index if not exists official_duty_requests_date_range_idx
  on public.official_duty_requests(user_id, duty_date, duty_end_date);

commit;
