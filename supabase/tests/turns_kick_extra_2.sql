-- Steps 11+12, extra verification 2 of 5: empty room that starts, kicks along the queue.
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

  -- ===== S3: the game starts with 0 players
  rid := gen_random_uuid();
  insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, mode, turn_order, phase, start_deadline_at)
    values (rid, 'TNBAAC', md5('TNBAACa') || md5('TNBAACb'), secret, 'turns', 'random', 'waiting', now() - interval '1 second');
  t := (select o_phase || ':' || coalesce(o_turn_nickname, '-') from public.apply_due_timers(rid));
  perform pg_temp.ck(3, t = 'playing:-', 'S3 a due lobby with 0 players starts the game, nobody has the turn', t);
  perform pg_temp.ck(3, (select status from public.rooms where id = rid) = 'open', 'S3 the room is NOT closed', '');
  perform pg_temp.add(rid, 'Ana', pg_temp.hsh('s3', 1));
  perform pg_temp.add(rid, 'Beto', pg_temp.hsh('s3', 2));
  b := (select min(turn_rank) >= 1 from public.players where room_id = rid);
  perform pg_temp.ck(3, b, 'S3 players who enter after the start queue by arrival, not at random', b::text);
  holder := pg_temp.cur(rid);
  t := pg_temp.snd(rid, pg_temp.hsh('s3', 2), wrong) || '/' || pg_temp.snd(rid, pg_temp.hsh('s3', 1), wrong);
  perform pg_temp.ck(3, holder = 'Ana' and t = 'not_your_turn/ok', 'S3 Ana first, Beto refused, Ana accepted', coalesce(holder, '-') || ' ' || t);
  rid := gen_random_uuid();
  insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, mode, turn_order, phase, start_deadline_at)
    values (rid, 'TNBAAD', md5('TNBAADa') || md5('TNBAADb'), secret, 'turns', 'arrival', 'waiting', now() + interval '5 minutes');
  b := (select public.start_room(rid));
  perform pg_temp.ck(3, b and pg_temp.cur(rid) is null, 'S3 start-now with 0 players: playing, no turn', b::text);
  b := (select public.start_room(rid));
  perform pg_temp.ck(3, not b, 'S3 a second start-now changes nothing', b::text);
  perform pg_temp.add(rid, 'Cami', pg_temp.hsh('s3', 3));
  t := pg_temp.snd(rid, pg_temp.hsh('s3', 3), wrong);
  perform pg_temp.ck(3, t = 'ok', 'S3 the first player to enter sends at once', t);
  rid := gen_random_uuid();
  insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, attempt_cooldown_seconds, phase, start_deadline_at)
    values (rid, 'TNBAAE', md5('TNBAAEa') || md5('TNBAAEb'), secret, 3, 'waiting', now() - interval '1 second');
  t := (select o_phase from public.apply_due_timers(rid));
  perform pg_temp.ck(3, t = 'playing' and pg_temp.sq(rid) = 0 and (select turn_player_id is null from public.rooms where id = rid), 'S3 free mode, due lobby, 0 players: starts and never touches the turn fields', t);

  -- ===== S4: kicks in different places of the queue
  rid := gen_random_uuid();
  insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, mode, turn_order, turn_seconds)
    values (rid, 'TNBAAF', md5('TNBAAFa') || md5('TNBAAFb'), secret, 'turns', 'arrival', 20);
  for i in 1..4 loop perform pg_temp.add(rid, nicks[i], pg_temp.hsh('s4', i)); end loop;
  holder := pg_temp.cur(rid);
  for i in 1..3 loop t := pg_temp.snd(rid, pg_temp.hsh('s4', i), wrong); end loop;
  holder := pg_temp.cur(rid);
  perform pg_temp.ck(4, holder = 'Dani', 'S4 after three sends the last of the queue (Dani) has the turn', coalesce(holder, '-'));
  seq0 := pg_temp.sq(rid);
  t := (select public.kick_player(rid, 'Dani'));
  holder := pg_temp.cur(rid); seq1 := pg_temp.sq(rid);
  ts1 := (select turn_deadline_at from public.rooms where id = rid);
  perform pg_temp.ck(4, t = 'ok' and holder = 'Ana' and seq1 = seq0 + 1 and ts1 > clock_timestamp() + interval '15 seconds', 'S4 kicking the last of the queue while he holds the turn wraps to the first', coalesce(holder, '-') || '/' || seq0 || '/' || seq1);
  seq0 := pg_temp.sq(rid);
  t := (select public.kick_player(rid, 'Cami'));
  holder := pg_temp.cur(rid); seq1 := pg_temp.sq(rid);
  perform pg_temp.ck(4, t = 'ok' and holder = 'Ana' and seq1 = seq0, 'S4 kicking a player who does not hold the turn changes nothing', coalesce(holder, '-') || '/' || seq0 || '/' || seq1);
  ord := '';
  for i in 1..4 loop
    holder := pg_temp.cur(rid); ord := ord || coalesce(holder, '-') || ',';
    t := pg_temp.snd(rid, pg_temp.hsh('s4', coalesce(array_position(nicks, holder), 99)), wrong);
  end loop;
  perform pg_temp.ck(4, ord = 'Ana,Beto,Ana,Beto,', 'S4 the queue now alternates Ana and Beto only', ord);
  n := (select count(*) from public.attempts a join public.players p on p.id = a.player_id where a.room_id = rid and p.nickname = 'Cami');
  perform pg_temp.ck(4, n = 1, 'S4 the attempt of a kicked player is kept', n::text);
  rid := gen_random_uuid();
  insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, mode, turn_order, phase, start_deadline_at)
    values (rid, 'TNBAAG', md5('TNBAAGa') || md5('TNBAAGb'), secret, 'turns', 'arrival', 'waiting', now() + interval '5 minutes');
  perform pg_temp.add(rid, 'Uno', pg_temp.hsh('s4', 11));
  perform pg_temp.add(rid, 'Dos', pg_temp.hsh('s4', 12));
  perform pg_temp.add(rid, 'Tres', pg_temp.hsh('s4', 13));
  t := (select public.kick_player(rid, 'Uno'));
  b := (select public.start_room(rid));
  holder := pg_temp.cur(rid);
  perform pg_temp.ck(4, t = 'ok' and b and holder = 'Dos', 'S4 kicked in the lobby (lowest rank): the first turn goes to the next one', coalesce(holder, '-'));

  raise exception E'RESULT extra part %: TOTAL % / FAILS %\n%', 2, coalesce(current_setting('sim.total', true), '0'), coalesce(nullif(current_setting('sim.fails', true), ''), '0'), coalesce(current_setting('sim.rep', true), '');
end
$do$;
