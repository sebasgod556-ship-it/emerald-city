-- Steps 11+12: verification by simulation, part 1 of 3 (turns in arrival order to a winner, random order with a lobby, admin start now).
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
  -- ===== G1: turns, arrival order, no lobby, played to a winner
  rid := gen_random_uuid();
  insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, mode, turn_order, turn_seconds)
    values (rid, 'TNAAAA', md5('1') || md5('2'), secret, 'turns', 'arrival', 20);
  hs := array[]::text[];
  for i in 1..4 loop
    hs := hs || (md5('g1-' || i) || md5(i || '-g1'));
    insert into public.players (room_id, nickname, session_hash) values (rid, nicks[i], hs[i]);
  end loop;
  t := (select string_agg(nickname, ',' order by turn_rank) from public.players where room_id = rid);
  perform pg_temp.ck(1, t = 'Ana,Beto,Cami,Dani', 'arrival queue follows the order of entry', t);
  t := (select o_turn_nickname from public.apply_due_timers(rid));
  perform pg_temp.ck(1, t = 'Ana', 'first turn goes to the first arrival', t);
  t := (select o_outcome from public.submit_attempt(rid, hs[2], wrong));
  perform pg_temp.ck(1, t = 'not_your_turn', 'a player without the turn is refused', t);
  t := (select o_outcome from public.submit_attempt(rid, repeat('9', 64), wrong));
  perform pg_temp.ck(1, t = 'not_player', 'a stranger is still not_player', t);
  ord := '';
  for i in 1..4 loop
    holder := (select o_turn_nickname from public.apply_due_timers(rid));
    ord := ord || holder || ',';
    t := (select o_outcome from public.submit_attempt(rid, hs[array_position(nicks, holder)], wrong));
    perform pg_temp.ck(1, t = 'ok', 'turn ' || i || ' (' || holder || ') accepted', t);
  end loop;
  perform pg_temp.ck(1, ord = 'Ana,Beto,Cami,Dani,', 'turns rotate in queue order', ord);
  holder := (select o_turn_nickname from public.apply_due_timers(rid));
  perform pg_temp.ck(1, holder = 'Ana', 'after the last player the queue wraps to the first', holder);
  t := (select o_outcome from public.submit_attempt(rid, hs[1], wrong));
  perform pg_temp.ck(1, t = 'ok', 'no wait between attempts in turn mode (Ana sent a moment ago)', t);
  holder := (select o_turn_nickname from public.apply_due_timers(rid));
  o := (select s from public.submit_attempt(rid, hs[array_position(nicks, holder)], secret) s);
  perform pg_temp.ck(1, o.o_outcome = 'ok' and o.o_is_winner and o.o_result = 'fire', holder || ' sends the secret: fire and winner', o.o_outcome || '/' || coalesce(o.o_result, '-'));
  t := (select o_outcome from public.submit_attempt(rid, hs[3], wrong));
  perform pg_temp.ck(1, t = 'round_finished', 'after the winner: round_finished', t);
  n := (select count(*) from public.apply_due_timers(rid) where o_turn_nickname is not null);
  perform pg_temp.ck(1, n = 0, 'no turn is reported after the winner', n::text);

  -- ===== G2: turns, random order, lobby already due
  rid := gen_random_uuid();
  insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, mode, turn_order, phase, start_deadline_at)
    values (rid, 'TNAAAB', md5('3') || md5('4'), secret, 'turns', 'random', 'waiting', now() - interval '1 second');
  hs := array[]::text[];
  for i in 1..5 loop
    hs := hs || (md5('g2-' || i) || md5(i || '-g2'));
    insert into public.players (room_id, nickname, session_hash) values (rid, nicks[i], hs[i]);
  end loop;
  n := (select count(*) from public.players where room_id = rid and turn_rank >= 0 and turn_rank < 1);
  perform pg_temp.ck(2, n = 5, 'random queue: every rank is a random number in [0,1)', n::text);
  t := (select o_outcome from public.submit_attempt(rid, repeat('9', 64), wrong));
  perform pg_temp.ck(2, t = 'not_player', 'lobby: stranger answered before anything else', t);
  exp := (select string_agg(nickname, ',' order by turn_rank) from public.players where room_id = rid);
  t := (select o_phase || ':' || coalesce(o_turn_nickname, '-') from public.apply_due_timers(rid));
  perform pg_temp.ck(2, t = 'playing:' || split_part(exp, ',', 1), 'a due lobby starts and hands the first turn to the lowest rank', t);
  ord := '';
  for i in 1..5 loop
    holder := (select o_turn_nickname from public.apply_due_timers(rid));
    ord := ord || holder || ',';
    t := (select o_outcome from public.submit_attempt(rid, hs[array_position(nicks, holder)], wrong));
    if t <> 'ok' then perform pg_temp.ck(2, false, 'turn ' || i || ' accepted', t); end if;
  end loop;
  perform pg_temp.ck(2, rtrim(ord, ',') = exp, 'every player got exactly one turn, in rank order', ord || ' vs ' || exp);
  holder := (select o_turn_nickname from public.apply_due_timers(rid));
  perform pg_temp.ck(2, holder = split_part(exp, ',', 1), 'then it wraps to the first again', holder);
  insert into public.players (room_id, nickname, session_hash) values (rid, 'Zeta', md5('late') || md5('joiner'));
  b := (select turn_rank > (select max(p.turn_rank) from public.players p where p.room_id = rid and p.nickname <> 'Zeta') from public.players where room_id = rid and nickname = 'Zeta');
  perform pg_temp.ck(2, b, 'a player who joins after the start goes to the end of the queue', b::text);

  -- G2b: lobby not due, admin starts now
  rid := gen_random_uuid();
  insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, mode, turn_order, phase, start_deadline_at)
    values (rid, 'TNAAAC', md5('5') || md5('6'), secret, 'turns', 'arrival', 'waiting', now() + interval '5 minutes');
  insert into public.players (room_id, nickname, session_hash) values (rid, 'Ana', md5('g2b-1') || md5('1-g2b')), (rid, 'Beto', md5('g2b-2') || md5('2-g2b'));
  t := (select o_outcome from public.submit_attempt(rid, md5('g2b-1') || md5('1-g2b'), wrong));
  perform pg_temp.ck(2, t = 'not_started', 'turn lobby: attempt refused before the start', t);
  t := (select coalesce(o_turn_nickname, '-') from public.apply_due_timers(rid));
  perform pg_temp.ck(2, t = '-', 'turn lobby: no turn is announced while waiting', t);
  b := (select public.start_room(rid));
  perform pg_temp.ck(2, b, 'admin "start now" in a turn room', b::text);
  t := (select o_turn_nickname from public.apply_due_timers(rid));
  perform pg_temp.ck(2, t = 'Ana', 'and the first turn is handed out', t);

  raise exception E'RESULT part %: TOTAL % / FAILS %\n%', 1, coalesce(current_setting('sim.total', true), '0'), coalesce(nullif(current_setting('sim.fails', true), ''), '0'), coalesce(current_setting('sim.rep', true), '');
end
$do$;
