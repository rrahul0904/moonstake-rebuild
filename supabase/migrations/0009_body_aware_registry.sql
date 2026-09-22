-- Atlas 259 body-aware registry compatibility layer.
-- Keeps existing mld_* table names for migration compatibility while making
-- the ownership / offer / transaction ledger body-keyed for future markets.

alter table public.claims
  add column if not exists body_id text not null default 'moon';

alter table public.reservations
  add column if not exists body_id text not null default 'moon';

alter table public.claim_sectors
  add column if not exists body_id text not null default 'moon';

alter table public.sector_holds
  add column if not exists body_id text not null default 'moon';

alter table public.mld_lots
  add column if not exists body_id text not null default 'moon';

alter table public.mld_offers
  add column if not exists body_id text not null default 'moon';

alter table public.mld_transactions
  add column if not exists body_id text not null default 'moon';

alter table public.mld_lot_metrics
  add column if not exists body_id text not null default 'moon';

alter table public.mld_watchlist
  add column if not exists body_id text not null default 'moon';

alter table public.claims
  drop constraint if exists claims_body_id_check;
alter table public.reservations
  drop constraint if exists reservations_body_id_check;
alter table public.claim_sectors
  drop constraint if exists claim_sectors_body_id_check;
alter table public.sector_holds
  drop constraint if exists sector_holds_body_id_check;
alter table public.mld_lots
  drop constraint if exists mld_lots_body_id_check;
alter table public.mld_offers
  drop constraint if exists mld_offers_body_id_check;
alter table public.mld_transactions
  drop constraint if exists mld_transactions_body_id_check;
alter table public.mld_lot_metrics
  drop constraint if exists mld_lot_metrics_body_id_check;
alter table public.mld_watchlist
  drop constraint if exists mld_watchlist_body_id_check;

alter table public.claims
  add constraint claims_body_id_check check (body_id in ('moon','mars','mercury','venus','ceres','pluto','europa','titan'));
alter table public.reservations
  add constraint reservations_body_id_check check (body_id in ('moon','mars','mercury','venus','ceres','pluto','europa','titan'));
alter table public.claim_sectors
  add constraint claim_sectors_body_id_check check (body_id in ('moon','mars','mercury','venus','ceres','pluto','europa','titan'));
alter table public.sector_holds
  add constraint sector_holds_body_id_check check (body_id in ('moon','mars','mercury','venus','ceres','pluto','europa','titan'));
alter table public.mld_lots
  add constraint mld_lots_body_id_check check (body_id in ('moon','mars','mercury','venus','ceres','pluto','europa','titan'));
alter table public.mld_offers
  add constraint mld_offers_body_id_check check (body_id in ('moon','mars','mercury','venus','ceres','pluto','europa','titan'));
alter table public.mld_transactions
  add constraint mld_transactions_body_id_check check (body_id in ('moon','mars','mercury','venus','ceres','pluto','europa','titan'));
alter table public.mld_lot_metrics
  add constraint mld_lot_metrics_body_id_check check (body_id in ('moon','mars','mercury','venus','ceres','pluto','europa','titan'));
alter table public.mld_watchlist
  add constraint mld_watchlist_body_id_check check (body_id in ('moon','mars','mercury','venus','ceres','pluto','europa','titan'));

-- Existing production data is Moon data. Backfill explicitly before tightening
-- lot/body consistency.
update public.claims set body_id='moon' where body_id is null;
update public.reservations set body_id='moon' where body_id is null;
update public.claim_sectors set body_id='moon' where body_id is null;
update public.sector_holds set body_id='moon' where body_id is null;
update public.mld_lots set body_id='moon' where body_id is null;
update public.mld_offers set body_id='moon' where body_id is null;
update public.mld_transactions set body_id='moon' where body_id is null;
update public.mld_lot_metrics set body_id='moon' where body_id is null;
update public.mld_watchlist set body_id='moon' where body_id is null;

