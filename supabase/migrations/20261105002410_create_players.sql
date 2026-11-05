-- Step 4: players who join a room with a nickname.
-- ROLLBACK (documented, run manually if needed):
--   drop trigger if exists players_enforce_room_rules on public.players;
--   drop function if exists public.players_enforce_room_rules();
--   drop table if exists public.players;

create table public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  nickname text not null,
  -- Normalized form (lowercase, no accents, a-z0-9 only). Generated so it can never drift.
  nickname_key text generated always as (public.normalize_name(nickname)) stored,
  -- sha256 hex of the random player token kept in the httpOnly cookie. Never the token itself.
  session_hash text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint players_nickname_length check (char_length(nickname) between 2 and 20),
  constraint players_nickname_trimmed check (nickname = btrim(nickname)),
  constraint players_nickname_no_control check (nickname !~ '[[:cntrl:]]'),
  constraint players_nickname_key_min check (char_length(nickname_key) >= 2),
  constraint players_session_hash_format check (session_hash ~ '^[0-9a-f]{64}$'),
  -- These two unique indexes also cover the room_id foreign key lookups.
  constraint players_room_nickname_key unique (room_id, nickname_key),
  constraint players_room_session_key unique (room_id, session_hash)
);

comment on table public.players is
  'Players in a room. Only the nickname is stored. Accessed only by the server with service_role.';

-- Race guard: the room must be open and hold at most 100 players.
-- The application checks first for friendly errors; this trigger is the source of truth.
create function public.players_enforce_room_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
  v_count integer;
begin
  -- Serialize concurrent joins to the same room so two requests cannot both pass the check.
  perform pg_advisory_xact_lock(hashtextextended('players_room:' || new.room_id::text, 0));

  select status into v_status from public.rooms where id = new.room_id;
  if v_status is distinct from 'open' then
    raise exception 'room closed' using errcode = 'P0001', hint = 'ROOM_CLOSED';
  end if;

  select count(*) into v_count from public.players where room_id = new.room_id;
  if v_count >= 100 then
    raise exception 'room full' using errcode = '53400', hint = 'ROOM_FULL';
  end if;

  return new;
end
$$;

revoke all on function public.players_enforce_room_rules() from public, anon, authenticated;
grant execute on function public.players_enforce_room_rules() to service_role;

create trigger players_enforce_room_rules
  before insert on public.players
  for each row execute function public.players_enforce_room_rules();

-- Deny by default: RLS on, no policies, privileges revoked.
alter table public.players enable row level security;
revoke all on public.players from public, anon, authenticated, service_role;
grant select, insert on public.players to service_role;
