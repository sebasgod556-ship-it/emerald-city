-- Steps 11+12: turn mode (A), presence (reconnection) and kicking players.
-- APPLY: paste this whole file in the Supabase SQL Editor (project de pruebas) and run it once. It is wrapped in
-- begin/commit, so it either applies completely or not at all. Verify afterwards with supabase/tests/turns_kick_simulation_1.sql, _2.sql and _3.sql.
-- Expand-only for data: new columns with defaults that keep today's behavior (every room stays in free mode),
-- internal helpers, three new admin/presence functions, apply_due_timers() replaced (extra output columns),
-- submit_attempt() and post_chat_message() replaced with the same signature, and the players trigger now
-- ignores kicked players when counting the 100-player cap.
--
-- ROLLBACK (documented, run manually if needed; it forgets turns and kicks of every room):
--   drop function if exists public.kick_player(uuid, text);
--   drop function if exists public.touch_player(uuid, text);
--   drop function if exists public.apply_due_timers(uuid);
--   drop function if exists public._turn_tick(uuid);
--   drop function if exists public._advance_turn(uuid);
--   drop trigger if exists players_set_turn_rank on public.players;
--   drop function if exists public.players_set_turn_rank();
--   -- then re-run from 20261108005307_wait_room_and_cooldown.sql: apply_due_timers(), start_room() and submit_attempt();
--   -- and from 20261107181838_hints_and_chat.sql: post_chat_message(); and from 20261105002410_create_players.sql: players_enforce_room_rules()
--   begin;

alter table public.rooms drop constraint if exists rooms_turn_player_fk;
--   alter table public.rooms drop column if exists turn_deadline_at, drop column if exists turn_player_id,
--     drop column if exists turn_seq, drop column if exists turn_seconds, drop column if exists turn_order, drop column if exists mode;
--   alter table public.players drop column if exists kicked_at, drop column if exists turn_rank;

alter table public.rooms
  add column mode text not null default 'free',
  add column turn_order text not null default 'random',
  add column turn_seconds integer not null default 20,
  add column turn_seq integer not null default 0,
  add column turn_player_id uuid,
  add column turn_deadline_at timestamptz;

alter table public.players
  add column turn_rank double precision not null default 0,
  add column kicked_at timestamptz;

alter table public.rooms
  add constraint rooms_mode_valid check (mode in ('free', 'turns')),
  add constraint rooms_turn_order_valid check (turn_order in ('random', 'arrival')),
  add constraint rooms_turn_seconds_valid check (turn_seconds between 5 and 120),
  add constraint rooms_turn_player_fk foreign key (turn_player_id) references public.players (id) on delete set null;

create index rooms_turn_player_id_idx on public.rooms (turn_player_id);

comment on column public.rooms.mode is 'free = everybody sends at once with a wait between attempts; turns = one player at a time (Mode A).';
comment on column public.rooms.turn_order is 'random = random rank assigned on entry (before the game starts); arrival = order of arrival. Late joiners go to the end.';
comment on column public.rooms.turn_seconds is 'Seconds a player has to answer in turn mode (5 to 120, default 20).';
comment on column public.rooms.turn_seq is 'Counts turn changes. Only moves forward.';
comment on column public.rooms.turn_player_id is 'Player who has the turn now (turn mode, game running). Null while nobody is eligible.';
comment on column public.rooms.turn_deadline_at is 'UTC instant when the current turn is skipped. Applied once by _turn_tick().';
comment on column public.players.turn_rank is 'Position in the turn queue (lower goes first). Assigned by the players_set_turn_rank trigger.';
comment on column public.players.kicked_at is 'Set when the admin kicks the player. The row stays (nickname reserved, attempts keep the hints table stable).';

-- Queue position: random() in [0,1) while the room is still waiting in random order; otherwise the end of the queue.
create function public.players_set_turn_rank()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order text;
  v_phase text;
begin
  select r.turn_order, r.phase into v_order, v_phase from public.rooms r where r.id = new.room_id;
  if v_order = 'random' and v_phase = 'waiting' then
    new.turn_rank := random();
  else
    new.turn_rank := coalesce((select max(p.turn_rank) from public.players p where p.room_id = new.room_id), 0) + 1;
  end if;
  return new;
end
$$;

revoke all on function public.players_set_turn_rank() from public, anon, authenticated;
grant execute on function public.players_set_turn_rank() to service_role;

