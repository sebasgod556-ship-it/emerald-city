-- Phase 3 block 1, verification 6 of 7: scenarios P4.
-- Run it AFTER the migration 20261112130000_auto_clues_and_admin_powers.sql. Paste the WHOLE file and run it once.
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
create or replace function pg_temp.ph(r uuid) returns text language sql as $f$ select o_phase from public.apply_due_timers(r) $f$;
create or replace function pg_temp.snd(r uuid, h text, p int) returns text language sql as $f$ select o_outcome from public.submit_attempt(r, h, p) $f$;
create or replace function pg_temp.say(r uuid, h text) returns text language sql as $f$ select o_outcome from public.post_chat_message(r, h, 'hola') $f$;
create or replace function pg_temp.sq(r uuid) returns int language sql as $f$ select turn_seq from public.rooms where id = r $f$;
create or replace function pg_temp.nc(r uuid) returns int language sql as $f$ select count(*)::int from public.room_clues where room_id = r $f$;
create or replace function pg_temp.clues(r uuid) returns text language sql as $f$ select coalesce(string_agg(kind || ':' || value, ',' order by seq), '') from public.room_clues where room_id = r $f$;
create or replace function pg_temp.tick(r uuid) returns void language sql as $f$ select count(*) from public.apply_due_timers(r) $f$;
create or replace function pg_temp.due(r uuid) returns void language sql as $f$ update public.rooms set next_clue_at = clock_timestamp() - interval '1 second' where id = r $f$;
create or replace function pg_temp.late(r uuid) returns void language sql as $f$ update public.rooms set turn_deadline_at = clock_timestamp() - interval '2 hours' where id = r $f$;
create or replace function pg_temp.add(r uuid, nm text, h text) returns void language sql as $f$ insert into public.players (room_id, nickname, session_hash) values (r, nm, h) $f$;
-- one clue step: make the timer due and apply it
create or replace function pg_temp.step(r uuid) returns void language sql as $f$ select pg_temp.due(r); select pg_temp.tick(r) $f$;

do $do$
declare
  rid uuid; secret int := 1; wrong int := 4; mono int;
  sgen int; stypes text[]; gw int[]; tw int[]; cw int[];
  nicks text[] := array['Ana','Beto','Cami','Dani'];
  t text; t2 text; n int; i int; b boolean; holder text; seq0 int; seq1 int;
  ts1 timestamptz; ts2 timestamptz;
