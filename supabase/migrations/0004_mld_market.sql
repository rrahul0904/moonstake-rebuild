-- MLD marketplace: sparse ownership ledger for 720 x 360 = 259,200 addressable lunar lots.
-- Lots are advertising placements / billboard inventory, not legal real-property claims.

create table if not exists public.mld_lots (
  lot_id text primary key,
  x smallint not null check (x between 0 and 719),
  y smallint not null check (y between 0 and 359),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  last_paid_cents integer not null check (last_paid_cents >= 100),
  purchase_count integer not null default 1 check (purchase_count >= 1),
  updated_at timestamptz not null default now(),
  unique (x, y),
  check (lot_id = 'MOON-' || lpad(x::text, 3, '0') || '-' || lpad(y::text, 3, '0'))
);

create table if not exists public.mld_offers (
  id uuid primary key default gen_random_uuid(),
  lot_id text not null references public.mld_lots(lot_id) on delete cascade,
  buyer_user_id uuid not null references auth.users(id) on delete cascade,
  amount_cents integer not null check (amount_cents >= 200),
  status text not null default 'pending' check (status in ('pending','accepted','rejected','withdrawn','expired')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.mld_transactions (
  id uuid primary key default gen_random_uuid(),
  lot_id text not null,
  kind text not null check (kind in ('first_sale','resale')),
  buyer_user_id uuid not null references auth.users(id) on delete restrict,
  seller_user_id uuid references auth.users(id) on delete restrict,
  gross_cents integer not null check (gross_cents >= 100),
  previous_paid_cents integer not null default 0 check (previous_paid_cents >= 0),
  gain_cents integer not null check (gain_cents >= 0),
  seller_payout_cents integer not null default 0 check (seller_payout_cents >= 0),
  mld_fee_cents integer not null check (mld_fee_cents >= 0),
  stripe_payment_intent_id text,
  payout_status text not null default 'not_applicable' check (payout_status in ('not_applicable','pending','paid','failed')),
  created_at timestamptz not null default now(),
  check (seller_payout_cents + mld_fee_cents = gross_cents)
);

create table if not exists public.mld_lot_metrics (
  lot_id text primary key references public.mld_lots(lot_id) on delete cascade,
  views bigint not null default 0 check (views >= 0),
  clicks bigint not null default 0 check (clicks >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mld_lots_owner on public.mld_lots(owner_user_id);
create index if not exists idx_mld_offers_lot_status on public.mld_offers(lot_id, status, amount_cents desc);
create index if not exists idx_mld_offers_buyer on public.mld_offers(buyer_user_id, created_at desc);
create index if not exists idx_mld_transactions_lot on public.mld_transactions(lot_id, created_at desc);
create index if not exists idx_mld_transactions_created on public.mld_transactions(created_at desc);
create unique index if not exists idx_mld_transactions_payment_lot on public.mld_transactions(stripe_payment_intent_id, lot_id) where stripe_payment_intent_id is not null;

alter table public.mld_lots enable row level security;
alter table public.mld_offers enable row level security;
alter table public.mld_transactions enable row level security;
alter table public.mld_lot_metrics enable row level security;

create or replace view public.mld_lot_directory with (security_invoker = true) as
select
  l.lot_id,
  l.x,
  l.y,
  l.last_paid_cents,
  l.purchase_count,
  l.updated_at,
  coalesce(m.views, 0)::bigint as views,
  coalesce(m.clicks, 0)::bigint as clicks
from public.mld_lots l
left join public.mld_lot_metrics m on m.lot_id = l.lot_id;

create or replace view public.mld_market_summary with (security_invoker = true) as
select
  259200::integer as total_lots,
  (select count(*) from public.mld_lots)::integer as owned_lots,
  coalesce(sum(t.gross_cents), 0)::bigint as gross_market_volume_cents,
  coalesce(sum(t.mld_fee_cents), 0)::bigint as mld_revenue_cents,
  round(
    100::numeric +
    (coalesce(sum(t.gross_cents), 0)::numeric / 25920000::numeric) * 100::numeric,
    2
  ) as moon_index
from public.mld_transactions t;

create or replace function public.mld_record_primary_sale(
  p_lot_id text,
  p_x integer,
  p_y integer,
  p_buyer_user_id uuid,
  p_amount_cents integer,
  p_payment_intent_id text
) returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_x < 0 or p_x > 719 or p_y < 0 or p_y > 359 then raise exception 'lot outside board'; end if;
  if p_lot_id <> 'MOON-' || lpad(p_x::text, 3, '0') || '-' || lpad(p_y::text, 3, '0') then raise exception 'lot id mismatch'; end if;
  if p_amount_cents < 100 then raise exception 'primary sale must be at least $1'; end if;
  if exists(select 1 from public.mld_lots where lot_id = p_lot_id) then raise exception 'lot already owned'; end if;

  insert into public.mld_lots(lot_id, x, y, owner_user_id, last_paid_cents)
  values(p_lot_id, p_x, p_y, p_buyer_user_id, p_amount_cents);

  insert into public.mld_lot_metrics(lot_id) values(p_lot_id) on conflict do nothing;

  insert into public.mld_transactions(
    lot_id, kind, buyer_user_id, seller_user_id, gross_cents,
    previous_paid_cents, gain_cents, seller_payout_cents, mld_fee_cents,
    stripe_payment_intent_id, payout_status
  ) values(
    p_lot_id, 'first_sale', p_buyer_user_id, null, p_amount_cents,
    0, p_amount_cents, 0, p_amount_cents,
    p_payment_intent_id, 'not_applicable'
  );

  insert into public.audit_logs(actor, action, target_id, metadata)
  values('stripe', 'mld.first_sale', p_lot_id, jsonb_build_object('gross_cents', p_amount_cents));

  return p_lot_id;
end $$;

create or replace function public.mld_create_offer(
  p_lot_id text,
  p_buyer_user_id uuid,
  p_amount_cents integer
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

  insert into public.mld_offers(id, lot_id, buyer_user_id, amount_cents)
  values(v_id, p_lot_id, p_buyer_user_id, p_amount_cents);
  return v_id;
end $$;

create or replace function public.mld_finalize_paid_offer(
  p_offer_id uuid,
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
  if not found or v_offer.status <> 'pending' then raise exception 'offer is not payable'; end if;

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
    stripe_payment_intent_id, payout_status
  ) values(
    v_tx, v_lot.lot_id, 'resale', v_offer.buyer_user_id, v_lot.owner_user_id, v_offer.amount_cents,
    v_lot.last_paid_cents, v_gain, v_seller_payout, v_mld_fee,
    p_payment_intent_id, 'pending'
  );

  update public.mld_lots
  set owner_user_id = v_offer.buyer_user_id,
      last_paid_cents = v_offer.amount_cents,
      purchase_count = purchase_count + 1,
      updated_at = now()
  where lot_id = v_lot.lot_id;

  update public.mld_offers set status = 'accepted', resolved_at = now() where id = p_offer_id;
  update public.mld_offers
  set status = 'rejected', resolved_at = now()
  where lot_id = v_lot.lot_id and status = 'pending' and id <> p_offer_id;

  insert into public.audit_logs(actor, action, target_id, metadata)
  values('stripe', 'mld.resale', v_lot.lot_id, jsonb_build_object(
    'offer_id', p_offer_id,
    'gross_cents', v_offer.amount_cents,
    'seller_payout_cents', v_seller_payout,
    'mld_fee_cents', v_mld_fee
  ));

  return v_tx;
end $$;

create or replace function public.mld_record_lot_event(p_lot_id text, p_kind text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_kind not in ('view','click') then raise exception 'invalid event kind'; end if;
  if not exists(select 1 from public.mld_lots where lot_id = p_lot_id) then return false; end if;

  insert into public.mld_lot_metrics(lot_id, views, clicks)
  values(p_lot_id, case when p_kind='view' then 1 else 0 end, case when p_kind='click' then 1 else 0 end)
  on conflict(lot_id) do update set
    views = public.mld_lot_metrics.views + case when p_kind='view' then 1 else 0 end,
    clicks = public.mld_lot_metrics.clicks + case when p_kind='click' then 1 else 0 end,
    updated_at = now();
  return true;
end $$;

revoke all on public.mld_lots, public.mld_offers, public.mld_transactions, public.mld_lot_metrics from public, anon, authenticated;
revoke all on public.mld_lot_directory, public.mld_market_summary from public, anon, authenticated;
revoke execute on function public.mld_record_primary_sale(text,integer,integer,uuid,integer,text) from public, anon, authenticated;
revoke execute on function public.mld_create_offer(text,uuid,integer) from public, anon, authenticated;
revoke execute on function public.mld_finalize_paid_offer(uuid,text) from public, anon, authenticated;
revoke execute on function public.mld_record_lot_event(text,text) from public, anon, authenticated;

grant select,insert,update,delete on public.mld_lots,public.mld_offers,public.mld_transactions,public.mld_lot_metrics to service_role;
grant select on public.mld_lot_directory,public.mld_market_summary to service_role;
grant execute on function public.mld_record_primary_sale(text,integer,integer,uuid,integer,text) to service_role;
grant execute on function public.mld_create_offer(text,uuid,integer) to service_role;
grant execute on function public.mld_finalize_paid_offer(uuid,text) to service_role;
grant execute on function public.mld_record_lot_event(text,text) to service_role;