-- Named after players_enforce_room_rules on purpose: triggers fire in name order, so this one runs after the room lock.
create trigger players_set_turn_rank
  before insert on public.players
  for each row execute function public.players_set_turn_rank();

-- Kicked players free their slot for the 100-player cap.
create or replace function public.players_enforce_room_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('players_room:' || new.room_id::text, 0));

  select status into v_status from public.rooms where id = new.room_id;
  if v_status is distinct from 'open' then
    raise exception 'room closed' using errcode = 'P0001', hint = 'ROOM_CLOSED';
  end if;

  select count(*) into v_count from public.players where room_id = new.room_id and kicked_at is null;
  if v_count >= 100 then
    raise exception 'room full' using errcode = '53400', hint = 'ROOM_FULL';
  end if;

  return new;
end
$$;

-- Hands the turn to the next player. The caller holds the room lock.
-- Order: connected players first (seen in the last 30 s), then the ones after the current player in queue order,
-- wrapping around. If everybody is away it still rotates among the non-kicked players so the game never stalls.
create function public._advance_turn(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room     public.rooms%rowtype;
  v_cur_rank double precision;
  v_next     uuid;
begin
  select * into v_room from public.rooms where id = p_room_id;
  if not found then
    return;
  end if;
  select p.turn_rank into v_cur_rank from public.players p where p.id = v_room.turn_player_id;

  select p.id into v_next
  from public.players p
  where p.room_id = p_room_id and p.kicked_at is null
  order by (p.last_seen_at >= clock_timestamp() - interval '30 seconds') desc,
           (v_cur_rank is not null and p.turn_rank > v_cur_rank) desc,
           p.turn_rank asc,
           p.id asc
  limit 1;

  update public.rooms
  set turn_player_id = v_next,
      turn_seq = turn_seq + 1,
      turn_deadline_at = case when v_next is null then null else clock_timestamp() + make_interval(secs => turn_seconds) end
  where id = p_room_id;
end
$$;

revoke all on function public._advance_turn(uuid) from public, anon, authenticated, service_role;

-- Applies what is due in turn mode: first turn, deadline passed, current player kicked, or away while somebody
-- else is connected. The caller holds the room lock, so each change happens once however many reads ask.
create function public._turn_tick(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
  v_gone boolean;
begin
  select * into v_room from public.rooms where id = p_room_id;
  if not found or v_room.status <> 'open' or v_room.finished_at is not null
     or v_room.phase <> 'playing' or v_room.mode <> 'turns' then
    return;
  end if;

  if v_room.turn_player_id is null then
    -- Nobody has the turn yet (game just started, or the last holder was kicked): only write if somebody can have it.
    if exists (select 1 from public.players p where p.room_id = p_room_id and p.kicked_at is null) then
      perform public._advance_turn(p_room_id);
    end if;
    return;
  end if;

  if v_room.turn_deadline_at <= clock_timestamp() then
    perform public._advance_turn(p_room_id);
    return;
  end if;

  select exists (
    select 1
    from public.players p
    where p.id = v_room.turn_player_id
      and (
        p.kicked_at is not null
        or (
          p.last_seen_at < clock_timestamp() - interval '30 seconds'
          and exists (
            select 1 from public.players q
            where q.room_id = p_room_id and q.id <> p.id and q.kicked_at is null
              and q.last_seen_at >= clock_timestamp() - interval '30 seconds'
          )
        )
      )
  ) into v_gone;
  if v_gone then
    perform public._advance_turn(p_room_id);
  end if;
end
$$;

revoke all on function public._turn_tick(uuid) from public, anon, authenticated, service_role;

-- Presence: a player who keeps the room open is "connected". At most one write per 10 s per player.
create function public.touch_player(p_room_id uuid, p_session_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.players
  set last_seen_at = clock_timestamp()
  where room_id = p_room_id and session_hash = p_session_hash
    and last_seen_at < clock_timestamp() - interval '10 seconds';
end
$$;

revoke all on function public.touch_player(uuid, text) from public, anon, authenticated;
grant execute on function public.touch_player(uuid, text) to service_role;

-- Applies every due timer of a room (start of the waiting room, turn changes) under the room lock, ONCE, and
-- returns the state with the database clock. No row when the room is unknown or closed.
drop function if exists public.apply_due_timers(uuid);

create function public.apply_due_timers(p_room_id uuid)
returns table (
  o_phase text,
  o_start_deadline_at timestamptz,
  o_server_now timestamptz,
  o_turn_nickname text,
  o_turn_deadline_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
begin
  select * into v_room from public.rooms r where r.id = p_room_id and r.status = 'open' for no key update;
  if not found then
    return;
  end if;

  if v_room.phase = 'waiting' and v_room.start_deadline_at <= clock_timestamp() then
    update public.rooms set phase = 'playing' where id = p_room_id;
    if v_room.mode = 'turns' then
      perform public._advance_turn(p_room_id);
    end if;
  end if;
  perform public._turn_tick(p_room_id);

  return query
    select r.phase,
           r.start_deadline_at,
           clock_timestamp(),
           case when r.mode = 'turns' and r.phase = 'playing' and r.finished_at is null then pl.nickname end,
           case when r.mode = 'turns' and r.phase = 'playing' and r.finished_at is null then r.turn_deadline_at end
    from public.rooms r
    left join public.players pl on pl.id = r.turn_player_id
    where r.id = p_room_id;
end
$$;

revoke all on function public.apply_due_timers(uuid) from public, anon, authenticated;
grant execute on function public.apply_due_timers(uuid) to service_role;

-- "Start now": in turn mode it also hands out the first turn.
create or replace function public.start_room(p_room_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room    public.rooms%rowtype;
  v_changed integer;
begin
  select * into v_room from public.rooms r where r.id = p_room_id and r.status = 'open' for no key update;
  if not found then
    return false;
  end if;
  update public.rooms set phase = 'playing' where id = p_room_id and phase = 'waiting';
  get diagnostics v_changed = row_count;
  if v_changed = 1 and v_room.mode = 'turns' then
    perform public._advance_turn(p_room_id);
  end if;
  return v_changed = 1;
end
$$;

-- Same function as before plus: kicked players are refused, and in turn mode only the player who has the turn
-- may send (the wait between attempts applies to free mode only). A winning attempt ends the round; any other
-- accepted attempt passes the turn on. Outcomes: ok, unknown_room, room_closed, round_finished, not_player, kicked,
-- not_started, not_your_turn, unknown_pokemon, cooldown.
create or replace function public.submit_attempt(p_room_id uuid, p_session_hash text, p_pokemon_id integer)
returns table (o_outcome text, o_result text, o_is_winner boolean, o_retry_after integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room      public.rooms%rowtype;
  v_secret    public.pokemon%rowtype;
  v_guess     public.pokemon%rowtype;
  v_player_id uuid;
  v_kicked    timestamptz;
  v_last      timestamptz;
  v_wait      integer;
  v_score     integer;
  v_result    text;
  v_winner    boolean;
begin
  select * into v_room from public.rooms where id = p_room_id for no key update;
  if not found then
    return query select 'unknown_room'::text, null::text, null::boolean, null::integer;
    return;
  end if;
  if v_room.status <> 'open' then
    return query select 'room_closed'::text, null::text, null::boolean, null::integer;
    return;
  end if;
  if v_room.finished_at is not null then
    return query select 'round_finished'::text, null::text, null::boolean, null::integer;
    return;
  end if;

  select p.id, p.kicked_at into v_player_id, v_kicked
  from public.players p
  where p.room_id = p_room_id and p.session_hash = p_session_hash;
  if not found then
    return query select 'not_player'::text, null::text, null::boolean, null::integer;
    return;
  end if;
  if v_kicked is not null then
    return query select 'kicked'::text, null::text, null::boolean, null::integer;
    return;
  end if;

  -- Sending something proves the player is here.
  update public.players set last_seen_at = clock_timestamp() where id = v_player_id;

  if v_room.phase = 'waiting' then
    if v_room.start_deadline_at <= clock_timestamp() then
      update public.rooms set phase = 'playing' where id = p_room_id;
      if v_room.mode = 'turns' then
        perform public._advance_turn(p_room_id);
      end if;
    else
      return query select 'not_started'::text, null::text, null::boolean, null::integer;
      return;
    end if;
  end if;

  if v_room.mode = 'turns' then
    perform public._turn_tick(p_room_id);
    select * into v_room from public.rooms where id = p_room_id;
    if v_room.turn_player_id is distinct from v_player_id then
      return query select 'not_your_turn'::text, null::text, null::boolean, null::integer;
      return;
    end if;
  end if;

  select * into v_guess from public.pokemon where id = p_pokemon_id;
  if not found then
    return query select 'unknown_pokemon'::text, null::text, null::boolean, null::integer;
    return;
  end if;

  if v_room.mode = 'free' then
    select max(a.created_at) into v_last from public.attempts a where a.player_id = v_player_id;
    if v_last is not null
       and v_last + make_interval(secs => v_room.attempt_cooldown_seconds) > clock_timestamp() then
      v_wait := ceil(extract(epoch from (v_last + make_interval(secs => v_room.attempt_cooldown_seconds) - clock_timestamp())))::integer;
      return query select 'cooldown'::text, null::text, null::boolean, greatest(v_wait, 1);
      return;
    end if;
  end if;

  select * into v_secret from public.pokemon where id = v_room.secret_pokemon_id;

  -- "Same type" = shares at least one type (BRIEF assumption).
  v_score := (v_guess.tipos_es && v_secret.tipos_es)::integer + (v_guess.generacion = v_secret.generacion)::integer;
  v_result := case v_score when 2 then 'fire' when 1 then 'warm' else 'cold' end;
  v_winner := v_guess.id = v_secret.id;

  insert into public.attempts (room_id, player_id, pokemon_id, result, is_winner, created_at)
  values (p_room_id, v_player_id, p_pokemon_id, v_result, v_winner, clock_timestamp());

  if v_winner then
    update public.rooms set finished_at = clock_timestamp() where id = p_room_id;
  elsif v_room.mode = 'turns' then
    perform public._advance_turn(p_room_id);
  end if;

  return query select 'ok'::text, v_result, v_winner, null::integer;
end
$$;

-- The admin kicks a player by nickname. The row stays (nickname stays reserved, the hints table does not change),
-- the player can no longer send, chat or re-enter from that device. In turn mode a kicked turn holder is skipped at once.
-- Outcomes: ok, not_found, room_closed.
create function public.kick_player(p_room_id uuid, p_nickname text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room      public.rooms%rowtype;
  v_player_id uuid;
begin
  select * into v_room from public.rooms r where r.id = p_room_id for no key update;
  if not found or v_room.status <> 'open' then
    return 'room_closed';
  end if;

  select p.id into v_player_id
  from public.players p
  where p.room_id = p_room_id and p.nickname_key = public.normalize_name(p_nickname) and p.kicked_at is null;
  if not found then
    return 'not_found';
  end if;

  update public.players set kicked_at = clock_timestamp() where id = v_player_id;
  if v_room.mode = 'turns' and v_room.phase = 'playing' and v_room.finished_at is null
     and v_room.turn_player_id = v_player_id then
    perform public._advance_turn(p_room_id);
  end if;
  return 'ok';
end
$$;

revoke all on function public.kick_player(uuid, text) from public, anon, authenticated;
grant execute on function public.kick_player(uuid, text) to service_role;

-- Chat: kicked players cannot write. Outcomes: ok, unknown_room, room_closed, not_player, kicked, invalid, rate_limited.
create or replace function public.post_chat_message(p_room_id uuid, p_session_hash text, p_body text)
returns table (o_outcome text, o_id bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status    text;
  v_player_id uuid;
  v_kicked    timestamptz;
  v_id        bigint;
begin
  select r.status into v_status from public.rooms r where r.id = p_room_id for share;
  if not found then
    return query select 'unknown_room'::text, null::bigint;
    return;
  end if;
  if v_status <> 'open' then
    return query select 'room_closed'::text, null::bigint;
    return;
  end if;

  select p.id, p.kicked_at into v_player_id, v_kicked
  from public.players p where p.room_id = p_room_id and p.session_hash = p_session_hash;
  if not found then
    return query select 'not_player'::text, null::bigint;
    return;
  end if;
  if v_kicked is not null then
    return query select 'kicked'::text, null::bigint;
    return;
  end if;

  if p_body is null or char_length(p_body) not between 1 and 200 or p_body ~ '[[:cntrl:]]' then
    return query select 'invalid'::text, null::bigint;
    return;
  end if;

  if (select count(*) from public.chat_messages c
      where c.player_id = v_player_id and c.created_at > clock_timestamp() - interval '1 minute') >= 10 then
    return query select 'rate_limited'::text, null::bigint;
    return;
  end if;

  insert into public.chat_messages (room_id, player_id, body, created_at)
  values (p_room_id, v_player_id, p_body, clock_timestamp())
  returning id into v_id;
  return query select 'ok'::text, v_id;
end
$$;

commit;