begin
  sgen := (select generacion from public.pokemon where id = secret);
  stypes := (select tipos_es from public.pokemon where id = secret);
  mono := (select id from public.pokemon where cardinality(tipos_es) = 1 order by id limit 1);
  gw := array(select id from public.pokemon where generacion = sgen and not (tipos_es && stypes) order by id limit 2);
  tw := array(select id from public.pokemon where generacion <> sgen and (tipos_es && stypes) order by id limit 2);
  cw := array(select id from public.pokemon where generacion <> sgen and not (tipos_es && stypes) order by id limit 1);
  perform pg_temp.ck(0, cardinality(stypes) = 2 and cardinality(gw) = 2 and cardinality(tw) = 2 and cardinality(cw) = 1 and mono is not null, 'SETUP the secret is dual-type and every kind of probe Pokemon exists', coalesce(array_to_string(stypes, '/'), '') || ' gen ' || sgen);

  -- ===== P4: change the secret and restart
  rid := gen_random_uuid();
  insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, mode, clue_max, clue_interval_seconds)
    values (rid, 'TNBBDB', md5('TNBBDBa') || md5('TNBBDBb'), secret, 'free', 5, 15);
  perform pg_temp.add(rid, 'Ana', pg_temp.hsh('p4', 1));
  perform pg_temp.add(rid, 'Beto', pg_temp.hsh('p4', 2));
  perform pg_temp.add(rid, 'Cami', pg_temp.hsh('p4', 3));
  t := (select public.kick_player(rid, 'Cami'));
  t := (select public.set_player_muted(rid, 'Beto', true));
  t := pg_temp.snd(rid, pg_temp.hsh('p4', 1), wrong);
  t := pg_temp.say(rid, pg_temp.hsh('p4', 1));
  perform pg_temp.tick(rid); perform pg_temp.step(rid);
  t := pg_temp.snd(rid, pg_temp.hsh('p4', 2), secret);
  n := pg_temp.nc(rid);
  perform pg_temp.ck(14, n = 1 and (select finished_at is not null from public.rooms where id = rid), 'P4 setup: finished round with attempts, chat and a clue', n::text);
  t := (select public.reset_room(rid, mono));
  perform pg_temp.ck(14, t = 'ok', 'P4 reset ok', t);
  perform pg_temp.ck(14, (select count(*) from public.attempts where room_id = rid) = 0 and (select count(*) from public.chat_messages where room_id = rid) = 0 and pg_temp.nc(rid) = 0, 'P4 attempts, chat and clues are erased', '');
  b := (select finished_at is null and secret_pokemon_id = mono and phase = 'playing' and round_no = 2 and clues_revealed = 0 and next_clue_at is null and paused_at is null from public.rooms where id = rid);
  perform pg_temp.ck(14, b, 'P4 not finished, new secret, playing, round 2, clue counters back to 0', '');
  n := (select count(*) from public.players where room_id = rid);
  perform pg_temp.ck(14, n = 3 and (select kicked_at is not null from public.players where room_id = rid and nickname = 'Cami') and (select muted_at is not null from public.players where room_id = rid and nickname = 'Beto'), 'P4 the players stay, and so do kicks and mutes', n::text);
  t := pg_temp.snd(rid, pg_temp.hsh('p4', 1), secret);
  perform pg_temp.ck(14, t = 'ok' and (select is_winner = false from public.attempts where room_id = rid order by id desc limit 1), 'P4 the OLD secret no longer wins', t);
  n := (select count(*) from public.submit_attempt(rid, pg_temp.hsh('p4', 2), mono) where o_is_winner);
  perform pg_temp.ck(14, n = 1, 'P4 the NEW secret wins', n::text);
  t := (select public.reset_room(rid, 99999));
  perform pg_temp.ck(14, t = 'unknown_pokemon' and (select count(*) from public.attempts where room_id = rid) = 2 and (select round_no from public.rooms where id = rid) = 2, 'P4 an unknown Pokemon is refused and nothing is erased', t);
  rid := gen_random_uuid();
  insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, mode, turn_order)
    values (rid, 'TNBBDC', md5('TNBBDCa') || md5('TNBBDCb'), secret, 'turns', 'arrival');
  for i in 1..3 loop perform pg_temp.add(rid, nicks[i], pg_temp.hsh('p4', 10 + i)); end loop;
  holder := pg_temp.cur(rid);
  t := pg_temp.snd(rid, pg_temp.hsh('p4', 11), wrong);
  t := (select public.pause_room(rid));
  seq0 := pg_temp.sq(rid);
  t := (select public.reset_room(rid, mono));
  holder := pg_temp.cur(rid);
  perform pg_temp.ck(14, t = 'ok' and holder = 'Ana' and (select phase = 'playing' from public.rooms where id = rid) and pg_temp.sq(rid) > seq0, 'P4 turns + paused: the reset resumes the game and the queue starts again at the first player', coalesce(holder, '-'));
  rid := gen_random_uuid();
  insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, mode, phase, start_deadline_at)
    values (rid, 'TNBBDD', md5('TNBBDDa') || md5('TNBBDDb'), secret, 'free', 'waiting', now() + interval '5 minutes');
  t := (select public.reset_room(rid, mono));
  perform pg_temp.ck(14, t = 'ok' and (select phase = 'waiting' from public.rooms where id = rid), 'P4 a room still in the waiting room stays waiting', t);
  b := (select public.close_room(rid));
  t := (select public.reset_room(rid, mono));
  perform pg_temp.ck(14, t = 'room_closed', 'P4 closed room: room_closed', t);

  raise exception E'RESULT part %: TOTAL % / FAILS %\n%', 6, coalesce(current_setting('sim.total', true), '0'), coalesce(nullif(current_setting('sim.fails', true), ''), '0'), coalesce(current_setting('sim.rep', true), '');
end
$do$;