alter table public.claim_sectors
  drop constraint if exists claim_sectors_sector_id_check;

alter table public.claim_sectors
  add constraint claim_sectors_sector_id_check
  check (
    sector_id ~ '^S-([0-5][0-9]|6[0-3])-([0-2][0-9]|3[0-1])$'
    or sector_id ~ '^(MOON|MARS|MERCURY|VENUS|CERES|PLUTO|EUROPA|TITAN)-([0-6][0-9][0-9]|7[01][0-9])-([0-2][0-9][0-9]|3[0-5][0-9])$'
  );

alter table public.mld_lots
  drop constraint if exists mld_lots_check;

alter table public.mld_lots
  add constraint registry_lot_id_matches_body
  check (
    lot_id = upper(body_id) || '-' || lpad(x::text,3,'0') || '-' || lpad(y::text,3,'0')
  );

create index if not exists idx_claims_body_created
  on public.claims(body_id,created_at desc);
create index if not exists idx_reservations_body_status
  on public.reservations(body_id,status,created_at desc);
create index if not exists idx_claim_sectors_body
  on public.claim_sectors(body_id,sector_id);
create index if not exists idx_registry_lots_body_owner
  on public.mld_lots(body_id,owner_user_id);
create index if not exists idx_registry_transactions_body_created
  on public.mld_transactions(body_id,created_at desc);
create index if not exists idx_registry_offers_body_status
  on public.mld_offers(body_id,status,created_at desc);
create index if not exists idx_registry_watchlist_body
  on public.mld_watchlist(body_id,user_id,created_at desc);

create or replace function public.registry_body_from_position_id(p_position_id text)
returns text
language plpgsql
immutable
strict
as $$
declare
  v_prefix text;
  v_body text;
begin
  if p_position_id ~ '^S-' then return 'moon'; end if;
  v_prefix := split_part(p_position_id,'-',1);
  v_body := lower(v_prefix);
  if v_body not in ('moon','mars','mercury','venus','ceres','pluto','europa','titan') then
    raise exception 'unsupported registry body';
  end if;
  return v_body;
end $$;

create or replace function public.registry_sync_body_from_lot_id()
returns trigger
language plpgsql
as $$
begin
  new.body_id := public.registry_body_from_position_id(new.lot_id);
  return new;
end $$;

drop trigger if exists trg_registry_lots_body on public.mld_lots;
create trigger trg_registry_lots_body
before insert or update of lot_id on public.mld_lots
for each row execute function public.registry_sync_body_from_lot_id();

drop trigger if exists trg_registry_offers_body on public.mld_offers;
create trigger trg_registry_offers_body
before insert or update of lot_id on public.mld_offers
for each row execute function public.registry_sync_body_from_lot_id();

drop trigger if exists trg_registry_transactions_body on public.mld_transactions;
create trigger trg_registry_transactions_body
before insert or update of lot_id on public.mld_transactions
for each row execute function public.registry_sync_body_from_lot_id();

drop trigger if exists trg_registry_metrics_body on public.mld_lot_metrics;
create trigger trg_registry_metrics_body
before insert or update of lot_id on public.mld_lot_metrics
for each row execute function public.registry_sync_body_from_lot_id();

drop trigger if exists trg_registry_watchlist_body on public.mld_watchlist;
create trigger trg_registry_watchlist_body
before insert or update of lot_id on public.mld_watchlist
for each row execute function public.registry_sync_body_from_lot_id();

create or replace function public.registry_record_primary_sale(
  p_body_id text,
  p_lot_id text,
  p_x integer,
  p_y integer,
  p_buyer_user_id uuid,
  p_amount_cents integer,
  p_payment_intent_id text
) returns text
language plpgsql
security definer
set search_path=public
as $$
declare
  v_body text := lower(trim(p_body_id));
