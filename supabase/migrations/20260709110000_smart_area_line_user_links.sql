-- Map Smart Area assignees to LINE user IDs for direct assignment alerts.

create table if not exists public.smart_area_line_user_links (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  line_user_id text not null,
  line_display_name text,
  is_active boolean not null default true,
  registered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint smart_area_line_user_links_profile_unique unique (profile_id),
  constraint smart_area_line_user_links_line_unique unique (line_user_id)
);

create index if not exists smart_area_line_user_links_active_idx
  on public.smart_area_line_user_links(profile_id, is_active);

alter table public.smart_area_line_user_links enable row level security;

revoke all on table public.smart_area_line_user_links from anon, authenticated;
grant all on table public.smart_area_line_user_links to service_role;

insert into public.smart_area_line_user_links (
  profile_id,
  line_user_id,
  line_display_name,
  is_active,
  registered_at
)
select
  p.id,
  v.line_user_id,
  v.line_display_name,
  true,
  v.registered_at::timestamptz
from (
  values
    ('นายสุธน พุทธรัตน์', 'U15b7976bb7861d8c67cea2a8a1849664', 'สุริน ไผ่มุ้ง', '2026-06-07 21:07:38+07'),
    ('นางสาวกมลศรี ยิ้มประเสริฐ', 'Ubd07ce38fba15cbba03c63660fc0dff1', 'nan', '2026-06-20 21:37:09+07'),
    ('นางสาวอุไรวรรณ ศรีโปฎก', 'U716c970f79a31d80f604b867359d1754', 'Uraiwan_DTS', '2026-06-21 09:02:27+07'),
    ('นางสาวอนุษรา หงษ์โต', 'U919d83c3ded2a2d4d67989c8a6893046', 'LEK', '2026-06-21 09:04:07+07'),
    ('นางสาววราภรณ์ แก้วสด', 'U01d410bd37fdc85f256c62631ca7af81', 'dow waraporn', '2026-06-21 11:37:36+07'),
    ('นางสาวปาจรีรัตน์ อิงคะวะระ', 'U142512d14a6e10a4fbd3185701b3d2e6', 'pajarirat', '2026-06-21 19:52:21+07'),
    ('นางสาวณัฐกฤตา เวียนน้ำใจดี', 'Ue4b841406ea048b3a8d84f33834ae6cf', 'nut', '2026-06-21 20:16:47+07'),
    ('นางสาวพิมวิภา คุ้มสมบัติ', 'Ub4b942d2e2a1910e62125b358b2212ab', 'SPIMMM', '2026-06-22 07:03:58+07'),
    ('นางรัตน์มณี พันที', 'Ucb26acf9ec7c80f91e26ec3969563260', 'Ratmanee', '2026-06-23 10:05:37+07'),
    ('นายนครินทร์ อินทร์ละม่อม', 'U4c5e37ec409b65befc1bdf07fcb765c6', 'Off Nakarin Inlamom', '2026-06-24 09:27:12+07')
) as v(full_name, line_user_id, line_display_name, registered_at)
join public.profiles p
  on btrim(p.full_name) = v.full_name
on conflict (profile_id) do update
set
  line_user_id = excluded.line_user_id,
  line_display_name = excluded.line_display_name,
  is_active = excluded.is_active,
  registered_at = excluded.registered_at,
  updated_at = now();
