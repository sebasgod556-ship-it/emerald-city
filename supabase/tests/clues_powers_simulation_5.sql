-- Phase 3 block 1, verification 5 of 7: scenarios P2, P3.
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

  -- ===== P2: skip the turn
  rid := gen_random_uuid();
  insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, mode, turn_order)
    values (rid, 'TNBBCE', md5('TNBBCEa') || md5('TNBBCEb'), secret, 'turns', 'arrival');
  for i in 1..3 loop perform pg_temp.add(rid, nicks[i], pg_temp.hsh('p2', i)); end loop;
  holder := pg_temp.cur(rid); seq0 := pg_temp.sq(rid);
  t := (select public.skip_turn(rid));
  holder := pg_temp.cur(rid); seq1 := pg_temp.sq(rid);
  ts1 := (select turn_deadline_at from public.rooms where id = rid);
  perform pg_temp.ck(12, t = 'ok' and holder = 'Beto' and seq1 = seq0 + 1 and ts1 > clock_timestamp() + interval '15 seconds', 'P2 skipping passes the turn to the next with a fresh deadline', t || '/' || coalesce(holder, '-'));
  t := (select public.skip_turn(rid)); t2 := (select public.skip_turn(rid));
  holder := pg_temp.cur(rid);
  perform pg_temp.ck(12, holder = 'Ana', 'P2 two more skips wrap around to the first', coalesce(holder, '-'));
  n := (select count(*) from public.attempts where room_id = rid);
  perform pg_temp.ck(12, n = 0, 'P2 skipping saves no attempt', n::text);
  t := pg_temp.snd(rid, pg_temp.hsh('p2', 2), wrong);
  perform pg_temp.ck(12, t = 'not_your_turn', 'P2 whoever was skipped cannot send out of turn', t);
  t := (select public.pause_room(rid)) || '/' || (select public.skip_turn(rid));
  perform pg_temp.ck(12, t = 'ok/not_available', 'P2 skipping while paused is not available', t);
  rid := gen_random_uuid();
  insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, mode)
    values (rid, 'TNBBCF', md5('TNBBCFa') || md5('TNBBCFb'), secret, 'free');
  perform pg_temp.add(rid, 'Ana', pg_temp.hsh('p2', 4));
  t := (select public.skip_turn(rid));
  perform pg_temp.ck(12, t = 'not_available', 'P2 skipping in free mode is not available', t);
  b := (select public.close_room(rid));
  t := (select public.skip_turn(rid));
  perform pg_temp.ck(12, t = 'room_closed', 'P2 skipping in a closed room: room_closed', t);
  rid := gen_random_uuid();
  insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, mode, turn_order)
    values (rid, 'TNBBCG', md5('TNBBCGa') || md5('TNBBCGb'), secret, 'turns', 'arrival');
  perform pg_temp.add(rid, 'Solo', pg_temp.hsh('p2', 5));
  holder := pg_temp.cur(rid); seq0 := pg_temp.sq(rid);
  t := (select public.skip_turn(rid));
  holder := pg_temp.cur(rid);
  perform pg_temp.ck(12, t = 'ok' and holder = 'Solo' and pg_temp.sq(rid) = seq0 + 1, 'P2 a lone player skipped gets a fresh turn', coalesce(holder, '-'));
  t := pg_temp.snd(rid, pg_temp.hsh('p2', 5), secret);
  t2 := (select public.skip_turn(rid));
  perform pg_temp.ck(12, t = 'ok' and t2 = 'not_available', 'P2 after the winner there is nothing to skip', t2);

  -- ===== P3: mute
  rid := gen_random_uuid();
  insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, mode)
    values (rid, 'TNBBDA', md5('TNBBDAa') || md5('TNBBDAb'), secret, 'free');
  perform pg_temp.add(rid, 'Ana', pg_temp.hsh('p3', 1));
  perform pg_temp.add(rid, 'Beto', pg_temp.hsh('p3', 2));
  perform pg_temp.add(rid, 'Cami', pg_temp.hsh('p3', 3));
  t := (select public.set_player_muted(rid, 'beto', true));
  ts1 := (select muted_at from public.players where room_id = rid and nickname = 'Beto');
  perform pg_temp.ck(13, t = 'ok' and ts1 is not null, 'P3 mute by nickname (any case)', t);
  t := pg_temp.say(rid, pg_temp.hsh('p3', 2)) || '/' || pg_temp.say(rid, pg_temp.hsh('p3', 1));
  perform pg_temp.ck(13, t = 'muted/ok', 'P3 the muted player cannot chat, the others can', t);
  t := pg_temp.snd(rid, pg_temp.hsh('p3', 2), wrong);
  perform pg_temp.ck(13, t = 'ok', 'P3 the muted player keeps playing', t);
  t := (select public.set_player_muted(rid, 'Beto', true));
  perform pg_temp.ck(13, (select muted_at = ts1 from public.players where room_id = rid and nickname = 'Beto'), 'P3 muting twice keeps the first time', t);
  n := (select count(*) from public.post_admin_chat_message(rid, 'ok?') where o_outcome = 'ok');
  perform pg_temp.ck(13, n = 1, 'P3 the admin can still write', n::text);
  t := (select public.set_player_muted(rid, 'Beto', false));
  perform pg_temp.ck(13, t = 'ok' and pg_temp.say(rid, pg_temp.hsh('p3', 2)) = 'ok', 'P3 unmute: the player can chat again', t);
  t := (select public.kick_player(rid, 'Cami'));
  t := (select public.set_player_muted(rid, 'Cami', true)) || '/' || (select public.set_player_muted(rid, 'Nadie', true));
  perform pg_temp.ck(13, t = 'not_found/not_found', 'P3 a kicked or unknown player cannot be muted', t);
  b := (select public.close_room(rid));
  t := (select public.set_player_muted(rid, 'Ana', true));
  perform pg_temp.ck(13, t = 'room_closed', 'P3 closed room: room_closed', t);

  raise exception E'RESULT part %: TOTAL % / FAILS %\n%', 5, coalesce(current_setting('sim.total', true), '0'), coalesce(nullif(current_setting('sim.fails', true), ''), '0'), coalesce(current_setting('sim.rep', true), '');
end
$do$;
