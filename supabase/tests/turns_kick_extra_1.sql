-- Steps 11+12, extra verification 1 of 5: one player and kicking the only player.
-- Run it AFTER the migration 20261108120000_turns_presence_kick.sql. Paste the WHOLE file and run it once.
-- It ends with an intentional error that rolls everything back (it leaves nothing in the database).
-- The last lines of the error read "TOTAL <n> / FAILS 0" when everything is fine; otherwise they list what failed.
-- If the editor asks about Row Level Security, choose to run WITHOUT it (the script creates no real tables).
create or replace function pg_temp.ck(g int, ok boolean, nm text, got text)
returns void language plpgsql as $f$
begin
  perform set_config('sim.total', (coalesce(nullif(current_setting('sim.total', true), ''), '0')::int + 1)::text, true);
  if ok is not true then
    perform set_config('sim.fails', (coalesce(nullif(current_setting('sim.fails', true), ''), '0')::int + 1)::text, true);
  end if;
  if ok is not true or g = 0 then
    perform set_config('sim.rep', coalesce(current_setting('sim.rep', true), '') || E'\n' || g || (case when ok then ' PASS ' else ' FAIL ' end) || nm || ' [' || coalesce(got, '') || ']', true);
  end if;
end
$f$;
create or replace function pg_temp.hsh(tag text, i int) returns text language sql as $f$ select md5(tag || i) || md5(i || tag) $f$;
create or replace function pg_temp.cur(r uuid) returns text language sql as $f$ select o_turn_nickname from public.apply_due_timers(r) $f$;
create or replace function pg_temp.snd(r uuid, h text, p int) returns text language sql as $f$ select o_outcome from public.submit_attempt(r, h, p) $f$;
create or replace function pg_temp.sq(r uuid) returns int language sql as $f$ select turn_seq from public.rooms where id = r $f$;
create or replace function pg_temp.late(r uuid) returns void language sql as $f$ update public.rooms set turn_deadline_at = clock_timestamp() - interval '2 hours' where id = r $f$;
create or replace function pg_temp.away(r uuid, nm text) returns void language sql as $f$ update public.players set last_seen_at = clock_timestamp() - interval '60 seconds' where room_id = r and nickname = nm $f$;
create or replace function pg_temp.add(r uuid, nm text, h text) returns void language sql as $f$ insert into public.players (room_id, nickname, session_hash) values (r, nm, h) $f$;

do $do$
declare
  rid uuid; secret int := 1; wrong int := 4;
  nicks text[] := array['Ana','Beto','Cami','Dani'];
  t text; n int; i int; b boolean; holder text; seq0 int; seq1 int; bad int; ord text; rk double precision;
  ts1 timestamptz; ts2 timestamptz;
