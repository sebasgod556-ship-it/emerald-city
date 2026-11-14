-- Phase 3 block 1, verification 3 of 7: scenarios K3, K4, K5 / K6.
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

  -- ===== K3: clues off
  rid := gen_random_uuid();
  insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, mode, clue_max)
    values (rid, 'TNBBBA', md5('TNBBBAa') || md5('TNBBBAb'), secret, 'free', 0);
  perform pg_temp.add(rid, 'Ana', pg_temp.hsh('k3', 1));
  perform pg_temp.tick(rid); perform pg_temp.step(rid);
  n := (select jsonb_array_length(o_clues) from public.apply_due_timers(rid));
  perform pg_temp.ck(3, pg_temp.nc(rid) = 0 and n = 0, 'K3 clue_max = 0: no clue is ever revealed', n::text);

  -- ===== K4: the admin changes the clue settings
  rid := gen_random_uuid();
  insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, mode)
    values (rid, 'TNBBBB', md5('TNBBBBa') || md5('TNBBBBb'), secret, 'free');
  perform pg_temp.tick(rid); perform pg_temp.step(rid); perform pg_temp.step(rid);
  perform pg_temp.ck(4, pg_temp.nc(rid) = 2, 'K4 two clues out with the defaults', pg_temp.nc(rid)::text);
  b := (select public.set_clue_settings(rid, 30, 1));
  perform pg_temp.step(rid);
  perform pg_temp.ck(4, b and pg_temp.nc(rid) = 2, 'K4 lowering the limit below the clues already out reveals nothing more', pg_temp.nc(rid)::text);
  b := (select public.set_clue_settings(rid, 30, 3));
  perform pg_temp.tick(rid);
  ts1 := (select next_clue_at from public.rooms where id = rid);
  perform pg_temp.ck(4, b and ts1 > clock_timestamp() + interval '25 seconds' and ts1 <= clock_timestamp() + interval '30 seconds', 'K4 raising the limit re-arms the timer with the new interval (30 s)', '');
  perform pg_temp.step(rid);
  perform pg_temp.ck(4, pg_temp.nc(rid) = 3 and pg_temp.clues(rid) like '%type:%,type:%', 'K4 the third clue (the other type) comes out after the change', pg_temp.clues(rid));
  begin
    perform public.set_clue_settings(rid, 14, 2);
    perform pg_temp.ck(4, false, 'K4 interval 14 is refused', 'accepted');
  exception when check_violation then
    perform pg_temp.ck(4, true, 'K4 interval 14 is refused', '23514');
  end;
  begin
    perform public.set_clue_settings(rid, 60, 6);
    perform pg_temp.ck(4, false, 'K4 6 clues is refused', 'accepted');
  exception when check_violation then
    perform pg_temp.ck(4, true, 'K4 6 clues is refused', '23514');
  end;
  b := (select public.set_clue_settings(gen_random_uuid(), 60, 2));
  perform pg_temp.ck(4, not b, 'K4 unknown room: false', b::text);

  -- ===== K5 / K6: finished and waiting rooms
  rid := gen_random_uuid();
  insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, mode)
    values (rid, 'TNBBBC', md5('TNBBBCa') || md5('TNBBBCb'), secret, 'free');
  perform pg_temp.add(rid, 'Ana', pg_temp.hsh('k5', 1));
  perform pg_temp.tick(rid);
  t := pg_temp.snd(rid, pg_temp.hsh('k5', 1), secret);
  perform pg_temp.step(rid);
  perform pg_temp.ck(5, t = 'ok' and pg_temp.nc(rid) = 0 and (select finished_at is not null from public.rooms where id = rid), 'K5 a finished round reveals no clue even if the timer is due', t);
  rid := gen_random_uuid();
  insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, mode, phase, start_deadline_at)
    values (rid, 'TNBBBD', md5('TNBBBDa') || md5('TNBBBDb'), secret, 'free', 'waiting', now() + interval '5 minutes');
  perform pg_temp.tick(rid);
  perform pg_temp.ck(6, pg_temp.nc(rid) = 0 and (select next_clue_at is null from public.rooms where id = rid), 'K6 in the waiting room nothing is armed', pg_temp.nc(rid)::text);
  perform pg_temp.step(rid);
  perform pg_temp.ck(6, pg_temp.nc(rid) = 0, 'K6 in the waiting room a forced due timer reveals no clue', pg_temp.nc(rid)::text);
  update public.rooms set next_clue_at = null where id = rid;
  b := (select public.start_room(rid));
  perform pg_temp.tick(rid);
  perform pg_temp.ck(6, b and pg_temp.nc(rid) = 0 and (select next_clue_at > clock_timestamp() + interval '55 seconds' from public.rooms where id = rid), 'K6 after the game starts the timer is armed 60 s ahead', '');
  perform pg_temp.step(rid);
  perform pg_temp.ck(6, pg_temp.nc(rid) = 1, 'K6 and the first clue comes out when it is due', pg_temp.nc(rid)::text);
  rid := gen_random_uuid();
  insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, mode, phase, start_deadline_at)
    values (rid, 'TNBBBE', md5('TNBBBEa') || md5('TNBBBEb'), secret, 'free', 'waiting', now() - interval '1 second');
  perform pg_temp.tick(rid);
  perform pg_temp.ck(6, (select phase = 'playing' and next_clue_at is not null from public.rooms where id = rid), 'K6 a lobby whose time ran out starts and arms the clue timer in the same read', '');
  perform pg_temp.step(rid);
  perform pg_temp.add(rid, 'Ana', pg_temp.hsh('k6', 1));
  n := pg_temp.nc(rid);
  b := (select public.close_room(rid));
  perform pg_temp.ck(6, b and n = 1 and pg_temp.nc(rid) = 0, 'K7 closing the room erases its clues', n || '/' || pg_temp.nc(rid));

  raise exception E'RESULT part %: TOTAL % / FAILS %\n%', 3, coalesce(current_setting('sim.total', true), '0'), coalesce(nullif(current_setting('sim.fails', true), ''), '0'), coalesce(current_setting('sim.rep', true), '');
end
$do$;
