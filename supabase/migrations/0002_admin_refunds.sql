alter table public.claims add column if not exists stripe_refund_id text unique;
alter table public.claims add column if not exists refunded_at timestamptz;

create or replace view public.claim_admin_directory with (security_invoker = true) as
select
  c.id, c.user_id, c.brand, c.tagline, c.url, c.amount_cents, c.currency, c.status,
  c.stripe_checkout_session_id, c.stripe_payment_intent_id, c.stripe_refund_id,
  c.refunded_at, c.created_at,
  coalesce((select array_agg(cs.sector_id order by cs.sector_id) from public.claim_sectors cs where cs.claim_id=c.id), '{}'::text[]) as sectors,
  coalesce((select count(*) from public.events e where e.claim_id=c.id and e.kind='view'),0)::bigint as views,
  coalesce((select count(*) from public.events e where e.claim_id=c.id and e.kind='click'),0)::bigint as clicks
from public.claims c;

revoke all on public.claim_admin_directory from public, anon, authenticated;
grant select on public.claim_admin_directory to service_role;

create or replace function public.record_claim_refund(p_claim_id uuid,p_refund_id text,p_actor text,p_note text default '')
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if p_refund_id is null or char_length(trim(p_refund_id)) < 1 then raise exception 'refund id required'; end if;
  update public.claims
  set status='refunded', stripe_refund_id=p_refund_id, refunded_at=now()
  where id=p_claim_id and status<>'refunded';
  if not found then return false; end if;
  insert into public.audit_logs(actor,action,target_id,metadata)
  values(p_actor,'claim.refunded',p_claim_id::text,jsonb_build_object('refund_id',p_refund_id,'note',coalesce(p_note,'')));
  return true;
end $$;

revoke execute on function public.record_claim_refund(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.record_claim_refund(uuid,text,text,text) to service_role;
