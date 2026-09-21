-- Atlas 259 canonical Moon registry IDs + primary-sale ledger bridge.
-- Runs after 0004_mld_market.sql. Legacy S-xx-xx claims remain readable;
-- all new production purchases use MOON-xxx-xxx with per-position prices.

alter table public.claim_sectors
  drop constraint if exists claim_sectors_sector_id_check;

alter table public.claim_sectors
  add constraint claim_sectors_sector_id_check
  check (
    sector_id ~ '^S-([0-5][0-9]|6[0-3])-([0-2][0-9]|3[0-1])$'
    or sector_id ~ '^MOON-([0-6][0-9][0-9]|7[01][0-9])-([0-2][0-9][0-9]|3[0-5][0-9])$'
  );

alter table public.sector_holds
  add column if not exists price_cents integer;

alter table public.sector_holds
  drop constraint if exists sector_holds_price_cents_check;

alter table public.sector_holds
  add constraint sector_holds_price_cents_check
  check (price_cents is null or price_cents >= 100);

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
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_count integer;
  v_price_count integer;
  v_price_total integer;
begin
  if p_user_id is null then raise exception 'user required'; end if;
  if p_brand is null or char_length(trim(p_brand)) < 1 or char_length(p_brand) > 64 then
    raise exception 'invalid brand';
  end if;

  v_count := coalesce(array_length(p_position_ids, 1), 0);
  v_price_count := coalesce(array_length(p_price_cents, 1), 0);

  if v_count < 1 or v_count > 64 or v_count <> v_price_count then
    raise exception 'invalid registry selection';
  end if;

  if (select count(distinct x) from unnest(p_position_ids) x) <> v_count then
    raise exception 'duplicate registry position';
  end if;

  if exists(
    select 1 from unnest(p_position_ids) x
    where x !~ '^MOON-([0-6][0-9][0-9]|7[01][0-9])-([0-2][0-9][0-9]|3[0-5][0-9])$'
  ) then
    raise exception 'new purchases require canonical MOON-xxx-xxx ids';
  end if;

  if exists(select 1 from unnest(p_price_cents) p where p < 100) then
    raise exception 'invalid registry position price';
  end if;

  select coalesce(sum(x), 0) into v_price_total from unnest(p_price_cents) x;
  if v_price_total <> p_amount_cents then
    raise exception 'registry position prices do not match reservation total';
  end if;

  delete from public.sector_holds where expires_at <= now();

  if exists(select 1 from public.claim_sectors where sector_id = any(p_position_ids)) then
    raise exception 'registry position already held';
  end if;

  insert into public.reservations(
    id,user_id,brand,tagline,url,amount_cents,sector_count,expires_at
  )
  values(
    v_id,
    p_user_id,
    trim(p_brand),
    coalesce(p_tagline,''),
    p_url,
    p_amount_cents,
    v_count,
    now()+make_interval(secs=>greatest(1800,least(p_ttl_seconds,3600)))
  );

  insert into public.sector_holds(sector_id,reservation_id,expires_at,price_cents)
  select
    p_position_ids[i],
    v_id,
    (select expires_at from public.reservations where id=v_id),
    p_price_cents[i]
  from generate_subscripts(p_position_ids, 1) g(i);

  return v_id;
exception when unique_violation then
  raise exception 'one or more registry positions are already reserved';
end $$;

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
         bool_or(sector_id ~ '^MOON-')
  into v_hold_count, v_price_total, v_has_canonical
  from public.sector_holds
  where reservation_id=p_reservation_id;

  if v_hold_count<>v_res.sector_count then
    raise exception 'reservation hold is incomplete';
  end if;

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
    user_id,brand,tagline,url,amount_cents,currency,status,
    stripe_checkout_session_id,stripe_payment_intent_id
  )
  values(
    v_res.user_id,v_res.brand,v_res.tagline,v_res.url,v_res.amount_cents,
    v_res.currency,'active',p_session_id,p_payment_intent
  )
  returning id into v_claim;

  insert into public.claim_sectors(sector_id,claim_id)
  select sector_id,v_claim
  from public.sector_holds
  where reservation_id=p_reservation_id;

  -- Each canonical Moon position becomes a first-sale MLD ledger row using
  -- its own server-authoritative quote price. This preserves correct last-paid
  -- values for later offer floors and resale settlement.
  perform public.mld_record_primary_sale(
    h.sector_id,
    split_part(h.sector_id,'-',2)::integer,
    split_part(h.sector_id,'-',3)::integer,
    v_res.user_id,
    h.price_cents,
    p_payment_intent
  )
  from public.sector_holds h
  where h.reservation_id=p_reservation_id
    and h.sector_id ~ '^MOON-';

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
      'canonical_mld_ledger',v_has_canonical
    )
  );

  return v_claim;
end $$;

revoke execute on function public.reserve_registry_positions(uuid,text,text,text,text[],integer[],integer,integer)
  from public, anon, authenticated;
revoke execute on function public.process_stripe_checkout_completed(text,uuid,text,text)
  from public, anon, authenticated;

grant execute on function public.reserve_registry_positions(uuid,text,text,text,text[],integer[],integer,integer)
  to service_role;
grant execute on function public.process_stripe_checkout_completed(text,uuid,text,text)
  to service_role;

insert into public.audit_logs(actor,action,target_id,metadata)
values(
  'migration',
  'registry.canonical_moon_ids_enabled',
  'moon',
  jsonb_build_object(
    'brand','Atlas 259',
    'canonical_pattern','MOON-xxx-xxx',
    'total_lots',259200,
    'legacy_pattern_preserved','S-xx-xx',
    'primary_sale_ledger_bridge',true
  )
);