begin
  if v_body not in ('moon','mars','mercury','venus','ceres','pluto','europa','titan') then
    raise exception 'unsupported registry body';
  end if;
  if p_x < 0 or p_x > 719 or p_y < 0 or p_y > 359 then
    raise exception 'registry position outside board';
  end if;
  if p_lot_id <> upper(v_body) || '-' || lpad(p_x::text,3,'0') || '-' || lpad(p_y::text,3,'0') then
    raise exception 'registry position id mismatch';
  end if;
  if p_amount_cents < 100 then raise exception 'primary sale must be at least $1'; end if;
  if exists(select 1 from public.mld_lots where lot_id=p_lot_id) then
    raise exception 'registry position already owned';
  end if;

  insert into public.mld_lots(
    lot_id,body_id,x,y,owner_user_id,last_paid_cents
  ) values(
    p_lot_id,v_body,p_x,p_y,p_buyer_user_id,p_amount_cents
  );

  insert into public.mld_lot_metrics(lot_id,body_id)
  values(p_lot_id,v_body)
  on conflict(lot_id) do nothing;

  insert into public.mld_transactions(
    lot_id,body_id,kind,buyer_user_id,seller_user_id,gross_cents,
    previous_paid_cents,gain_cents,seller_payout_cents,mld_fee_cents,
    stripe_payment_intent_id,payout_status
  ) values(
    p_lot_id,v_body,'first_sale',p_buyer_user_id,null,p_amount_cents,
    0,p_amount_cents,0,p_amount_cents,p_payment_intent_id,'not_applicable'
  );

  insert into public.audit_logs(actor,action,target_id,metadata)
  values(
    'stripe',
    'registry.first_sale',
    p_lot_id,
    jsonb_build_object('body_id',v_body,'gross_cents',p_amount_cents)
  );

  return p_lot_id;
end $$;

