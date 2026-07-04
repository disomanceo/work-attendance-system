alter table public.budget_payment_records
  add column if not exists requester_id uuid
    references public.profiles(id) on delete set null;

alter table public.budget_payment_records
  add column if not exists requester_name_snapshot text;

create index if not exists budget_payment_records_requester_idx
  on public.budget_payment_records(requester_id);

comment on column public.budget_payment_records.requester_id is
  'Personnel selected as the requester/payee for this payment record.';

comment on column public.budget_payment_records.requester_name_snapshot is
  'Requester name captured when the payment was recorded.';
