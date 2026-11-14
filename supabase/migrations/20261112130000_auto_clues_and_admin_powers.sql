-- Phase 3, block 1: automatic clues and admin powers (pause, skip turn, mute, change secret and restart).
-- APPLY: paste this whole file in the Supabase SQL Editor (project de pruebas) and run it once. It is wrapped in
-- begin/commit, so it either applies completely or not at all. Verify afterwards with supabase/tests/clues_powers_simulation_1.sql and _2.sql.
-- Expand-only for data: new columns with defaults, one new table (room_clues), new functions, and four functions replaced
-- (apply_due_timers: extra output column; submit_attempt: new outcome 'paused'; post_chat_message: new outcome 'muted';
-- close_room: also erases the clues). The phase constraint now also accepts 'paused'.
--
-- ROLLBACK (documented, run manually if needed; it forgets clues, pauses and mutes of every room):
--   update public.rooms set phase = 'playing', paused_at = null where phase = 'paused';
--   drop function if exists public.reset_room(uuid, integer);
--   drop function if exists public.set_clue_settings(uuid, integer, integer);
--   drop function if exists public.set_player_muted(uuid, text, boolean);
--   drop function if exists public.skip_turn(uuid);
--   drop function if exists public.resume_room(uuid);
--   drop function if exists public.pause_room(uuid);
--   drop function if exists public.apply_due_timers(uuid);
--   drop function if exists public._clue_tick(uuid);
--   drop function if exists public._reveal_clue(uuid);
--   drop table if exists public.room_clues;
--   alter table public.rooms drop constraint if exists rooms_phase_valid;
--   alter table public.rooms add constraint rooms_phase_valid check (phase in ('waiting', 'playing'));
--   alter table public.rooms drop constraint if exists rooms_waiting_has_deadline;
--   alter table public.rooms add constraint rooms_waiting_has_deadline check (phase = 'playing' or start_deadline_at is not null);
--   alter table public.rooms drop column if exists round_no, drop column if exists paused_at, drop column if exists next_clue_at, drop column if exists clues_revealed,
--     drop column if exists clue_max, drop column if exists clue_interval_seconds;
--   alter table public.players drop column if exists muted_at;
--   -- then re-run from 20261108120000_turns_presence_kick.sql: apply_due_timers(), submit_attempt() and post_chat_message();
--   -- and from 20261107190000_close_room_erases_chat.sql: close_room()
--   begin;

alter table public.rooms
  add column clue_interval_seconds integer not null default 60,
  add column clue_max integer not null default 2,
  add column clues_revealed integer not null default 0,
  add column next_clue_at timestamptz,
  add column paused_at timestamptz,
  add column round_no integer not null default 1;

alter table public.rooms
  add constraint rooms_clue_interval_valid check (clue_interval_seconds between 15 and 300),
  add constraint rooms_clue_max_valid check (clue_max between 0 and 5),
  add constraint rooms_clues_revealed_valid check (clues_revealed between 0 and 5);

alter table public.rooms drop constraint rooms_phase_valid;
alter table public.rooms add constraint rooms_phase_valid check (phase in ('waiting', 'playing', 'paused'));
-- Only a waiting room needs a start deadline (the old rule said "anything but playing", which would refuse 'paused').
alter table public.rooms drop constraint rooms_waiting_has_deadline;
alter table public.rooms add constraint rooms_waiting_has_deadline check (phase <> 'waiting' or start_deadline_at is not null);

alter table public.players add column muted_at timestamptz;

comment on column public.rooms.clue_interval_seconds is 'Seconds between automatic clues (15 to 300, default 60).';
comment on column public.rooms.clue_max is 'Most automatic clues the room reveals (0 to 5, default 2). 0 = off.';
comment on column public.rooms.clues_revealed is 'How many clues are in room_clues for this room.';
comment on column public.rooms.next_clue_at is 'UTC instant of the next clue. Null = not armed yet (armed by the next tick); infinity = nothing left to reveal.';
comment on column public.rooms.paused_at is 'Set while phase = paused. On resume every running deadline moves forward by the paused time.';
comment on column public.rooms.round_no is 'Starts at 1 and grows by one on every reset_room(). Phones that see a new number clear their screen.';
comment on column public.players.muted_at is 'Set when the admin mutes the player: the player keeps playing but cannot write in the chat.';

