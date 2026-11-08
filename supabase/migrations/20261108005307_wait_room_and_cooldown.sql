-- Steps 9+10: admin-defined wait between attempts (free mode) and the waiting room with a start timer.
-- Expand-only for data: three columns with defaults that keep today's behavior (existing rooms stay "playing"
-- with a 1 second wait), four new functions, and submit_attempt() replaced (one extra output column and the
-- new outcome "not_started"). Also removes two unused helper functions that were applied by hand (see the end).
--
-- ROLLBACK (documented, run manually if needed; it forgets the wait settings of every room):
--   begin;
--   drop function if exists public.set_attempt_cooldown(uuid, integer);
--   drop function if exists public.start_room(uuid);
--   drop function if exists public.apply_due_timers(uuid);
--   drop function if exists public.submit_attempt(uuid, text, integer);
--   -- then re-run the submit_attempt() definition from 20261106004125_create_attempts.sql (with its revoke/grant)
--   alter table public.rooms drop constraint if exists rooms_waiting_has_deadline;
--   alter table public.rooms drop constraint if exists rooms_phase_valid;
--   alter table public.rooms drop constraint if exists rooms_attempt_cooldown_valid;
--   alter table public.rooms drop column if exists start_deadline_at;
--   alter table public.rooms drop column if exists phase;
--   alter table public.rooms drop column if exists attempt_cooldown_seconds;
--   commit;
-- (The two removed helpers can be restored from 20261106210000_create_clue_functions.sql; nothing used them.)

alter table public.rooms
  add column attempt_cooldown_seconds integer not null default 1,
  add column phase text not null default 'playing',
  add column start_deadline_at timestamptz;

alter table public.rooms
  add constraint rooms_attempt_cooldown_valid check (attempt_cooldown_seconds between 1 and 120),
  add constraint rooms_phase_valid check (phase in ('waiting', 'playing')),
  add constraint rooms_waiting_has_deadline check (phase = 'playing' or start_deadline_at is not null);

comment on column public.rooms.attempt_cooldown_seconds is
  'Seconds a player must wait between two attempts (free mode). Chosen by the admin; read by submit_attempt().';
comment on column public.rooms.phase is
  'waiting = lobby before the game starts (no attempts yet); playing = attempts accepted. Separate from status (open/closed).';
comment on column public.rooms.start_deadline_at is
  'UTC instant when a waiting room starts by itself. Applied once, by apply_due_timers() or submit_attempt(). Null for rooms created without a lobby.';

-- Records one attempt, computes its hint and decides the winner, all in one transaction.
-- Same rules as before, plus: the room must have started, and the wait between attempts comes from the room.
-- Outcomes: ok, unknown_room, room_closed, round_finished, not_player, not_started, unknown_pokemon, cooldown.
-- o_retry_after: seconds left to wait (only with "cooldown").
drop function if exists public.submit_attempt(uuid, text, integer);

create function public.submit_attempt(p_room_id uuid, p_session_hash text, p_pokemon_id integer)
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
  v_last      timestamptz;
  v_wait      integer;
  v_score     integer;
  v_result    text;
  v_winner    boolean;
begin
  -- Locks the room row: attempts to the same room run one at a time, so "first correct answer wins" is exact.
  -- NO KEY UPDATE does not block players joining (their foreign key check only needs KEY SHARE).
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

  select p.id into v_player_id
  from public.players p
  where p.room_id = p_room_id and p.session_hash = p_session_hash;
  if not found then
    return query select 'not_player'::text, null::text, null::boolean, null::integer;
    return;
  end if;

  -- Waiting room: a due start timer is applied here too (we already hold the room lock), so the first
  -- attempt after the deadline is never refused.
  if v_room.phase = 'waiting' then
    if v_room.start_deadline_at <= clock_timestamp() then
      update public.rooms set phase = 'playing' where id = p_room_id;
    else
      return query select 'not_started'::text, null::text, null::boolean, null::integer;
      return;
    end if;
  end if;

  select * into v_guess from public.pokemon where id = p_pokemon_id;
  if not found then
    return query select 'unknown_pokemon'::text, null::text, null::boolean, null::integer;
    return;
  end if;

  -- Wait between attempts, per player, defined by the admin (1 to 120 s).
  select max(a.created_at) into v_last from public.attempts a where a.player_id = v_player_id;
  if v_last is not null
     and v_last + make_interval(secs => v_room.attempt_cooldown_seconds) > clock_timestamp() then
    v_wait := ceil(extract(epoch from (v_last + make_interval(secs => v_room.attempt_cooldown_seconds) - clock_timestamp())))::integer;
    return query select 'cooldown'::text, null::text, null::boolean, greatest(v_wait, 1);
    return;
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
  end if;

  return query select 'ok'::text, v_result, v_winner, null::integer;
end
$$;

revoke all on function public.submit_attempt(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.submit_attempt(uuid, text, integer) to service_role;

-- Applies the start timer of a room ONCE: a single UPDATE guarded by "still waiting and due", so if 100 feed
-- reads ask at the same time only one changes the phase. Returns the room state and the database clock
-- (the countdown on the phones uses this clock, not the phone's). No row when the room is unknown or closed.
create function public.apply_due_timers(p_room_id uuid)
returns table (o_phase text, o_start_deadline_at timestamptz, o_server_now timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.rooms
  set phase = 'playing'
  where id = p_room_id and status = 'open' and phase = 'waiting' and start_deadline_at <= clock_timestamp();

  return query
    select r.phase, r.start_deadline_at, clock_timestamp()
    from public.rooms r
    where r.id = p_room_id and r.status = 'open';
end
$$;

revoke all on function public.apply_due_timers(uuid) from public, anon, authenticated;
grant execute on function public.apply_due_timers(uuid) to service_role;

-- "Start now" from the admin. True only if this call changed the room from waiting to playing.
create function public.start_room(p_room_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed integer;
begin
  update public.rooms set phase = 'playing' where id = p_room_id and status = 'open' and phase = 'waiting';
  get diagnostics v_changed = row_count;
  return v_changed = 1;
end
$$;

revoke all on function public.start_room(uuid) from public, anon, authenticated;
grant execute on function public.start_room(uuid) to service_role;

-- The admin changes the wait between attempts. True if an open room was updated.
-- Out-of-range values are refused by the table constraint (SQLSTATE 23514).
create function public.set_attempt_cooldown(p_room_id uuid, p_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed integer;
begin
  update public.rooms set attempt_cooldown_seconds = p_seconds where id = p_room_id and status = 'open';
  get diagnostics v_changed = row_count;
  return v_changed = 1;
end
$$;

revoke all on function public.set_attempt_cooldown(uuid, integer) from public, anon, authenticated;
grant execute on function public.set_attempt_cooldown(uuid, integer) to service_role;

-- Cleanup: list_clues() and find_previous_attempt() were applied by hand on 2026-11-07 (migration
-- 20261107033549_create_clue_functions). Nothing in the app calls them, nothing depends on them, and
-- was_tried() / list_hints() already do the same job.
drop function if exists public.list_clues(uuid, integer);
drop function if exists public.find_previous_attempt(uuid, integer);
