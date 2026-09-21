-- Atlas 259 marketplace growth primitives: watchlists and public activity.

create table if not exists public.mld_watchlist (
  user_id uuid not null references auth.users(id) on delete cascade,
  lot_id text not null references public.mld_lots(lot_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id,lot_id)
);

alter table public.mld_watchlist enable row level security;
revoke all on public.mld_watchlist from public, anon, authenticated;
grant select,insert,delete on public.mld_watchlist to service_role;

create index if not exists idx_mld_watchlist_lot on public.mld_watchlist(lot_id,created_at desc);

create or replace view public.mld_watchlist_directory with (security_invoker = true) as
select
  w.user_id,
  w.lot_id,
  w.created_at,
  l.last_paid_cents,
  l.purchase_count,
  coalesce(m.views,0)::bigint as views,
  coalesce(m.clicks,0)::bigint as clicks
from public.mld_watchlist w
join public.mld_lots l on l.lot_id=w.lot_id
left join public.mld_lot_metrics m on m.lot_id=w.lot_id;

revoke all on public.mld_watchlist_directory from public, anon, authenticated;
grant select on public.mld_watchlist_directory to service_role;

insert into public.audit_logs(actor,action,target_id,metadata)
values('migration','marketplace.watchlists_enabled','moon',jsonb_build_object('watchlists',true,'public_activity',true));
