-- Atlas 259 immutable Moon Index history.

create table if not exists public.market_index_snapshots (
  id bigint generated always as identity primary key,
  body_id text not null default 'moon',
  transaction_id uuid not null unique references public.mld_transactions(id) on delete restrict,
  index_value numeric(14,4) not null check (index_value >= 100),
  gross_market_volume_cents bigint not null check (gross_market_volume_cents >= 0),
  owned_lots integer not null check (owned_lots >= 0 and owned_lots <= 259200),
  created_at timestamptz not null
);

alter table public.market_index_snapshots enable row level security;
revoke all on public.market_index_snapshots from public, anon, authenticated;
grant select,insert on public.market_index_snapshots to service_role;

create index if not exists idx_market_index_body_time
  on public.market_index_snapshots(body_id,created_at,id);

-- Backfill a deterministic snapshot for every existing Moon transaction.
insert into public.market_index_snapshots(
  body_id,transaction_id,index_value,gross_market_volume_cents,owned_lots,created_at
)
select
  'moon',
  x.id,
  round(100::numeric + (x.running_gmv::numeric / 25920000::numeric) * 100::numeric,4),
  x.running_gmv,
  x.running_owned,
  x.created_at
from (
  select
    t.id,
    t.created_at,
    sum(t.gross_cents::bigint) over(order by t.created_at,t.id) as running_gmv,
    sum(case when t.kind='first_sale' then 1 else 0 end) over(order by t.created_at,t.id)::integer as running_owned
  from public.mld_transactions t
) x
on conflict(transaction_id) do nothing;

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
  select coalesce(sum(gross_cents),0)::bigint into v_gmv from public.mld_transactions;
  select count(*)::integer into v_owned from public.mld_lots;
  v_index := round(100::numeric + (v_gmv::numeric / 25920000::numeric) * 100::numeric,4);

  insert into public.market_index_snapshots(
    body_id,transaction_id,index_value,gross_market_volume_cents,owned_lots,created_at
  )
  values('moon',new.id,v_index,v_gmv,v_owned,new.created_at)
  on conflict(transaction_id) do nothing;

  return new;
end $$;

drop trigger if exists trg_snapshot_moon_index on public.mld_transactions;
create trigger trg_snapshot_moon_index
after insert on public.mld_transactions
for each row execute function public.snapshot_moon_index_after_transaction();

revoke execute on function public.snapshot_moon_index_after_transaction() from public, anon, authenticated;

insert into public.audit_logs(actor,action,target_id,metadata)
values(
  'migration',
  'index.immutable_history_enabled',
  'moon',
  jsonb_build_object('formula_version','moon-index-v1','base',100,'board_reference_cents',25920000)
);
