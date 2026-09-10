create table if not exists public.rate_limits (
  bucket text not null,
  key_hash text not null,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  primary key (bucket,key_hash)
);

alter table public.rate_limits enable row level security;

create or replace function public.consume_rate_limit(p_bucket text,p_key_hash text,p_limit integer,p_window_seconds integer)
returns boolean language plpgsql security invoker set search_path=public as $$
declare
  v_attempts integer;
  v_started timestamptz;
begin
  if p_limit < 1 or p_limit > 10000 then raise exception 'invalid rate limit'; end if;
  if p_window_seconds < 1 or p_window_seconds > 86400 then raise exception 'invalid rate window'; end if;

  insert into public.rate_limits(bucket,key_hash,window_started_at,attempts)
  values(p_bucket,p_key_hash,now(),1)
  on conflict(bucket,key_hash) do update set
    attempts = case
      when public.rate_limits.window_started_at <= now() - make_interval(secs=>p_window_seconds) then 1
      else public.rate_limits.attempts + 1
    end,
    window_started_at = case
      when public.rate_limits.window_started_at <= now() - make_interval(secs=>p_window_seconds) then now()
      else public.rate_limits.window_started_at
    end
  returning attempts,window_started_at into v_attempts,v_started;

  return v_attempts <= p_limit;
end $$;

revoke all on public.rate_limits from public, anon, authenticated;
revoke execute on function public.consume_rate_limit(text,text,integer,integer) from public, anon, authenticated;
grant select,insert,update,delete on public.rate_limits to service_role;
grant execute on function public.consume_rate_limit(text,text,integer,integer) to service_role;
