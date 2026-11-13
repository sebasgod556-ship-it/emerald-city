-- Steps 11+12, extra verification 3 of 5: returning players and overdue deadlines without reads.
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

  -- ===== S5: a disconnected player comes back in time
  rid := gen_random_uuid();
  insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, mode, turn_order, turn_seconds)
    values (rid, 'TNBAAH', md5('TNBAAHa') || md5('TNBAAHb'), secret, 'turns', 'arrival', 20);
  for i in 1..3 loop perform pg_temp.add(rid, nicks[i], pg_temp.hsh('s5', i)); end loop;
  holder := pg_temp.cur(rid);
  rk := (select turn_rank from public.players where room_id = rid and nickname = 'Beto');
  perform pg_temp.away(rid, 'Beto');
  t := pg_temp.snd(rid, pg_temp.hsh('s5', 1), wrong);
  holder := pg_temp.cur(rid);
  perform pg_temp.ck(5, holder = 'Cami', 'S5 Beto is away: after Ana the turn skips him', coalesce(holder, '-'));
  perform public.touch_player(rid, pg_temp.hsh('s5', 2));
  b := (select last_seen_at > clock_timestamp() - interval '5 seconds' from public.players where room_id = rid and nickname = 'Beto');
  perform pg_temp.ck(5, b, 'S5 the ping brings Beto back as connected', b::text);
  ord := '';
  for i in 1..3 loop
    holder := pg_temp.cur(rid); ord := ord || coalesce(holder, '-') || ',';
    t := pg_temp.snd(rid, pg_temp.hsh('s5', coalesce(array_position(nicks, holder), 99)), wrong);
  end loop;
  perform pg_temp.ck(5, ord = 'Cami,Ana,Beto,', 'S5 and the queue goes Cami, Ana, Beto: he is back in his place', ord);
  holder := pg_temp.cur(rid);
  b := (select turn_rank = rk from public.players where room_id = rid and nickname = 'Beto');
  perform pg_temp.ck(5, b, 'S5 his queue rank never changed while he was away', b::text);
  holder := pg_temp.cur(rid);
  seq0 := pg_temp.sq(rid);
  perform pg_temp.away(rid, holder);
  perform public.touch_player(rid, pg_temp.hsh('s5', coalesce(array_position(nicks, holder), 99)));
  t := pg_temp.cur(rid); seq1 := pg_temp.sq(rid);
  perform pg_temp.ck(5, t = holder and seq1 = seq0, 'S5 a holder who pings before the read is not skipped', coalesce(t, '-') || '/' || seq0 || '/' || seq1);

  -- ===== S6: several deadlines overdue with nobody reading
  rid := gen_random_uuid();
  insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, mode, turn_order, turn_seconds)
    values (rid, 'TNBAAJ', md5('TNBAAJa') || md5('TNBAAJb'), secret, 'turns', 'arrival', 20);
  for i in 1..4 loop perform pg_temp.add(rid, nicks[i], pg_temp.hsh('s6', i)); end loop;
  holder := pg_temp.cur(rid);
  perform pg_temp.late(rid);
  seq0 := pg_temp.sq(rid);
  t := pg_temp.snd(rid, pg_temp.hsh('s6', 3), wrong);
  holder := pg_temp.cur(rid); seq1 := pg_temp.sq(rid);
  perform pg_temp.ck(6, t = 'not_your_turn' and holder = 'Beto' and seq1 = seq0 + 1, 'S6 two hours overdue: ONE skip (Ana to Beto), not one per 20 s elapsed', t || '/' || coalesce(holder, '-') || '/' || (seq1 - seq0));
  perform pg_temp.late(rid);
  seq0 := pg_temp.sq(rid);
  t := pg_temp.snd(rid, pg_temp.hsh('s6', 2), wrong);
  holder := pg_temp.cur(rid); seq1 := pg_temp.sq(rid);
  perform pg_temp.ck(6, t = 'not_your_turn' and holder = 'Cami' and seq1 = seq0 + 1, 'S6 a holder whose time ran out cannot send, the turn is already Cami''s', t || '/' || coalesce(holder, '-') || '/' || (seq1 - seq0));
  perform pg_temp.late(rid);
  seq0 := pg_temp.sq(rid);
  t := pg_temp.snd(rid, pg_temp.hsh('s6', 4), wrong);
  holder := pg_temp.cur(rid); seq1 := pg_temp.sq(rid);
  perform pg_temp.ck(6, t = 'ok' and holder = 'Ana' and seq1 = seq0 + 2, 'S6 the next player sends after an overdue turn: accepted, then it moves on (+2)', t || '/' || coalesce(holder, '-') || '/' || (seq1 - seq0));
  perform pg_temp.late(rid);
  seq0 := pg_temp.sq(rid);
  for i in 1..5 loop holder := pg_temp.cur(rid); end loop;
  seq1 := pg_temp.sq(rid);
  perform pg_temp.ck(6, seq1 = seq0 + 1 and holder = 'Beto', 'S6 five reads of one overdue deadline: one single skip', coalesce(holder, '-') || '/' || (seq1 - seq0));

  raise exception E'RESULT extra part %: TOTAL % / FAILS %\n%', 3, coalesce(current_setting('sim.total', true), '0'), coalesce(nullif(current_setting('sim.fails', true), ''), '0'), coalesce(current_setting('sim.rep', true), '');
end
$do$;