-- Clues already revealed in a room. Only the admin-configured automatic clues; never read directly by anybody.
create table public.room_clues (
  room_id uuid not null references public.rooms (id) on delete cascade,
  seq integer not null,
  kind text not null,
  value text not null,
  created_at timestamptz not null default now(),
  primary key (room_id, seq),
  constraint room_clues_kind_valid check (kind in ('type', 'generation')),
  constraint room_clues_seq_valid check (seq between 1 and 5)
);
alter table public.room_clues enable row level security;
revoke all on table public.room_clues from public, anon, authenticated, service_role;

-- Reveals the next clue of a room. The caller holds the room lock. Returns false when there is nothing left to reveal.
-- Rules: the first clue looks at the warm attempts: if they mostly matched by generation the clue is a type, if they
-- mostly matched by type (or there is no data, or a tie) it is the generation. Then it reveals the characteristic
-- not shown yet, and finally the second type of a dual-type secret. One type per clue, picked at random.
create function public._reveal_clue(p_room_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room      public.rooms%rowtype;
  v_secret    public.pokemon%rowtype;
  v_count     integer;
  v_has_type  boolean;
  v_has_gen   boolean;
  v_shown     text[];
  v_by_gen    integer;
  v_by_type   integer;
  v_kind      text;
  v_value     text;
begin
  select * into v_room from public.rooms where id = p_room_id;
  select * into v_secret from public.pokemon where id = v_room.secret_pokemon_id;

  select count(*), coalesce(bool_or(c.kind = 'type'), false), coalesce(bool_or(c.kind = 'generation'), false),
         coalesce(array_agg(c.value) filter (where c.kind = 'type'), array[]::text[])
    into v_count, v_has_type, v_has_gen, v_shown
  from public.room_clues c where c.room_id = p_room_id;

  if v_count = 0 then
    select count(*) filter (where p.generacion = v_secret.generacion),
           count(*) filter (where p.generacion <> v_secret.generacion)
      into v_by_gen, v_by_type
    from public.attempts a join public.pokemon p on p.id = a.pokemon_id
    where a.room_id = p_room_id and a.result = 'warm';
    v_kind := case when v_by_gen > v_by_type then 'type' else 'generation' end;
  elsif not v_has_type then
    v_kind := 'type';
  elsif not v_has_gen then
    v_kind := 'generation';
  else
    v_kind := 'type'; -- the second type of a dual-type secret, if any
  end if;

  if v_kind = 'type' then
    select t into v_value from unnest(v_secret.tipos_es) t where t <> all (v_shown) order by random() limit 1;
    if v_value is null then
      return false;
    end if;
  else
    v_value := v_secret.generacion::text;
  end if;

  insert into public.room_clues (room_id, seq, kind, value) values (p_room_id, v_count + 1, v_kind, v_value);
  update public.rooms
  set clues_revealed = v_count + 1,
      next_clue_at = case when v_count + 1 < clue_max then clock_timestamp() + make_interval(secs => clue_interval_seconds) else null end
  where id = p_room_id;
  return true;
end
$$;

revoke all on function public._reveal_clue(uuid) from public, anon, authenticated, service_role;

-- Applies the clue timer of a room. The caller holds the room lock, so the clue is revealed once however many reads ask.
create function public._clue_tick(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
begin
  select * into v_room from public.rooms where id = p_room_id;
  if not found or v_room.status <> 'open' or v_room.finished_at is not null or v_room.phase <> 'playing'
     or v_room.clue_max = 0 or v_room.clues_revealed >= v_room.clue_max then
    return;
  end if;

  if v_room.next_clue_at is null then
    update public.rooms set next_clue_at = clock_timestamp() + make_interval(secs => clue_interval_seconds) where id = p_room_id;
    return;
  end if;

  if v_room.next_clue_at <= clock_timestamp() then
    if not public._reveal_clue(p_room_id) then
      update public.rooms set next_clue_at = 'infinity' where id = p_room_id; -- nothing left: stop writing on every read
    end if;
  end if;
end
$$;

revoke all on function public._clue_tick(uuid) from public, anon, authenticated, service_role;

-- Same as before plus the clue timer and the revealed clues. While the room is paused no turn and no clue moves.
drop function if exists public.apply_due_timers(uuid);

create function public.apply_due_timers(p_room_id uuid)
returns table (
  o_phase text,
  o_start_deadline_at timestamptz,
  o_server_now timestamptz,
  o_turn_nickname text,
  o_turn_deadline_at timestamptz,
  o_clues jsonb
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
  perform public._clue_tick(p_room_id);

  return query
    select r.phase,
           r.start_deadline_at,
           clock_timestamp(),
           case when r.mode = 'turns' and r.phase = 'playing' and r.finished_at is null then pl.nickname end,
           case when r.mode = 'turns' and r.phase = 'playing' and r.finished_at is null then r.turn_deadline_at end,
           coalesce((select jsonb_agg(jsonb_build_object('kind', c.kind, 'value', c.value) order by c.seq)
                     from public.room_clues c where c.room_id = r.id), '[]'::jsonb)
    from public.rooms r
    left join public.players pl on pl.id = r.turn_player_id
    where r.id = p_room_id;
end
$$;

revoke all on function public.apply_due_timers(uuid) from public, anon, authenticated;
grant execute on function public.apply_due_timers(uuid) to service_role;

-- Pause: stops attempts, turns and clues (chat keeps working). Outcomes: ok, room_closed, not_playing, already_paused.
create function public.pause_room(p_room_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
begin
  select * into v_room from public.rooms r where r.id = p_room_id for no key update;
  if not found or v_room.status <> 'open' then
    return 'room_closed';
  end if;
  if v_room.phase = 'paused' then
    return 'already_paused';
  end if;
  if v_room.phase <> 'playing' or v_room.finished_at is not null then
    return 'not_playing';
  end if;
  update public.rooms set phase = 'paused', paused_at = clock_timestamp() where id = p_room_id;
  return 'ok';
end
$$;

-- Resume: the running turn and the next clue get back the time they had left (their deadlines move forward by the paused time).
-- Outcomes: ok, room_closed, not_paused.
create function public.resume_room(p_room_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
begin
  select * into v_room from public.rooms r where r.id = p_room_id for no key update;
  if not found or v_room.status <> 'open' then
    return 'room_closed';
  end if;
  if v_room.phase <> 'paused' then
    return 'not_paused';
  end if;
  update public.rooms
  set phase = 'playing',
      paused_at = null,
      turn_deadline_at = turn_deadline_at + (clock_timestamp() - v_room.paused_at),
      next_clue_at = next_clue_at + (clock_timestamp() - v_room.paused_at)
  where id = p_room_id;
  return 'ok';
end
$$;

-- Skip the turn now (turn mode, game running). Outcomes: ok, room_closed, not_available.
create function public.skip_turn(p_room_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
begin
  select * into v_room from public.rooms r where r.id = p_room_id for no key update;
  if not found or v_room.status <> 'open' then
    return 'room_closed';
  end if;
  if v_room.mode <> 'turns' or v_room.phase <> 'playing' or v_room.finished_at is not null then
    return 'not_available';
  end if;
  perform public._advance_turn(p_room_id);
  return 'ok';
end
$$;

-- Mute or unmute a player by nickname. A muted player keeps playing but cannot chat. Outcomes: ok, not_found, room_closed.
create function public.set_player_muted(p_room_id uuid, p_nickname text, p_muted boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status    text;
  v_player_id uuid;
begin
  select r.status into v_status from public.rooms r where r.id = p_room_id for share;
  if not found or v_status <> 'open' then
    return 'room_closed';
  end if;
  select p.id into v_player_id
  from public.players p
  where p.room_id = p_room_id and p.nickname_key = public.normalize_name(p_nickname) and p.kicked_at is null;
  if not found then
    return 'not_found';
  end if;
  update public.players
  set muted_at = case when p_muted then coalesce(muted_at, clock_timestamp()) else null end
  where id = v_player_id;
  return 'ok';
end
$$;

-- Change the clue settings of an open room. Out-of-range values are refused by the table constraints (SQLSTATE 23514).
-- The timer is re-armed by the next tick. Returns false when the room is unknown or closed.
create function public.set_clue_settings(p_room_id uuid, p_interval_seconds integer, p_max integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed integer;
begin
  update public.rooms
  set clue_interval_seconds = p_interval_seconds, clue_max = p_max, next_clue_at = null
  where id = p_room_id and status = 'open';
  get diagnostics v_changed = row_count;
  return v_changed = 1;
end
$$;

-- Change the secret and restart: erases attempts, chat and clues, keeps the players (and their queue, mutes and kicks),
-- and leaves the room playing (a room still in the waiting room stays waiting). Outcomes: ok, room_closed, unknown_pokemon.
create function public.reset_room(p_room_id uuid, p_pokemon_id integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room  public.rooms%rowtype;
  v_phase text;
begin
  perform pg_advisory_xact_lock(hashtextextended('players_room:' || p_room_id::text, 0));
  select * into v_room from public.rooms r where r.id = p_room_id for no key update;
  if not found or v_room.status <> 'open' then
    return 'room_closed';
  end if;
  if not exists (select 1 from public.pokemon where id = p_pokemon_id) then
    return 'unknown_pokemon';
  end if;

  delete from public.chat_messages where room_id = p_room_id;
  delete from public.attempts where room_id = p_room_id;
  delete from public.room_clues where room_id = p_room_id;

  v_phase := case when v_room.phase = 'waiting' then 'waiting' else 'playing' end;
  update public.rooms
  set secret_pokemon_id = p_pokemon_id,
      finished_at = null,
      phase = v_phase,
      paused_at = null,
      clues_revealed = 0,
      next_clue_at = null,
      round_no = round_no + 1,
      turn_player_id = null,
      turn_deadline_at = null,
      turn_seq = turn_seq + 1
  where id = p_room_id;
  if v_room.mode = 'turns' and v_phase = 'playing' then
    perform public._advance_turn(p_room_id);
  end if;
  return 'ok';
end
$$;

-- Chat: muted players cannot write. Outcomes: ok, unknown_room, room_closed, not_player, kicked, muted, invalid, rate_limited.
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
  v_muted     timestamptz;
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

  select p.id, p.kicked_at, p.muted_at into v_player_id, v_kicked, v_muted
  from public.players p where p.room_id = p_room_id and p.session_hash = p_session_hash;
  if not found then
    return query select 'not_player'::text, null::bigint;
    return;
  end if;
  if v_kicked is not null then
    return query select 'kicked'::text, null::bigint;
    return;
  end if;
  if v_muted is not null then
    return query select 'muted'::text, null::bigint;
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

-- Same function as before plus the outcome 'paused' (after kicked, before the lobby check). Outcomes: ok, unknown_room,
-- room_closed, round_finished, not_player, kicked, paused, not_started, not_your_turn, unknown_pokemon, cooldown.
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

  if v_room.phase = 'paused' then
    return query select 'paused'::text, null::text, null::boolean, null::integer;
    return;
  end if;

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

-- Closing a room also erases its clues.
create or replace function public.close_room(p_room_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  perform pg_advisory_xact_lock(hashtextextended('players_room:' || p_room_id::text, 0));
  select r.status into v_status from public.rooms r where r.id = p_room_id for no key update;
  if not found or v_status <> 'open' then
    return false;
  end if;

  delete from public.chat_messages where room_id = p_room_id;
  delete from public.attempts where room_id = p_room_id;
  delete from public.room_clues where room_id = p_room_id;
  delete from public.players where room_id = p_room_id;
  update public.rooms set status = 'closed', closed_at = clock_timestamp() where id = p_room_id;
  return true;
end
$$;

revoke all on function public.pause_room(uuid) from public, anon, authenticated;
revoke all on function public.resume_room(uuid) from public, anon, authenticated;
revoke all on function public.skip_turn(uuid) from public, anon, authenticated;
revoke all on function public.set_player_muted(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.set_clue_settings(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.reset_room(uuid, integer) from public, anon, authenticated;
grant execute on function public.pause_room(uuid) to service_role;
grant execute on function public.resume_room(uuid) to service_role;
grant execute on function public.skip_turn(uuid) to service_role;
grant execute on function public.set_player_muted(uuid, text, boolean) to service_role;
grant execute on function public.set_clue_settings(uuid, integer, integer) to service_role;
grant execute on function public.reset_room(uuid, integer) to service_role;

commit;
