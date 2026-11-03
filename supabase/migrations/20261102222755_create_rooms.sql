-- Step 3: rooms (admin code stored only as a hash) and a DB-backed rate limiter.

create table public.rooms (
  id                uuid        primary key default gen_random_uuid(),
  room_code         text        not null,
  admin_code_hash   text        not null,
  secret_pokemon_id integer     not null references public.pokemon (id),
  status            text        not null default 'open',
  created_at        timestamptz not null default now(),
  closed_at         timestamptz,
  constraint rooms_room_code_key unique (room_code),
  constraint rooms_room_code_format check (room_code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  constraint rooms_admin_code_hash_format check (admin_code_hash ~ '^[0-9a-f]{64}$'),
  constraint rooms_status_valid check (status in ('open', 'closed')),
  constraint rooms_closed_at_consistent check ((status = 'closed') = (closed_at is not null))
);

create index rooms_secret_pokemon_id_idx on public.rooms (secret_pokemon_id);

comment on table public.rooms is
  'Server-only. RLS on with NO policies. Only service_role may SELECT/INSERT (UPDATE arrives with the close-room step). admin_code_hash = sha256 of the admin code; the code itself is never stored.';

alter table public.rooms enable row level security;
revoke all on table public.rooms from public, anon, authenticated, service_role;
grant select, insert on table public.rooms to service_role;

-- Fixed-window rate limiter. Table is closed to everyone; only the SECURITY DEFINER function touches it.
create table public.rate_limits (
  key          text        not null check (length(key) between 1 and 200),
  window_start timestamptz not null,
  hits         integer     not null default 0 check (hits >= 0),
  primary key (key, window_start)
);

comment on table public.rate_limits is
  'Server-only counters for rate limiting. Keys hold hashed identifiers, never raw IPs. Accessed only through rate_limit_hit().';

alter table public.rate_limits enable row level security;
revoke all on table public.rate_limits from public, anon, authenticated, service_role;

create function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns table (allowed boolean, retry_after integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_start timestamptz;
  v_hits integer;
begin
  if p_limit < 1 or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'invalid rate limit arguments' using errcode = '22023';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limits as r (key, window_start, hits)
  values (p_key, v_window_start, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning r.hits into v_hits;

  -- Opportunistic cleanup of old windows (about 2% of calls).
  if random() < 0.02 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return query select
    v_hits <= p_limit,
    case when v_hits <= p_limit then 0
         else greatest(1, ceil(extract(epoch from
                (v_window_start + make_interval(secs => p_window_seconds) - clock_timestamp())))::integer)
    end;
end
$$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

-- ROLLBACK (documented, not executed):
--   drop function public.rate_limit_hit(text, integer, integer);
--   drop table public.rate_limits;
--   drop table public.rooms;
