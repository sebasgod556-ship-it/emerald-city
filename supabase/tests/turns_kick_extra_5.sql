-- Steps 11+12, extra verification 5 of 5: a winner, and chat/presence with kicked and disconnected players.
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

  -- ===== S9: winner, finished round
  rid := gen_random_uuid();
  insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, mode, turn_order, turn_seconds)
    values (rid, 'TNBABG', md5('TNBABGa') || md5('TNBABGb'), secret, 'turns', 'arrival', 20);
  for i in 1..3 loop perform pg_temp.add(rid, nicks[i], pg_temp.hsh('s9', i)); end loop;
  holder := pg_temp.cur(rid);
  t := pg_temp.snd(rid, pg_temp.hsh('s9', 2), secret);
  n := (select count(*) from public.attempts where room_id = rid);
  b := (select finished_at is null from public.rooms where id = rid);
  perform pg_temp.ck(9, t = 'not_your_turn' and n = 0 and b, 'S9 the secret sent out of turn: refused, nothing saved, no winner', t || '/' || n);
  t := pg_temp.snd(rid, pg_temp.hsh('s9', 1), wrong);
  holder := pg_temp.cur(rid);
  n := (select count(*) from public.submit_attempt(rid, pg_temp.hsh('s9', 2), secret) where o_is_winner and o_result = 'fire');
  perform pg_temp.ck(9, holder = 'Beto' and n = 1, 'S9 Beto holds the turn and wins with the secret', coalesce(holder, '-') || '/' || n);
  seq0 := pg_temp.sq(rid);
  perform pg_temp.late(rid);
  t := pg_temp.cur(rid); holder := pg_temp.cur(rid);
  perform pg_temp.ck(9, t is null and holder is null and pg_temp.sq(rid) = seq0, 'S9 after the winner an overdue deadline reports no turn and never moves it', coalesce(t, '-'));
  t := pg_temp.snd(rid, pg_temp.hsh('s9', 3), wrong) || '/' || pg_temp.snd(rid, pg_temp.hsh('s9', 1), wrong);
  perform pg_temp.ck(9, t = 'round_finished/round_finished', 'S9 nobody else can send', t);
  n := (select count(*) from public.list_hints(rid));
  t := (select public.kick_player(rid, 'Beto'));
  perform pg_temp.ck(9, t = 'ok' and pg_temp.sq(rid) = seq0 and (select count(*) from public.list_hints(rid)) = n and n >= 1, 'S9 kicking the winner after the end: turn untouched, hints table unchanged', t || '/' || n);
  t := (select o_outcome from public.post_chat_message(rid, pg_temp.hsh('s9', 3), 'gg')) || '/' || (select o_outcome from public.post_chat_message(rid, pg_temp.hsh('s9', 2), 'gg')) || '/' || (select o_outcome from public.post_admin_chat_message(rid, 'fin'));
  perform pg_temp.ck(9, t = 'ok/kicked/ok', 'S9 chat after the end: player ok, kicked winner refused, admin ok', t);
  n := (select count(*) from public.attempts where room_id = rid and is_winner);
  perform pg_temp.ck(9, n = 1, 'S9 exactly one winner in the room', n::text);

  -- ===== S10: free mode with kicked and disconnected players, then chat in a turn room
  rid := gen_random_uuid();
  insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, attempt_cooldown_seconds)
    values (rid, 'TNBABH', md5('TNBABHa') || md5('TNBABHb'), secret, 3);
  for i in 1..3 loop perform pg_temp.add(rid, nicks[i], pg_temp.hsh('s10', i)); end loop;
  t := (select o_outcome from public.post_chat_message(rid, pg_temp.hsh('s10', 2), 'hola'));
  perform pg_temp.away(rid, 'Cami');
  perform public.touch_player(rid, pg_temp.hsh('s10', 3));
  b := (select last_seen_at > clock_timestamp() - interval '5 seconds' from public.players where room_id = rid and nickname = 'Cami');
  perform pg_temp.ck(10, t = 'ok' and b, 'S10 free mode: presence ping works and Beto chatted before the kick', t);
  perform pg_temp.away(rid, 'Cami');
  t := (select public.kick_player(rid, 'Beto'));
  perform public.touch_player(rid, pg_temp.hsh('s10', 2));
  b := (select kicked_at is not null from public.players where room_id = rid and nickname = 'Beto');
  perform pg_temp.ck(10, t = 'ok' and b, 'S10 a presence ping does not undo a kick', t);
  t := pg_temp.snd(rid, pg_temp.hsh('s10', 2), wrong) || '/' || (select o_outcome from public.post_chat_message(rid, pg_temp.hsh('s10', 2), 'sigo'));
  perform pg_temp.ck(10, t = 'kicked/kicked', 'S10 free mode: kicked Beto cannot send or chat', t);
  t := pg_temp.snd(rid, pg_temp.hsh('s10', 3), wrong) || '/' || (select o_outcome from public.post_chat_message(rid, pg_temp.hsh('s10', 3), 'aqui'));
  perform pg_temp.ck(10, t = 'ok/ok', 'S10 free mode: disconnected Cami can still send and chat', t);
  n := (select count(*) from public.list_chat(rid, 0::bigint, 50) where o_nickname = 'Beto' and o_body = 'hola');
  perform pg_temp.ck(10, n = 1, 'S10 the message Beto wrote before the kick stays visible', n::text);
  t := pg_temp.snd(rid, pg_temp.hsh('s10', 1), wrong);
  t := t || '/' || (select o_outcome || ':' || (o_retry_after between 1 and 3) from public.submit_attempt(rid, pg_temp.hsh('s10', 1), wrong));
  perform pg_temp.ck(10, t = 'ok/cooldown:true', 'S10 free mode: the wait between attempts still applies after a kick', t);
  t := pg_temp.sq(rid) || '/' || (select count(*) from public.players where room_id = rid and kicked_at is null);
  perform pg_temp.ck(10, t = '0/2', 'S10 free mode: turn fields untouched, 2 active players', t);
  rid := gen_random_uuid();
  insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, mode, turn_order, turn_seconds)
    values (rid, 'TNBABJ', md5('TNBABJa') || md5('TNBABJb'), secret, 'turns', 'arrival', 20);
  perform pg_temp.add(rid, 'Ana', pg_temp.hsh('s10', 11));
  perform pg_temp.add(rid, 'Beto', pg_temp.hsh('s10', 12));
  holder := pg_temp.cur(rid);
  perform pg_temp.away(rid, 'Beto');
  t := (select o_outcome from public.post_chat_message(rid, pg_temp.hsh('s10', 12), 'sigo aqui'));
  b := (select last_seen_at < clock_timestamp() - interval '30 seconds' from public.players where room_id = rid and nickname = 'Beto');
  perform pg_temp.ck(10, t = 'ok' and b, 'S10 turns: a disconnected player can chat; chatting does not count as presence (current behavior)', t);
  t := pg_temp.snd(rid, pg_temp.hsh('s10', 12), wrong);
  b := (select last_seen_at > clock_timestamp() - interval '5 seconds' from public.players where room_id = rid and nickname = 'Beto');
  perform pg_temp.ck(10, t = 'not_your_turn' and b and pg_temp.cur(rid) = 'Ana', 'S10 turns: a refused send still shows he is here, and Ana keeps the turn', t);

  raise exception E'RESULT extra part %: TOTAL % / FAILS %\n%', 5, coalesce(current_setting('sim.total', true), '0'), coalesce(nullif(current_setting('sim.fails', true), ''), '0'), coalesce(current_setting('sim.rep', true), '');
end
$do$;
