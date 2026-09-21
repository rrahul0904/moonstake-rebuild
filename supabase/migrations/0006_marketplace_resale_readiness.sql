-- Atlas 259 resale readiness: seller payout profiles, offer lifecycle and transfer reconciliation.

create table if not exists public.seller_payout_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_account_id text unique,
  onboarding_status text not null default 'not_started'
    check (onboarding_status in ('not_started','pending','restricted','enabled')),
  transfers_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  requirements_due_count integer not null default 0 check (requirements_due_count >= 0),
  last_stripe_sync_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.seller_payout_profiles enable row level security;
revoke all on public.seller_payout_profiles from public, anon, authenticated;
grant select,insert,update,delete on public.seller_payout_profiles to service_role;

alter table public.mld_offers
  add column if not exists expires_at timestamptz not null default (now() + interval '7 days'),
  add column if not exists accepted_at timestamptz,
  add column if not exists payment_due_at timestamptz,
  add column if not exists stripe_checkout_session_id text;

alter table public.mld_offers
  drop constraint if exists mld_offers_status_check;

alter table public.mld_offers
  add constraint mld_offers_status_check
  check (status in ('pending','accepted_pending_payment','accepted','rejected','withdrawn','expired'));

create unique index if not exists idx_mld_offer_checkout_session
  on public.mld_offers(stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create unique index if not exists idx_mld_one_accepted_checkout_per_lot
  on public.mld_offers(lot_id)
  where status='accepted_pending_payment';

alter table public.mld_transactions
  add column if not exists stripe_charge_id text,
  add column if not exists stripe_transfer_id text,
  add column if not exists transfer_group text,
  add column if not exists payout_error text,
  add column if not exists payout_updated_at timestamptz;

create unique index if not exists idx_mld_transactions_transfer
  on public.mld_transactions(stripe_transfer_id)
  where stripe_transfer_id is not null;

create index if not exists idx_seller_payout_status
  on public.seller_payout_profiles(onboarding_status, transfers_enabled, payouts_enabled);

create or replace function public.mld_create_offer(
  p_lot_id text,
  p_buyer_user_id uuid,
  p_amount_cents integer,
  p_expires_hours integer default 168
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot public.mld_lots%rowtype;
  v_id uuid := gen_random_uuid();
begin
  select * into v_lot from public.mld_lots where lot_id = p_lot_id for update;
  if not found then raise exception 'lot is not currently owned'; end if;
  if v_lot.owner_user_id = p_buyer_user_id then raise exception 'owner cannot offer on own lot'; end if;
  if p_amount_cents < v_lot.last_paid_cents + 100 then
    raise exception 'offer must beat last paid by at least $1';
  end if;

  update public.mld_offers
  set status='expired', resolved_at=now()
  where lot_id=p_lot_id and status='pending' and expires_at <= now();

  insert into public.mld_offers(id, lot_id, buyer_user_id, amount_cents, expires_at)
  values(
    v_id,
    p_lot_id,
    p_buyer_user_id,
    p_amount_cents,
    now() + make_interval(hours => greatest(1, least(p_expires_hours, 720)))
  );
  return v_id;
end $$;

create or replace function public.mld_withdraw_offer(
  p_offer_id uuid,
  p_buyer_user_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.mld_offers
  set status='withdrawn', resolved_at=now()
  where id=p_offer_id
    and buyer_user_id=p_buyer_user_id
    and status='pending';

  if not found then raise exception 'pending offer not found for buyer'; end if;
  return true;
end $$;

create or replace function public.mld_accept_offer(
  p_offer_id uuid,
  p_seller_user_id uuid,
  p_payment_window_hours integer default 24
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer public.mld_offers%rowtype;
  v_lot public.mld_lots%rowtype;
  v_profile public.seller_payout_profiles%rowtype;
begin
  select * into v_offer from public.mld_offers where id=p_offer_id for update;
  if not found then raise exception 'offer not found'; end if;
  if v_offer.status <> 'pending' then raise exception 'offer is not pending'; end if;
  if v_offer.expires_at <= now() then
    update public.mld_offers set status='expired', resolved_at=now() where id=p_offer_id;
    raise exception 'offer has expired';
  end if;

  select * into v_lot from public.mld_lots where lot_id=v_offer.lot_id for update;
  if not found then raise exception 'lot not found'; end if;
  if v_lot.owner_user_id <> p_seller_user_id then raise exception 'only the current holder can accept this offer'; end if;

  select * into v_profile from public.seller_payout_profiles where user_id=p_seller_user_id;
  if not found
     or v_profile.onboarding_status <> 'enabled'
     or not v_profile.transfers_enabled then
    raise exception 'seller payout setup is required before accepting an offer';
  end if;

  update public.mld_offers
  set status='expired', resolved_at=now()
  where lot_id=v_offer.lot_id
    and status='accepted_pending_payment'
    and payment_due_at <= now();

  if exists(
    select 1 from public.mld_offers
    where lot_id=v_offer.lot_id
      and status='accepted_pending_payment'
      and id<>p_offer_id
  ) then
    raise exception 'another accepted offer is awaiting payment';
  end if;

  update public.mld_offers
  set status='accepted_pending_payment',
      accepted_at=now(),
      payment_due_at=now()+make_interval(hours=>greatest(1,least(p_payment_window_hours,72)))
  where id=p_offer_id;

  insert into public.audit_logs(actor,action,target_id,metadata)
  values(
    p_seller_user_id::text,
    'mld.offer_accepted_for_payment',
    p_offer_id::text,
    jsonb_build_object('lot_id',v_offer.lot_id,'amount_cents',v_offer.amount_cents)
  );

  return p_offer_id;
end $$;

create or replace function public.mld_attach_offer_checkout(
  p_offer_id uuid,
  p_buyer_user_id uuid,
  p_session_id text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer public.mld_offers%rowtype;
begin
  select * into v_offer from public.mld_offers where id=p_offer_id for update;
  if not found then raise exception 'offer not found'; end if;
  if v_offer.buyer_user_id <> p_buyer_user_id then raise exception 'offer does not belong to buyer'; end if;
  if v_offer.status <> 'accepted_pending_payment' then raise exception 'offer is not awaiting payment'; end if;
  if v_offer.payment_due_at <= now() then
    update public.mld_offers set status='expired',resolved_at=now() where id=p_offer_id;
    raise exception 'offer payment window expired';
  end if;
  if v_offer.stripe_checkout_session_id is not null
     and v_offer.stripe_checkout_session_id <> p_session_id then
    raise exception 'offer already has a checkout session';
  end if;

  update public.mld_offers
  set stripe_checkout_session_id=p_session_id
  where id=p_offer_id;
  return true;
end $$;

create or replace function public.mld_expire_offers()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.mld_offers
  set status='expired', resolved_at=now()
  where (status='pending' and expires_at <= now())
     or (status='accepted_pending_payment' and payment_due_at <= now());

  get diagnostics v_count = row_count;
  return v_count;
end $$;

drop function if exists public.mld_finalize_paid_offer(uuid,text);

create or replace function public.mld_finalize_paid_offer(
  p_offer_id uuid,
  p_session_id text,
  p_payment_intent_id text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer public.mld_offers%rowtype;
  v_lot public.mld_lots%rowtype;
  v_tx uuid := gen_random_uuid();
  v_gain integer;
  v_seller_gain integer;
  v_seller_payout integer;
  v_mld_fee integer;
begin
  select * into v_offer from public.mld_offers where id = p_offer_id for update;
  if not found or v_offer.status <> 'accepted_pending_payment' then raise exception 'offer is not payable'; end if;
  if v_offer.stripe_checkout_session_id is null or v_offer.stripe_checkout_session_id <> p_session_id then
    raise exception 'checkout session does not match accepted offer';
  end if;

  select * into v_lot from public.mld_lots where lot_id = v_offer.lot_id for update;
  if not found then raise exception 'lot not found'; end if;
  if v_lot.owner_user_id = v_offer.buyer_user_id then raise exception 'buyer already owns lot'; end if;
  if v_offer.amount_cents < v_lot.last_paid_cents + 100 then raise exception 'offer no longer clears minimum'; end if;

  v_gain := v_offer.amount_cents - v_lot.last_paid_cents;
  v_seller_gain := floor(v_gain * 0.60);
  v_seller_payout := v_lot.last_paid_cents + v_seller_gain;
  v_mld_fee := v_offer.amount_cents - v_seller_payout;

  insert into public.mld_transactions(
    id, lot_id, kind, buyer_user_id, seller_user_id, gross_cents,
    previous_paid_cents, gain_cents, seller_payout_cents, mld_fee_cents,
    stripe_payment_intent_id, payout_status, transfer_group
  ) values(
    v_tx, v_lot.lot_id, 'resale', v_offer.buyer_user_id, v_lot.owner_user_id, v_offer.amount_cents,
    v_lot.last_paid_cents, v_gain, v_seller_payout, v_mld_fee,
    p_payment_intent_id, 'pending', 'atlas259-resale-' || v_tx::text
  );

  update public.mld_lots
  set owner_user_id = v_offer.buyer_user_id,
      last_paid_cents = v_offer.amount_cents,
      purchase_count = purchase_count + 1,
      updated_at = now()
  where lot_id = v_lot.lot_id;

  update public.mld_offers
  set status='accepted', resolved_at=now()
  where id=p_offer_id;

  update public.mld_offers
  set status='rejected', resolved_at=now()
  where lot_id=v_lot.lot_id and status='pending' and id<>p_offer_id;

  insert into public.audit_logs(actor, action, target_id, metadata)
  values('stripe', 'mld.resale', v_lot.lot_id, jsonb_build_object(
    'offer_id', p_offer_id,
    'gross_cents', v_offer.amount_cents,
    'seller_payout_cents', v_seller_payout,
    'mld_fee_cents', v_mld_fee,
    'transaction_id', v_tx
  ));

  return v_tx;
end $$;

create or replace function public.mld_mark_transfer_result(
  p_transaction_id uuid,
  p_transfer_id text,
  p_status text,
  p_error text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('paid','failed') then raise exception 'invalid payout result'; end if;

  update public.mld_transactions
  set stripe_transfer_id=coalesce(p_transfer_id,stripe_transfer_id),
      payout_status=p_status,
      payout_error=left(p_error,500),
      payout_updated_at=now()
  where id=p_transaction_id and kind='resale';

  if not found then raise exception 'resale transaction not found'; end if;
  return true;
end $$;

create or replace view public.seller_payout_readiness with (security_invoker = true) as
select
  l.owner_user_id as user_id,
  count(*)::integer as owned_lots,
  p.stripe_account_id,
  coalesce(p.onboarding_status,'not_started') as onboarding_status,
  coalesce(p.transfers_enabled,false) as transfers_enabled,
  coalesce(p.payouts_enabled,false) as payouts_enabled,
  coalesce(p.details_submitted,false) as details_submitted,
  coalesce(p.requirements_due_count,0) as requirements_due_count,
  p.last_stripe_sync_at,
  case
    when p.onboarding_status='enabled' and p.transfers_enabled then true
    else false
  end as resale_payout_ready
from public.mld_lots l
left join public.seller_payout_profiles p on p.user_id=l.owner_user_id
group by
  l.owner_user_id,p.stripe_account_id,p.onboarding_status,p.transfers_enabled,
  p.payouts_enabled,p.details_submitted,p.requirements_due_count,p.last_stripe_sync_at;

create or replace view public.mld_offer_directory with (security_invoker = true) as
select
  o.id,
  o.lot_id,
  o.buyer_user_id,
  l.owner_user_id as seller_user_id,
  o.amount_cents,
  l.last_paid_cents,
  (l.last_paid_cents + 100) as minimum_offer_cents,
  greatest(l.last_paid_cents + 100, ceil(l.last_paid_cents * 1.10)::integer) as suggested_offer_cents,
  o.status,
  o.created_at,
  o.expires_at,
  o.accepted_at,
  o.payment_due_at,
  o.stripe_checkout_session_id,
  coalesce(p.onboarding_status,'not_started') as seller_onboarding_status,
  coalesce(p.transfers_enabled,false) as seller_transfers_enabled,
  case when p.onboarding_status='enabled' and p.transfers_enabled then true else false end as seller_payout_ready
from public.mld_offers o
join public.mld_lots l on l.lot_id=o.lot_id
left join public.seller_payout_profiles p on p.user_id=l.owner_user_id;

revoke all on public.seller_payout_readiness, public.mld_offer_directory from public, anon, authenticated;
grant select on public.seller_payout_readiness, public.mld_offer_directory to service_role;

revoke execute on function public.mld_create_offer(text,uuid,integer,integer) from public, anon, authenticated;
revoke execute on function public.mld_withdraw_offer(uuid,uuid) from public, anon, authenticated;
revoke execute on function public.mld_accept_offer(uuid,uuid,integer) from public, anon, authenticated;
revoke execute on function public.mld_attach_offer_checkout(uuid,uuid,text) from public, anon, authenticated;
revoke execute on function public.mld_expire_offers() from public, anon, authenticated;
revoke execute on function public.mld_finalize_paid_offer(uuid,text,text) from public, anon, authenticated;
revoke execute on function public.mld_mark_transfer_result(uuid,text,text,text) from public, anon, authenticated;

grant execute on function public.mld_create_offer(text,uuid,integer,integer) to service_role;
grant execute on function public.mld_withdraw_offer(uuid,uuid) to service_role;
grant execute on function public.mld_accept_offer(uuid,uuid,integer) to service_role;
grant execute on function public.mld_attach_offer_checkout(uuid,uuid,text) to service_role;
grant execute on function public.mld_expire_offers() to service_role;
grant execute on function public.mld_finalize_paid_offer(uuid,text,text) to service_role;
grant execute on function public.mld_mark_transfer_result(uuid,text,text,text) to service_role;

insert into public.audit_logs(actor,action,target_id,metadata)
values(
  'migration',
  'marketplace.resale_readiness_enabled',
  'moon',
  jsonb_build_object(
    'seller_payout_profiles',true,
    'offer_expiry',true,
    'offer_withdrawal',true,
    'seller_acceptance',true,
    'buyer_payment_window',true,
    'transfer_reconciliation',true
  )
);
