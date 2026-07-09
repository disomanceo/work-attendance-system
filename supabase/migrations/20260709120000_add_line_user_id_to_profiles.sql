-- Store LINE user IDs directly on existing teacher profiles.

alter table public.profiles
  add column if not exists line_user_id text;

create unique index if not exists profiles_line_user_id_unique_idx
  on public.profiles(line_user_id)
  where line_user_id is not null;

update public.profiles as p
set
  line_user_id = v.line_user_id,
  updated_at = now()
from (
  values
    ('นายสุธน พุทธรัตน์', 'U15b7976bb7861d8c67cea2a8a1849664'),
    ('นางสาวกมลศรี ยิ้มประเสริฐ', 'Ubd07ce38fba15cbba03c63660fc0dff1'),
    ('นางสาวอุไรวรรณ ศรีโปฎก', 'U716c970f79a31d80f604b867359d1754'),
    ('นางสาวอนุษรา หงษ์โต', 'U919d83c3ded2a2d4d67989c8a6893046'),
    ('นางสาววราภรณ์ แก้วสด', 'U01d410bd37fdc85f256c62631ca7af81'),
    ('นางสาวปาจรีรัตน์ อิงคะวะระ', 'U142512d14a6e10a4fbd3185701b3d2e6'),
    ('นางสาวณัฐกฤตา เวียนน้ำใจดี', 'Ue4b841406ea048b3a8d84f33834ae6cf'),
    ('นางสาวพิมวิภา คุ้มสมบัติ', 'Ub4b942d2e2a1910e62125b358b2212ab'),
    ('นางรัตน์มณี พันที', 'Ucb26acf9ec7c80f91e26ec3969563260'),
    ('นายนครินทร์ อินทร์ละม่อม', 'U4c5e37ec409b65befc1bdf07fcb765c6')
) as v(full_name, line_user_id)
where btrim(p.full_name) = v.full_name;

update public.profiles as p
set
  line_user_id = l.line_user_id,
  updated_at = now()
from public.smart_area_line_user_links as l
where p.id = l.profile_id
  and l.is_active = true
  and nullif(btrim(coalesce(p.line_user_id, '')), '') is null;
