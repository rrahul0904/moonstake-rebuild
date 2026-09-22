-- Atlas 259 Stripe Connect payout reconciliation.
-- Repository support only: production remains fail-closed until STRIPE_CONNECT_ENABLED=true
-- and the Stripe platform profile is actually enabled.

alter table public.mld_transactions
  add column if not exists stripe_transfer_reversal_id text,
  add column if not exists payout_reversed_at timestamptz,
  add column if not exists payout_reversal_reason text;

alter table public.mld_transactions
  drop constraint if exists mld_transactions_payout_status_check;

alter table public.mld_transactions
  add constraint mld_transactions_payout_status_check
  check (payout_status in ('not_applicable','pending','paid','failed','reversed'));

create unique index if not exists idx_mld_transactions_transfer_reversal
  on public.mld_transactions(stripe_transfer_reversal_id)
  where stripe_transfer_reversal_id is not null;

create or replace function public.mld_record_transfer_reversal(
  p_transaction_id uuid,
  p_reversal_id text,
  p_reason text,
  p_actor text
) returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  v_tx public.mld_transactions%rowtype;
begin
  select * into v_tx
  from public.mld_transactions
  where id=p_transaction_id
  for update;

  if not found or v_tx.kind<>'resale' then
    raise exception 'resale transaction not found';
  end if;
  if v_tx.stripe_transfer_id is null then
    raise exception 'transaction has no Stripe transfer to reverse';
  end if;
  if v_tx.payout_status='reversed' then
    return true;
  end if;
  if p_reversal_id is null or char_length(trim(p_reversal_id))<1 then
    raise exception 'reversal id required';
  end if;
  if p_reason not in ('refund','dispute','correction') then
    raise exception 'invalid reversal reason';
  end if;

  update public.mld_transactions
  set stripe_transfer_reversal_id=p_reversal_id,
      payout_status='reversed',
      payout_reversal_reason=p_reason,
      payout_reversed_at=now(),
      payout_updated_at=now(),
      payout_error=null
  where id=p_transaction_id;

  insert into public.audit_logs(actor,action,target_id,metadata)
  values(
    p_actor,
    'marketplace.transfer_reversed',
    p_transaction_id::text,
    jsonb_build_object(
      'transfer_id',v_tx.stripe_transfer_id,
      'reversal_id',p_reversal_id,
      'reason',p_reason,
      'amount_cents',v_tx.seller_payout_cents
    )
  );
  return true;
end $$;

revoke execute on function public.mld_record_transfer_reversal(uuid,text,text,text)
  from public,anon,authenticated;
grant execute on function public.mld_record_transfer_reversal(uuid,text,text,text)
  to service_role;

insert into public.audit_logs(actor,action,target_id,metadata)
values(
  'migration',
  'marketplace.connect_reconciliation_enabled',
  'atlas259',
  jsonb_build_object(
    'connect_gate','STRIPE_CONNECT_ENABLED',
    'transfer_reversal_tracking',true,
    'production_activation_required',true
  )
);
