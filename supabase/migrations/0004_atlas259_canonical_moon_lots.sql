-- Atlas 259 canonical Moon registry IDs.
-- Preserve legacy S-xx-xx donor-era rows for compatibility while all new UI writes use MOON-xxx-xxx.

alter table public.claim_sectors
  drop constraint if exists claim_sectors_sector_id_check;

alter table public.claim_sectors
  add constraint claim_sectors_sector_id_check
  check (
    sector_id ~ '^S-([0-5][0-9]|6[0-3])-([0-2][0-9]|3[0-1])$'
    or sector_id ~ '^MOON-([0-6][0-9][0-9]|7[01][0-9])-([0-2][0-9][0-9]|3[0-5][0-9])$'
  );

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
  if v_count < 1 or v_count > 64 or v_count <> coalesce(array_length(p_sector_ids,1),0) then
    raise exception 'invalid registry selection';
  end if;

  if exists(
    select 1
    from unnest(p_sector_ids) x
    where not (
      x ~ '^S-([0-5][0-9]|6[0-3])-([0-2][0-9]|3[0-1])$'
      or x ~ '^MOON-([0-6][0-9][0-9]|7[01][0-9])-([0-2][0-9][0-9]|3[0-5][0-9])$'
    )
  ) then
    raise exception 'invalid registry position id';
  end if;

  delete from public.sector_holds where expires_at <= now();

  if exists(select 1 from public.claim_sectors where sector_id = any(p_sector_ids)) then
    raise exception 'registry position already held';
  end if;

  insert into public.reservations(id,user_id,brand,tagline,url,amount_cents,sector_count,expires_at)
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

  insert into public.sector_holds(sector_id,reservation_id,expires_at)
  select x,v_id,(select expires_at from public.reservations where id=v_id)
  from unnest(p_sector_ids) x;

  return v_id;
exception when unique_violation then
  raise exception 'one or more registry positions are already reserved';
end $$;

revoke execute on function public.reserve_sectors(uuid,text,text,text,text[],integer,integer)
  from public, anon, authenticated;
grant execute on function public.reserve_sectors(uuid,text,text,text,text[],integer,integer)
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
    'legacy_pattern_preserved','S-xx-xx'
  )
);