create or replace function public.reserve_body_registry_positions(
  p_body_id text,
  p_user_id uuid,
  p_brand text,
  p_tagline text,
  p_url text,
  p_position_ids text[],
  p_price_cents integer[],
  p_amount_cents integer,
  p_ttl_seconds integer default 2100
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_body text := lower(trim(p_body_id));
  v_prefix text := upper(v_body);
  v_count integer;
  v_price_count integer;
  v_price_total integer;
begin
  if v_body not in ('moon','mars','mercury','venus','ceres','pluto','europa','titan') then
    raise exception 'unsupported registry body';
  end if;
  if p_user_id is null then raise exception 'user required'; end if;
  if p_brand is null or char_length(trim(p_brand)) < 1 or char_length(p_brand) > 64 then
    raise exception 'invalid brand';
  end if;

  v_count := coalesce(array_length(p_position_ids,1),0);
  v_price_count := coalesce(array_length(p_price_cents,1),0);
  if v_count < 1 or v_count > 64 or v_count <> v_price_count then
    raise exception 'invalid registry selection';
  end if;
  if (select count(distinct x) from unnest(p_position_ids) x) <> v_count then
    raise exception 'duplicate registry position';
  end if;
  if exists(
    select 1 from unnest(p_position_ids) x
    where x !~ ('^' || v_prefix || '-([0-6][0-9][0-9]|7[01][0-9])-([0-2][0-9][0-9]|3[0-5][0-9])$')
  ) then
    raise exception 'registry selection must belong to one canonical body';
  end if;
  if exists(select 1 from unnest(p_price_cents) p where p < 100) then
    raise exception 'invalid registry position price';
  end if;

  select coalesce(sum(x),0) into v_price_total from unnest(p_price_cents) x;
  if v_price_total <> p_amount_cents then
    raise exception 'registry position prices do not match reservation total';
  end if;

  delete from public.sector_holds where expires_at <= now();

  if exists(select 1 from public.claim_sectors where sector_id=any(p_position_ids)) then
    raise exception 'registry position already held';
  end if;

  insert into public.reservations(
    id,user_id,body_id,brand,tagline,url,amount_cents,sector_count,expires_at
  ) values(
    v_id,p_user_id,v_body,trim(p_brand),coalesce(p_tagline,''),p_url,
    p_amount_cents,v_count,
    now()+make_interval(secs=>greatest(1800,least(p_ttl_seconds,3600)))
  );

  insert into public.sector_holds(
    sector_id,body_id,reservation_id,expires_at,price_cents
  )
  select
    p_position_ids[i],
    v_body,
    v_id,
    (select expires_at from public.reservations where id=v_id),
    p_price_cents[i]
  from generate_subscripts(p_position_ids,1) g(i);

  return v_id;
exception when unique_violation then
  raise exception 'one or more registry positions are already reserved';
end $$;

create or replace function public.reserve_registry_positions(
  p_user_id uuid,
  p_brand text,
  p_tagline text,
  p_url text,
  p_position_ids text[],
  p_price_cents integer[],
  p_amount_cents integer,
  p_ttl_seconds integer default 2100
) returns uuid
language sql
security definer
set search_path=public
as $$
  select public.reserve_body_registry_positions(
    'moon',
    p_user_id,p_brand,p_tagline,p_url,p_position_ids,p_price_cents,p_amount_cents,p_ttl_seconds
  );
$$;

create or replace function public.process_stripe_checkout_completed(
  p_event_id text,
  p_reservation_id uuid,
  p_session_id text,
  p_payment_intent text
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_res public.reservations%rowtype;
  v_claim uuid;
  v_hold_count integer;
  v_price_total integer;
  v_has_canonical boolean;
begin
  insert into public.stripe_events(event_id,type)
  values(p_event_id,'checkout.session.completed')
  on conflict do nothing;

  if not found then
    select id into v_claim from public.claims where stripe_checkout_session_id=p_session_id;
    return v_claim;
  end if;

  select * into v_res
  from public.reservations
  where id=p_reservation_id
  for update;

  if not found then raise exception 'reservation not found'; end if;
  if v_res.status='paid' then
    select id into v_claim from public.claims where stripe_checkout_session_id=p_session_id;
    return v_claim;
  end if;
  if v_res.status<>'reserved' or v_res.stripe_checkout_session_id<>p_session_id then
    raise exception 'reservation not payable';
  end if;

  select count(*),
         coalesce(sum(price_cents),0),
         bool_or(sector_id !~ '^S-')
  into v_hold_count,v_price_total,v_has_canonical
  from public.sector_holds
  where reservation_id=p_reservation_id;

  if v_hold_count<>v_res.sector_count then raise exception 'reservation hold is incomplete'; end if;
  if v_has_canonical and v_price_total<>v_res.amount_cents then
    raise exception 'canonical reservation price ledger is incomplete';
  end if;
  if exists(
    select 1 from public.claim_sectors
    where sector_id in (
      select sector_id from public.sector_holds where reservation_id=p_reservation_id
    )
  ) then
    raise exception 'registry position collision';
  end if;

  insert into public.claims(
    user_id,body_id,brand,tagline,url,amount_cents,currency,status,
    stripe_checkout_session_id,stripe_payment_intent_id
  ) values(
    v_res.user_id,v_res.body_id,v_res.brand,v_res.tagline,v_res.url,
    v_res.amount_cents,v_res.currency,'active',p_session_id,p_payment_intent
  )
  returning id into v_claim;

  insert into public.claim_sectors(sector_id,body_id,claim_id)
  select sector_id,v_res.body_id,v_claim
  from public.sector_holds
  where reservation_id=p_reservation_id;

  perform public.registry_record_primary_sale(
    v_res.body_id,
    h.sector_id,
    split_part(h.sector_id,'-',2)::integer,
    split_part(h.sector_id,'-',3)::integer,
    v_res.user_id,
    h.price_cents,
    p_payment_intent
  )
  from public.sector_holds h
  where h.reservation_id=p_reservation_id
    and h.sector_id !~ '^S-';

  delete from public.sector_holds where reservation_id=p_reservation_id;
  update public.reservations set status='paid' where id=p_reservation_id;

  insert into public.audit_logs(actor,action,target_id,metadata)
  values(
    'stripe',
    'claim.finalized',
    v_claim::text,
    jsonb_build_object(
      'reservation_id',p_reservation_id,
      'session_id',p_session_id,
      'body_id',v_res.body_id,
      'canonical_registry_ledger',v_has_canonical
    )
  );

  return v_claim;
end $$;

create or replace function public.snapshot_moon_index_after_transaction()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_gmv bigint;
  v_owned integer;
  v_index numeric(14,4);
begin
  if new.body_id <> 'moon' then
    return new;
  end if;

  select coalesce(sum(gross_cents),0)::bigint
    into v_gmv
  from public.mld_transactions
  where body_id='moon';

  select count(*)::integer
    into v_owned
  from public.mld_lots
  where body_id='moon';

  v_index := round(100::numeric + (v_gmv::numeric / 25920000::numeric) * 100::numeric,4);

  insert into public.market_index_snapshots(
    body_id,transaction_id,index_value,gross_market_volume_cents,owned_lots,created_at
  )
  values('moon',new.id,v_index,v_gmv,v_owned,new.created_at)
  on conflict(transaction_id) do nothing;

  return new;
end $$;

create or replace view public.claim_directory with (security_invoker=true) as
select
  c.id,c.user_id,c.body_id,c.brand,c.tagline,c.url,c.amount_cents,c.currency,c.status,c.created_at,
  coalesce((select array_agg(cs.sector_id order by cs.sector_id) from public.claim_sectors cs where cs.claim_id=c.id),'{}'::text[]) as sectors,
  coalesce((select count(*) from public.events e where e.claim_id=c.id and e.kind='view'),0)::bigint as views,
  coalesce((select count(*) from public.events e where e.claim_id=c.id and e.kind='click'),0)::bigint as clicks
from public.claims c
where c.status='active';

create or replace view public.claim_admin_directory with (security_invoker=true) as
select
  c.id,c.user_id,c.body_id,c.brand,c.tagline,c.url,c.amount_cents,c.currency,c.status,
  c.stripe_checkout_session_id,c.stripe_payment_intent_id,c.stripe_refund_id,
  c.refunded_at,c.created_at,
  coalesce((select array_agg(cs.sector_id order by cs.sector_id) from public.claim_sectors cs where cs.claim_id=c.id),'{}'::text[]) as sectors,
  coalesce((select count(*) from public.events e where e.claim_id=c.id and e.kind='view'),0)::bigint as views,
  coalesce((select count(*) from public.events e where e.claim_id=c.id and e.kind='click'),0)::bigint as clicks
from public.claims c;

create or replace view public.mld_offer_directory with (security_invoker=true) as
select
  o.id,
  o.body_id,
  o.lot_id,
  o.buyer_user_id,
  l.owner_user_id as seller_user_id,
  o.amount_cents,
  l.last_paid_cents,
  (l.last_paid_cents+100) as minimum_offer_cents,
  greatest(l.last_paid_cents+100,ceil(l.last_paid_cents*1.10)::integer) as suggested_offer_cents,
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

create or replace view public.mld_watchlist_directory with (security_invoker=true) as
select
  w.user_id,
  w.body_id,
  w.lot_id,
  w.created_at,
  l.last_paid_cents,
  l.purchase_count,
  coalesce(m.views,0)::bigint as views,
  coalesce(m.clicks,0)::bigint as clicks
from public.mld_watchlist w
join public.mld_lots l on l.lot_id=w.lot_id
left join public.mld_lot_metrics m on m.lot_id=w.lot_id;

revoke all on public.claim_directory,public.claim_admin_directory,public.mld_offer_directory,public.mld_watchlist_directory
  from public,anon,authenticated;
grant select on public.claim_directory,public.claim_admin_directory,public.mld_offer_directory,public.mld_watchlist_directory
  to service_role;

create or replace view public.registry_body_market_summary with (security_invoker=true) as
select
  t.body_id,
  259200::integer as total_positions,
  (select count(*) from public.mld_lots l where l.body_id=t.body_id)::integer as owned_positions,
  coalesce(sum(t.gross_cents),0)::bigint as gross_market_volume_cents,
  coalesce(sum(t.mld_fee_cents),0)::bigint as platform_revenue_cents,
  count(*)::bigint as transaction_count
from public.mld_transactions t
group by t.body_id;

create or replace view public.registry_position_directory with (security_invoker=true) as
select
  l.body_id,
  l.lot_id as position_id,
  l.x,
  l.y,
  l.last_paid_cents,
  l.purchase_count,
  l.updated_at,
  coalesce(m.views,0)::bigint as views,
  coalesce(m.clicks,0)::bigint as clicks
from public.mld_lots l
left join public.mld_lot_metrics m on m.lot_id=l.lot_id;

-- Keep the Moon-specific compatibility views truthful.
create or replace view public.mld_lot_directory with (security_invoker=true) as
select
  l.lot_id,l.x,l.y,l.last_paid_cents,l.purchase_count,l.updated_at,
  coalesce(m.views,0)::bigint as views,
  coalesce(m.clicks,0)::bigint as clicks
from public.mld_lots l
left join public.mld_lot_metrics m on m.lot_id=l.lot_id
where l.body_id='moon';

create or replace view public.mld_market_summary with (security_invoker=true) as
select
  259200::integer as total_lots,
  (select count(*) from public.mld_lots where body_id='moon')::integer as owned_lots,
  coalesce(sum(t.gross_cents),0)::bigint as gross_market_volume_cents,
  coalesce(sum(t.mld_fee_cents),0)::bigint as mld_revenue_cents,
  round(
    100::numeric +
    (coalesce(sum(t.gross_cents),0)::numeric / 25920000::numeric) * 100::numeric,
    2
  ) as moon_index
from public.mld_transactions t
where t.body_id='moon';

revoke all on public.registry_body_market_summary,public.registry_position_directory
  from public,anon,authenticated;
grant select on public.registry_body_market_summary,public.registry_position_directory
  to service_role;

revoke execute on function public.registry_body_from_position_id(text)
  from public,anon,authenticated;
revoke execute on function public.registry_sync_body_from_lot_id() from public,anon,authenticated;
revoke execute on function public.registry_record_primary_sale(text,text,integer,integer,uuid,integer,text)
  from public,anon,authenticated;
revoke execute on function public.reserve_body_registry_positions(text,uuid,text,text,text,text[],integer[],integer,integer)
  from public,anon,authenticated;
revoke execute on function public.reserve_registry_positions(uuid,text,text,text,text[],integer[],integer,integer)
  from public,anon,authenticated;
revoke execute on function public.process_stripe_checkout_completed(text,uuid,text,text)
  from public,anon,authenticated;

grant execute on function public.registry_body_from_position_id(text) to service_role;
grant execute on function public.registry_sync_body_from_lot_id() to service_role;
grant execute on function public.registry_record_primary_sale(text,text,integer,integer,uuid,integer,text)
  to service_role;
grant execute on function public.reserve_body_registry_positions(text,uuid,text,text,text,text[],integer[],integer,integer)
  to service_role;
grant execute on function public.reserve_registry_positions(uuid,text,text,text,text[],integer[],integer,integer)
  to service_role;
grant execute on function public.process_stripe_checkout_completed(text,uuid,text,text)
  to service_role;

insert into public.audit_logs(actor,action,target_id,metadata)
values(
  'migration',
  'registry.body_aware_ledger_enabled',
  'atlas259',
  jsonb_build_object(
    'moon_compatibility',true,
    'surface_bodies',jsonb_build_array('moon','mars','mercury','venus','ceres','pluto','europa','titan'),
    'single_body_reservations',true,
    'body_keyed_transactions',true
  )
);
