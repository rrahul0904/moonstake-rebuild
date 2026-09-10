create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  brand text not null check (char_length(brand) between 1 and 64),
  created_at timestamptz not null default now()
);

create table if not exists public.claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  brand text not null check (char_length(brand) between 1 and 64),
  tagline text not null default '' check (char_length(tagline) <= 140),
  url text,
  amount_cents integer not null check (amount_cents >= 100),
  currency text not null default 'USD' check (currency = 'USD'),
  status text not null default 'active' check (status in ('active','hidden','refunded')),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.claim_sectors (
  sector_id text primary key check (sector_id ~ '^S-([0-5][0-9]|6[0-3])-([0-2][0-9]|3[0-1])$'),
  claim_id uuid not null references public.claims(id) on delete cascade
);

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brand text not null check (char_length(brand) between 1 and 64),
  tagline text not null default '' check (char_length(tagline) <= 140),
  url text,
  amount_cents integer not null check (amount_cents >= 100),
  currency text not null default 'USD' check (currency = 'USD'),
  sector_count integer not null check (sector_count between 1 and 64),
  status text not null default 'reserved' check (status in ('reserved','paid','released','expired')),
  stripe_checkout_session_id text unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.sector_holds (
  sector_id text primary key,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  expires_at timestamptz not null
);

