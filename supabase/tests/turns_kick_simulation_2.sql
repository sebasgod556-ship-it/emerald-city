-- Steps 11+12: verification by simulation, part 2 of 3 (timeouts, disconnected players, everybody away, presence ping).
-- Run it AFTER the migration 20261108120000_turns_presence_kick.sql. Paste the WHOLE file and run it once.
-- It ends with an intentional error that rolls everything back (it leaves nothing in the database).
-- The last lines of the error read "TOTAL <n> / FAILS 0" when everything is fine; otherwise they list what failed.
-- If the editor asks about Row Level Security, choose to run WITHOUT it (the script creates no real tables).
create or replace function pg_temp.ck(g int, ok boolean, nm text, got text)
returns void
language plpgsql
as $f$
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

do $do$
declare
  rid uuid; secret int := 1; wrong int := 4;
  hs text[]; nicks text[] := array['Ana','Beto','Cami','Dani','Eli'];
  t text; n int; i int; b boolean; o record; ord text; exp text; holder text; seq0 int; seq1 int;
  ts1 timestamptz; ts2 timestamptz;
begin
  -- ===== G3: timeouts, away players, everybody away
  rid := gen_random_uuid();
  insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, mode, turn_order, turn_seconds)
    values (rid, 'TNAAAD', md5('7') || md5('8'), secret, 'turns', 'arrival', 20);
  hs := array[]::text[];
  for i in 1..3 loop
    hs := hs || (md5('g3-' || i) || md5(i || '-g3'));
    insert into public.players (room_id, nickname, session_hash) values (rid, nicks[i], hs[i]);
  end loop;
  t := (select o_turn_nickname from public.apply_due_timers(rid));
  seq0 := (select turn_seq from public.rooms where id = rid);
  ts1 := (select turn_deadline_at from public.rooms where id = rid);
  perform pg_temp.ck(3, t = 'Ana' and seq0 = 1 and ts1 > clock_timestamp() + interval '15 seconds', 'first turn: Ana, seq 1, about 20 s ahead', t || '/' || seq0);
  t := (select o_turn_nickname from public.apply_due_timers(rid));
  seq1 := (select turn_seq from public.rooms where id = rid);
  perform pg_temp.ck(3, t = 'Ana' and seq1 = 1, '5 more reads before the deadline change nothing', t || '/' || seq1);
  ord := '';
  for i in 1..4 loop
    update public.rooms set turn_deadline_at = clock_timestamp() - interval '1 second' where id = rid;
    holder := (select o_turn_nickname from public.apply_due_timers(rid));
    ord := ord || holder || ',';
  end loop;
  seq1 := (select turn_seq from public.rooms where id = rid);
  perform pg_temp.ck(3, ord = 'Beto,Cami,Ana,Beto,' and seq1 = 5, 'each expired turn passes to the next player, once', ord || seq1);
  update public.rooms set turn_deadline_at = clock_timestamp() - interval '1 second' where id = rid;
  n := (select count(*) from public.apply_due_timers(rid) where o_turn_nickname is not null and o_turn_deadline_at > clock_timestamp());
  perform pg_temp.ck(3, n = 1, 'after a skip the new turn has a fresh deadline', n::text);
  -- away player holding the turn is skipped at once while others are connected
  holder := (select o_turn_nickname from public.apply_due_timers(rid));
  update public.players set last_seen_at = clock_timestamp() - interval '60 seconds' where room_id = rid and nickname = holder;
  t := (select o_turn_nickname from public.apply_due_timers(rid));
  perform pg_temp.ck(3, t <> holder and t is not null, 'a disconnected turn holder (' || holder || ') is skipped at once', holder || ' -> ' || coalesce(t, '-'));
  -- everybody away: the turn does not move around on every read, and still rotates when the deadline passes
  update public.players set last_seen_at = clock_timestamp() - interval '60 seconds' where room_id = rid;
  holder := (select o_turn_nickname from public.apply_due_timers(rid));
  seq0 := (select turn_seq from public.rooms where id = rid);
  t := (select o_turn_nickname from public.apply_due_timers(rid));
  seq1 := (select turn_seq from public.rooms where id = rid);
  perform pg_temp.ck(3, t = holder and seq0 = seq1, 'everybody away: reads do not spin the turn', holder || '/' || seq0 || '/' || seq1);
  update public.rooms set turn_deadline_at = clock_timestamp() - interval '1 second' where id = rid;
  t := (select o_turn_nickname from public.apply_due_timers(rid));
  perform pg_temp.ck(3, t is not null and t <> holder, 'everybody away: still rotates when the deadline passes (no stall)', holder || ' -> ' || coalesce(t, '-'));
  -- presence ping
  update public.players set last_seen_at = clock_timestamp() - interval '60 seconds' where room_id = rid and nickname = 'Ana';
  perform public.touch_player(rid, hs[1]);
  ts1 := (select last_seen_at from public.players where room_id = rid and nickname = 'Ana');
  perform pg_sleep(0.05);
  perform public.touch_player(rid, hs[1]);
  ts2 := (select last_seen_at from public.players where room_id = rid and nickname = 'Ana');
  perform pg_temp.ck(3, ts1 > clock_timestamp() - interval '5 seconds' and ts2 = ts1, 'touch_player refreshes presence once, then waits 10 s before writing again', '');

  raise exception E'RESULT part %: TOTAL % / FAILS %\n%', 2, coalesce(current_setting('sim.total', true), '0'), coalesce(nullif(current_setting('sim.fails', true), ''), '0'), coalesce(current_setting('sim.rep', true), '');
end
$do$;
