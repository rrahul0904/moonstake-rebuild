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
  add column if not exists expires_at timestamptz not null default (now() + interval '7 days');

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
  where status='pending' and expires_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
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

revoke all on public.seller_payout_readiness from public, anon, authenticated;
grant select on public.seller_payout_readiness to service_role;

revoke execute on function public.mld_create_offer(text,uuid,integer,integer) from public, anon, authenticated;
revoke execute on function public.mld_withdraw_offer(uuid,uuid) from public, anon, authenticated;
revoke execute on function public.mld_expire_offers() from public, anon, authenticated;
revoke execute on function public.mld_mark_transfer_result(uuid,text,text,text) from public, anon, authenticated;

grant execute on function public.mld_create_offer(text,uuid,integer,integer) to service_role;
grant execute on function public.mld_withdraw_offer(uuid,uuid) to service_role;
grant execute on function public.mld_expire_offers() to service_role;
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
    'transfer_reconciliation',true
  )
);