create table if not exists public.events (
  id bigint generated always as identity primary key,
  claim_id uuid not null references public.claims(id) on delete cascade,
  kind text not null check (kind in ('view','click')),
  fingerprint text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.stripe_events (
  event_id text primary key,
  type text not null,
  processed_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor text not null,
  action text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_claims_user on public.claims(user_id);
create index if not exists idx_claims_status on public.claims(status);
create index if not exists idx_events_claim on public.events(claim_id, created_at desc);
create index if not exists idx_holds_expiry on public.sector_holds(expires_at);
create index if not exists idx_reservations_user on public.reservations(user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.claims enable row level security;
alter table public.claim_sectors enable row level security;
alter table public.reservations enable row level security;
alter table public.sector_holds enable row level security;
alter table public.events enable row level security;
alter table public.stripe_events enable row level security;
alter table public.audit_logs enable row level security;

create policy "profiles_read_own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create or replace view public.claim_directory with (security_invoker = true) as
select
  c.id, c.user_id, c.brand, c.tagline, c.url, c.amount_cents, c.currency, c.status, c.created_at,
  coalesce((select array_agg(cs.sector_id order by cs.sector_id) from public.claim_sectors cs where cs.claim_id=c.id), '{}'::text[]) as sectors,
  coalesce((select count(*) from public.events e where e.claim_id=c.id and e.kind='view'),0)::bigint as views,
  coalesce((select count(*) from public.events e where e.claim_id=c.id and e.kind='click'),0)::bigint as clicks
from public.claims c
where c.status='active';

revoke all on public.claim_directory from anon, authenticated;

create or replace function public.reserve_sectors(
  p_user_id uuid,
  p_brand text,
  p_tagline text,
  p_url text,
  p_sector_ids text[],
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
begin
  if p_user_id is null then raise exception 'user required'; end if;
  if p_brand is null or char_length(trim(p_brand)) < 1 or char_length(p_brand) > 64 then raise exception 'invalid brand'; end if;
  if p_amount_cents < 100 then raise exception 'invalid amount'; end if;
  select count(distinct x) into v_count from unnest(p_sector_ids) x;
  if v_count < 1 or v_count > 64 or v_count <> coalesce(array_length(p_sector_ids,1),0) then raise exception 'invalid sector selection'; end if;
  if exists(select 1 from unnest(p_sector_ids) x where x !~ '^S-([0-5][0-9]|6[0-3])-([0-2][0-9]|3[0-1])$') then raise exception 'invalid sector id'; end if;

  delete from public.sector_holds where expires_at <= now();
  if exists(select 1 from public.claim_sectors where sector_id = any(p_sector_ids)) then raise exception 'sector already claimed'; end if;

  insert into public.reservations(id,user_id,brand,tagline,url,amount_cents,sector_count,expires_at)
  values(v_id,p_user_id,trim(p_brand),coalesce(p_tagline,''),p_url,p_amount_cents,v_count,now()+make_interval(secs=>greatest(1800,least(p_ttl_seconds,3600))));

  insert into public.sector_holds(sector_id,reservation_id,expires_at)
  select x,v_id,(select expires_at from public.reservations where id=v_id)
  from unnest(p_sector_ids) x;
  return v_id;
exception when unique_violation then
  raise exception 'one or more sectors are already reserved';
end $$;

create or replace function public.attach_checkout_session(p_reservation_id uuid,p_session_id text,p_user_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  update public.reservations set stripe_checkout_session_id=p_session_id
  where id=p_reservation_id and user_id=p_user_id and status='reserved' and expires_at>now() and stripe_checkout_session_id is null;
  return found;
end $$;

create or replace function public.release_reservation(p_reservation_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  delete from public.sector_holds where reservation_id=p_reservation_id;
  update public.reservations set status='released' where id=p_reservation_id and status='reserved';
  return found;
end $$;

create or replace function public.process_stripe_checkout_completed(p_event_id text,p_reservation_id uuid,p_session_id text,p_payment_intent text)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_res public.reservations%rowtype;
  v_claim uuid;
  v_hold_count integer;
begin
  insert into public.stripe_events(event_id,type) values(p_event_id,'checkout.session.completed') on conflict do nothing;
  if not found then
    select id into v_claim from public.claims where stripe_checkout_session_id=p_session_id;
    return v_claim;
  end if;

  select * into v_res from public.reservations where id=p_reservation_id for update;
  if not found then raise exception 'reservation not found'; end if;
  if v_res.status='paid' then select id into v_claim from public.claims where stripe_checkout_session_id=p_session_id; return v_claim; end if;
  if v_res.status<>'reserved' or v_res.stripe_checkout_session_id<>p_session_id then raise exception 'reservation not payable'; end if;
  select count(*) into v_hold_count from public.sector_holds where reservation_id=p_reservation_id;
  if v_hold_count<>v_res.sector_count then raise exception 'reservation hold is incomplete'; end if;
  if exists(select 1 from public.claim_sectors where sector_id in (select sector_id from public.sector_holds where reservation_id=p_reservation_id)) then raise exception 'sector collision'; end if;

  insert into public.claims(user_id,brand,tagline,url,amount_cents,currency,status,stripe_checkout_session_id,stripe_payment_intent_id)
  values(v_res.user_id,v_res.brand,v_res.tagline,v_res.url,v_res.amount_cents,v_res.currency,'active',p_session_id,p_payment_intent)
  returning id into v_claim;
  insert into public.claim_sectors(sector_id,claim_id) select sector_id,v_claim from public.sector_holds where reservation_id=p_reservation_id;
  delete from public.sector_holds where reservation_id=p_reservation_id;
  update public.reservations set status='paid' where id=p_reservation_id;
  insert into public.audit_logs(actor,action,target_id,metadata) values('stripe','claim.finalized',v_claim::text,jsonb_build_object('reservation_id',p_reservation_id,'session_id',p_session_id));
  return v_claim;
end $$;

create or replace function public.process_stripe_checkout_expired(p_event_id text,p_reservation_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  insert into public.stripe_events(event_id,type) values(p_event_id,'checkout.session.expired') on conflict do nothing;
  if not found then return false; end if;
  delete from public.sector_holds where reservation_id=p_reservation_id;
  update public.reservations set status='expired' where id=p_reservation_id and status='reserved';
  return true;
end $$;

create or replace function public.moderate_claim(p_claim_id uuid,p_status text,p_note text,p_actor text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if p_status not in ('active','hidden','refunded') then raise exception 'invalid status'; end if;
  update public.claims set status=p_status where id=p_claim_id;
  if not found then return false; end if;
  insert into public.audit_logs(actor,action,target_id,metadata) values(p_actor,'claim.moderated',p_claim_id::text,jsonb_build_object('status',p_status,'note',coalesce(p_note,'')));
  return true;
end $$;

revoke execute on function public.reserve_sectors(uuid,text,text,text,text[],integer,integer) from public, anon, authenticated;
revoke execute on function public.attach_checkout_session(uuid,text,uuid) from public, anon, authenticated;
revoke execute on function public.release_reservation(uuid) from public, anon, authenticated;
revoke execute on function public.process_stripe_checkout_completed(text,uuid,text,text) from public, anon, authenticated;
revoke execute on function public.process_stripe_checkout_expired(text,uuid) from public, anon, authenticated;
revoke execute on function public.moderate_claim(uuid,text,text,text) from public, anon, authenticated;

grant select,insert,update,delete on public.profiles,public.claims,public.claim_sectors,public.reservations,public.sector_holds,public.events,public.stripe_events,public.audit_logs to service_role;
grant select on public.claim_directory to service_role;
grant usage,select on sequence public.events_id_seq to service_role;
grant usage,select on sequence public.audit_logs_id_seq to service_role;
grant execute on function public.reserve_sectors(uuid,text,text,text,text[],integer,integer) to service_role;
grant execute on function public.attach_checkout_session(uuid,text,uuid) to service_role;
grant execute on function public.release_reservation(uuid) to service_role;
grant execute on function public.process_stripe_checkout_completed(text,uuid,text,text) to service_role;
grant execute on function public.process_stripe_checkout_expired(text,uuid) to service_role;
grant execute on function public.moderate_claim(uuid,text,text,text) to service_role;