begin

  -- ===== S1: turn mode with a single player
  rid := gen_random_uuid();
  insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, mode, turn_order, turn_seconds)
    values (rid, 'TNBAAA', md5('TNBAAAa') || md5('TNBAAAb'), secret, 'turns', 'arrival', 20);
  perform pg_temp.add(rid, 'Solo', pg_temp.hsh('s1', 1));
  holder := pg_temp.cur(rid);
  perform pg_temp.ck(1, holder = 'Solo', 'S1 the only player gets the first turn', holder);
  t := pg_temp.snd(rid, pg_temp.hsh('s1', 1), wrong);
  perform pg_temp.ck(1, t = 'ok', 'S1 he sends', t);
  seq0 := pg_temp.sq(rid);
  holder := pg_temp.cur(rid);
  ts1 := (select turn_deadline_at from public.rooms where id = rid);
  perform pg_temp.ck(1, holder = 'Solo' and seq0 = 2 and ts1 > clock_timestamp() + interval '15 seconds', 'S1 after sending the turn comes back to him at once, fresh deadline', coalesce(holder, '-') || '/' || seq0);
  t := pg_temp.snd(rid, pg_temp.hsh('s1', 1), wrong);
  perform pg_temp.ck(1, t = 'ok', 'S1 he can send again at once (no wait between attempts in turns)', t);
  perform pg_temp.late(rid);
  seq0 := pg_temp.sq(rid); holder := pg_temp.cur(rid); seq1 := pg_temp.sq(rid);
  perform pg_temp.ck(1, holder = 'Solo' and seq1 = seq0 + 1, 'S1 an expired turn passes to himself, once', coalesce(holder, '-') || '/' || seq0 || '/' || seq1);
  perform pg_temp.away(rid, 'Solo');
  seq0 := pg_temp.sq(rid); holder := pg_temp.cur(rid); holder := pg_temp.cur(rid); seq1 := pg_temp.sq(rid);
  perform pg_temp.ck(1, holder = 'Solo' and seq1 = seq0, 'S1 alone and away: he keeps the turn, reads do not write', coalesce(holder, '-') || '/' || seq0 || '/' || seq1);
  t := pg_temp.snd(rid, pg_temp.hsh('s1', 1), wrong);
  b := (select last_seen_at > clock_timestamp() - interval '5 seconds' from public.players where room_id = rid);
  perform pg_temp.ck(1, t = 'ok' and b, 'S1 an away player can send, and sending refreshes his presence', t);
  n := (select count(*) from public.submit_attempt(rid, pg_temp.hsh('s1', 1), secret) where o_is_winner);
  perform pg_temp.ck(1, n = 1, 'S1 the lone player wins with the secret', n::text);
  t := pg_temp.snd(rid, pg_temp.hsh('s1', 1), wrong);
  perform pg_temp.ck(1, t = 'round_finished', 'S1 then the round is finished', t);

  -- ===== S2: kick the only player, then somebody else enters
  rid := gen_random_uuid();
  insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, mode, turn_order, turn_seconds)
    values (rid, 'TNBAAB', md5('TNBAABa') || md5('TNBAABb'), secret, 'turns', 'arrival', 20);
  perform pg_temp.add(rid, 'Uno', pg_temp.hsh('s2', 1));
  holder := pg_temp.cur(rid);
  t := (select public.kick_player(rid, 'Uno'));
  perform pg_temp.ck(2, t = 'ok' and holder = 'Uno', 'S2 Uno had the turn and is kicked', t);
  b := (select turn_player_id is null and turn_deadline_at is null from public.rooms where id = rid);
  perform pg_temp.ck(2, b, 'S2 nobody holds the turn and there is no deadline', b::text);
  n := (select count(*) from public.apply_due_timers(rid) where o_phase = 'playing' and o_turn_nickname is null and o_turn_deadline_at is null);
  seq0 := pg_temp.sq(rid); holder := pg_temp.cur(rid); holder := pg_temp.cur(rid); seq1 := pg_temp.sq(rid);
  perform pg_temp.ck(2, n = 1 and seq0 = seq1 and (select status from public.rooms where id = rid) = 'open', 'S2 the room stays open, reports no turn, reads do not write', n || '/' || seq0 || '/' || seq1);
  perform pg_temp.add(rid, 'Dos', pg_temp.hsh('s2', 2));
  holder := pg_temp.cur(rid);
  ts1 := (select turn_deadline_at from public.rooms where id = rid);
  perform pg_temp.ck(2, holder = 'Dos' and ts1 > clock_timestamp() + interval '15 seconds', 'S2 a new player gets the turn on the very next read', coalesce(holder, '-'));
  t := (select public.kick_player(rid, 'Dos'));
  perform pg_temp.add(rid, 'Tres', pg_temp.hsh('s2', 3));
  t := pg_temp.snd(rid, pg_temp.hsh('s2', 3), wrong);
  perform pg_temp.ck(2, t = 'ok', 'S2 Tres sends without any read first (submit hands him the turn)', t);
  t := pg_temp.snd(rid, pg_temp.hsh('s2', 1), wrong) || '/' || pg_temp.snd(rid, pg_temp.hsh('s2', 2), wrong);
  perform pg_temp.ck(2, t = 'kicked/kicked', 'S2 both kicked players stay out', t);
  begin
    perform pg_temp.add(rid, 'uno', pg_temp.hsh('s2', 9));
    perform pg_temp.ck(2, false, 'S2 the nickname Uno stays reserved', 'accepted');
  exception when unique_violation then
    perform pg_temp.ck(2, true, 'S2 the nickname Uno stays reserved', '23505');
  end;
  n := (select count(*) from public.players where room_id = rid and kicked_at is null);
  perform pg_temp.ck(2, n = 1, 'S2 only Tres counts as a player now', n::text);

  raise exception E'RESULT extra part %: TOTAL % / FAILS %\n%', 1, coalesce(current_setting('sim.total', true), '0'), coalesce(nullif(current_setting('sim.fails', true), ''), '0'), coalesce(current_setting('sim.rep', true), '');
end
$do$;
