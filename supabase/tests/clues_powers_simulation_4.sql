-- Phase 3 block 1, verification 4 of 7: scenarios P1.
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

  -- ===== P1: pause and resume
  rid := gen_random_uuid();
  insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, mode)
    values (rid, 'TNBBCA', md5('TNBBCAa') || md5('TNBBCAb'), secret, 'free');
  perform pg_temp.add(rid, 'Ana', pg_temp.hsh('p1', 1));
  perform pg_temp.tick(rid);
  t := (select public.pause_room(rid)) || '/' || (select public.pause_room(rid));
  perform pg_temp.ck(11, t = 'ok/already_paused', 'P1 pause, and a second pause is harmless', t);
  t := pg_temp.snd(rid, pg_temp.hsh('p1', 1), wrong) || '/' || pg_temp.say(rid, pg_temp.hsh('p1', 1)) || '/' || pg_temp.ph(rid);
  perform pg_temp.ck(11, t = 'paused/ok/paused', 'P1 paused: attempts refused, chat still works, phase reported', t);
  perform pg_temp.step(rid);
  perform pg_temp.ck(11, pg_temp.nc(rid) = 0, 'P1 paused: a due clue does not come out', pg_temp.nc(rid)::text);
  update public.rooms set next_clue_at = clock_timestamp() + interval '10 seconds', paused_at = clock_timestamp() - interval '100 seconds' where id = rid;
  t := (select public.resume_room(rid)) || '/' || (select public.resume_room(rid));
  ts1 := (select next_clue_at from public.rooms where id = rid);
  perform pg_temp.ck(11, t = 'ok/not_paused' and ts1 > clock_timestamp() + interval '105 seconds' and ts1 < clock_timestamp() + interval '115 seconds', 'P1 resume gives the clue its time back (10 s left + 100 s paused)', t);
  t := pg_temp.snd(rid, pg_temp.hsh('p1', 1), wrong);
  perform pg_temp.ck(11, t = 'ok', 'P1 after resuming attempts work again', t);
  rid := gen_random_uuid();
  insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, mode, phase, start_deadline_at)
    values (rid, 'TNBBCB', md5('TNBBCBa') || md5('TNBBCBb'), secret, 'free', 'waiting', now() + interval '5 minutes');
  t := (select public.pause_room(rid));
  perform pg_temp.ck(11, t = 'not_playing', 'P1 a waiting room cannot be paused', t);
  rid := gen_random_uuid();
  insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, mode)
    values (rid, 'TNBBCC', md5('TNBBCCa') || md5('TNBBCCb'), secret, 'free');
  perform pg_temp.add(rid, 'Ana', pg_temp.hsh('p1', 2));
  t := pg_temp.snd(rid, pg_temp.hsh('p1', 2), secret);
  t2 := (select public.pause_room(rid));
  perform pg_temp.ck(11, t = 'ok' and t2 = 'not_playing', 'P1 a finished round cannot be paused', t2);
  b := (select public.close_room(rid));
  t := (select public.pause_room(rid)) || '/' || (select public.resume_room(rid));
  perform pg_temp.ck(11, t = 'room_closed/room_closed', 'P1 a closed room answers room_closed', t);
  rid := gen_random_uuid();
  insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, mode, turn_order)
    values (rid, 'TNBBCD', md5('TNBBCDa') || md5('TNBBCDb'), secret, 'turns', 'arrival');
  perform pg_temp.add(rid, 'Ana', pg_temp.hsh('p1', 3));
  perform pg_temp.add(rid, 'Beto', pg_temp.hsh('p1', 4));
  holder := pg_temp.cur(rid);
  ts1 := (select turn_deadline_at from public.rooms where id = rid);
  t := (select public.pause_room(rid));
  seq0 := pg_temp.sq(rid);
  perform pg_temp.late(rid);
  holder := pg_temp.cur(rid); holder := pg_temp.cur(rid);
  perform pg_temp.ck(11, t = 'ok' and holder is null and pg_temp.sq(rid) = seq0, 'P1 turns paused: no turn reported and an overdue deadline never skips', coalesce(holder, '-'));
  t := pg_temp.snd(rid, pg_temp.hsh('p1', 3), wrong);
  perform pg_temp.ck(11, t = 'paused', 'P1 turns paused: the holder gets paused (not not_your_turn)', t);
  update public.rooms set turn_deadline_at = ts1, paused_at = clock_timestamp() - interval '100 seconds' where id = rid;
  t := (select public.resume_room(rid));
  ts2 := (select turn_deadline_at from public.rooms where id = rid);
  perform pg_temp.ck(11, t = 'ok' and ts2 - ts1 between interval '99 seconds' and interval '101 seconds', 'P1 turns: resume moves the running deadline forward by the paused time', '');
  holder := pg_temp.cur(rid);
  perform pg_temp.ck(11, holder = 'Ana', 'P1 turns: after resuming Ana still has the turn', coalesce(holder, '-'));
  t := pg_temp.snd(rid, pg_temp.hsh('p1', 3), wrong);
  t2 := (select public.pause_room(rid));
  t2 := (select public.kick_player(rid, 'Beto'));
  update public.rooms set paused_at = clock_timestamp() where id = rid;
  t2 := (select public.resume_room(rid));
  holder := pg_temp.cur(rid);
  perform pg_temp.ck(11, t = 'ok' and holder = 'Ana', 'P1 turns: the holder kicked while paused is replaced after resuming', coalesce(holder, '-'));

  raise exception E'RESULT part %: TOTAL % / FAILS %\n%', 4, coalesce(current_setting('sim.total', true), '0'), coalesce(nullif(current_setting('sim.fails', true), ''), '0'), coalesce(current_setting('sim.rep', true), '');
end
$do$;
