alter table public.profiles
  add column if not exists alternate_workplace text null,
  add column if not exists count_as_present_when_no_checkin boolean not null default false;

comment on column public.profiles.alternate_workplace is
  'สถานที่ปฏิบัติงานเพิ่มเติมเมื่อไม่มีการเช็กอิน';

comment on column public.profiles.count_as_present_when_no_checkin is
  'เมื่อไม่มีเช็กอิน ไม่มีลา และไม่มีไปราชการ ให้นับเป็นมาปฏิบัติราชการ';
