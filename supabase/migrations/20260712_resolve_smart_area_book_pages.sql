-- Resolve and persist Smart Area page numbers for existing and future rows.
-- Safe to run repeatedly.

create or replace function public.resolve_smart_area_book_page()
returns trigger
language plpgsql
as $$
declare
  resolved_page text;
  resolved_latest text;
  source_page_url text;
begin
  resolved_page := nullif(new.legacy_payload ->> 'smart_area_page', '');
  resolved_latest := nullif(new.legacy_payload ->> 'central_latest_page', '');

  if resolved_page is null then
    resolved_page := nullif(new.legacy_payload -> 'raw' ->> 'smartAreaPage', '');
  end if;

  if resolved_latest is null then
    resolved_latest := nullif(new.legacy_payload -> 'raw' ->> 'centralLatestPage', '');
  end if;

  source_page_url := coalesce(
    nullif(new.legacy_payload ->> 'source_page_url', ''),
    nullif(new.legacy_payload -> 'raw' ->> 'sourcePageUrl', '')
  );

  if resolved_page is null and source_page_url is not null then
    resolved_page := substring(source_page_url from '[?&]page=([0-9]+)');
  end if;

  if resolved_page is not null then
    new.legacy_payload := jsonb_set(
      coalesce(new.legacy_payload, '{}'::jsonb),
      '{smart_area_page}',
      to_jsonb(resolved_page),
      true
    );

    new.legacy_payload := jsonb_set(
      new.legacy_payload,
      '{raw,smartAreaPage}',
      to_jsonb(resolved_page::integer),
      true
    );
  end if;

  if resolved_latest is not null then
    new.legacy_payload := jsonb_set(
      coalesce(new.legacy_payload, '{}'::jsonb),
      '{central_latest_page}',
      to_jsonb(resolved_latest),
      true
    );

    new.legacy_payload := jsonb_set(
      new.legacy_payload,
      '{raw,centralLatestPage}',
      to_jsonb(resolved_latest::integer),
      true
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_resolve_smart_area_book_page
on public.smart_area_books;

create trigger trg_resolve_smart_area_book_page
before insert or update of legacy_payload
on public.smart_area_books
for each row
execute function public.resolve_smart_area_book_page();

update public.smart_area_books
set legacy_payload = legacy_payload
where legacy_payload is not null
  and (
    coalesce(legacy_payload ->> 'smart_area_page', '') = ''
    or coalesce(legacy_payload -> 'raw' ->> 'smartAreaPage', '') = ''
  );

-- Verification:
-- select
--   (legacy_payload ->> 'smart_area_page')::integer as page,
--   count(*) as total
-- from public.smart_area_books
-- where nullif(legacy_payload ->> 'smart_area_page', '') is not null
-- group by 1
-- order by 1 desc;
