-- Steps 11+12, extra verification 4 of 5: turn length 5 s / 120 s and 100 players rotating.
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

  -- ===== S7: turn length limits
  begin
    insert into public.rooms (room_code, admin_code_hash, secret_pokemon_id, mode, turn_seconds) values ('TNBABA', md5('x') || md5('y'), secret, 'turns', 4);
    perform pg_temp.ck(7, false, 'S7 turn_seconds = 4 is refused', 'accepted');
  exception when check_violation then
    perform pg_temp.ck(7, true, 'S7 turn_seconds = 4 is refused', '23514');
  end;
  begin
    insert into public.rooms (room_code, admin_code_hash, secret_pokemon_id, mode, turn_seconds) values ('TNBABB', md5('x') || md5('y'), secret, 'turns', 121);
    perform pg_temp.ck(7, false, 'S7 turn_seconds = 121 is refused', 'accepted');
  exception when check_violation then
    perform pg_temp.ck(7, true, 'S7 turn_seconds = 121 is refused', '23514');
  end;
  rid := gen_random_uuid();
  insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, mode) values (rid, 'TNBABC', md5('x') || md5('y'), secret, 'turns');
  n := (select turn_seconds from public.rooms where id = rid);
  perform pg_temp.ck(7, n = 20, 'S7 default turn length is 20 s', n::text);
  rid := gen_random_uuid();
  insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, mode, turn_order, turn_seconds)
    values (rid, 'TNBABD', md5('TNBABDa') || md5('TNBABDb'), secret, 'turns', 'arrival', 5);
  perform pg_temp.add(rid, 'Ana', pg_temp.hsh('s7', 1));
  perform pg_temp.add(rid, 'Beto', pg_temp.hsh('s7', 2));
  holder := pg_temp.cur(rid);
  ts1 := (select turn_deadline_at from public.rooms where id = rid);
  seq0 := pg_temp.sq(rid);
  perform pg_temp.ck(7, holder = 'Ana' and ts1 > clock_timestamp() + interval '3 seconds' and ts1 <= clock_timestamp() + interval '5 seconds', 'S7 5-second turn: the deadline is about 5 s ahead', coalesce(holder, '-'));
  perform pg_temp.ck(7, pg_temp.cur(rid) = 'Ana' and pg_temp.sq(rid) = seq0, 'S7 a read before the deadline changes nothing', '');
  perform pg_sleep(5.5);
  holder := pg_temp.cur(rid);
  ts2 := (select turn_deadline_at from public.rooms where id = rid);
  perform pg_temp.ck(7, holder = 'Beto' and pg_temp.sq(rid) = seq0 + 1 and ts2 > clock_timestamp() + interval '3 seconds', 'S7 after really waiting 5.5 s the turn passed to Beto, new deadline about 5 s', coalesce(holder, '-'));
  t := pg_temp.snd(rid, pg_temp.hsh('s7', 1), wrong);
  perform pg_temp.ck(7, t = 'not_your_turn', 'S7 Ana, whose 5 s ran out, is refused', t);
  rid := gen_random_uuid();
  insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, mode, turn_order, turn_seconds)
    values (rid, 'TNBABE', md5('TNBABEa') || md5('TNBABEb'), secret, 'turns', 'arrival', 120);
  perform pg_temp.add(rid, 'Ana', pg_temp.hsh('s7', 3));
  perform pg_temp.add(rid, 'Beto', pg_temp.hsh('s7', 4));
  holder := pg_temp.cur(rid);
  ts1 := (select turn_deadline_at from public.rooms where id = rid);
  perform pg_temp.ck(7, holder = 'Ana' and ts1 > clock_timestamp() + interval '118 seconds' and ts1 <= clock_timestamp() + interval '120 seconds', 'S7 120-second turn: the deadline is about 120 s ahead', coalesce(holder, '-'));
  perform pg_sleep(1);
  t := pg_temp.cur(rid);
  perform pg_temp.ck(7, t = 'Ana', 'S7 one second later Ana still has the turn', coalesce(t, '-'));
  t := pg_temp.snd(rid, pg_temp.hsh('s7', 3), wrong);
  ts2 := (select turn_deadline_at from public.rooms where id = rid);
  perform pg_temp.ck(7, t = 'ok' and pg_temp.cur(rid) = 'Beto' and ts2 > clock_timestamp() + interval '118 seconds', 'S7 Ana sends and Beto gets a fresh 120 s', t);

  -- ===== S8: 100 players rotate turns
  rid := gen_random_uuid();
  insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, mode, turn_order, turn_seconds)
    values (rid, 'TNBABF', md5('TNBABFa') || md5('TNBABFb'), secret, 'turns', 'arrival', 20);
  for i in 1..100 loop perform pg_temp.add(rid, 'P' || i, pg_temp.hsh('s8', i)); end loop;
  update public.players set last_seen_at = clock_timestamp() where room_id = rid;
  ts1 := clock_timestamp();
  bad := 0;
  for i in 1..100 loop
    holder := pg_temp.cur(rid);
    if holder is distinct from 'P' || i then bad := bad + 1; end if;
    t := pg_temp.snd(rid, pg_temp.hsh('s8', i), wrong);
    if t <> 'ok' then bad := bad + 1; end if;
  end loop;
  ts2 := clock_timestamp();
  perform pg_temp.ck(8, bad = 0, 'S8 100 turns went to the right player in queue order and were accepted', bad::text);
  perform pg_temp.ck(0, true, 'S8 info: seconds taken by the 100 turns', round(extract(epoch from ts2 - ts1)::numeric, 2)::text);
  holder := pg_temp.cur(rid);
  n := (select count(distinct player_id) from public.attempts where room_id = rid);
  perform pg_temp.ck(8, holder = 'P1' and n = 100 and (select count(*) from public.attempts where room_id = rid) = 100, 'S8 after P100 it wraps to P1; 100 players, 100 attempts, one each', coalesce(holder, '-') || '/' || n);
  update public.players set last_seen_at = clock_timestamp() - interval '2 minutes' where room_id = rid and nickname in (select 'P' || g from generate_series(51, 60) g);
  bad := 0;
  for k in 1..90 loop
    i := case when k <= 50 then k else k + 10 end;
    holder := pg_temp.cur(rid);
    if holder is distinct from 'P' || i then bad := bad + 1; end if;
    t := pg_temp.snd(rid, pg_temp.hsh('s8', i), wrong);
    if t <> 'ok' then bad := bad + 1; end if;
  end loop;
  holder := pg_temp.cur(rid);
  perform pg_temp.ck(8, bad = 0 and holder = 'P1', 'S8 with P51..P60 disconnected, a full lap skips exactly those 10 and wraps to P1', bad || '/' || coalesce(holder, '-'));

  raise exception E'RESULT extra part %: TOTAL % / FAILS %\n%', 4, coalesce(current_setting('sim.total', true), '0'), coalesce(nullif(current_setting('sim.fails', true), ''), '0'), coalesce(current_setting('sim.rep', true), '');
end
$do$;
