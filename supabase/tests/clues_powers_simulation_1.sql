-- Phase 3 block 1, verification 1 of 7: scenarios K1.
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

  -- ===== K1: default clues (2 clues, every 60 s) with no attempts
  rid := gen_random_uuid();
  insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, mode)
    values (rid, 'TNBBAA', md5('TNBBAAa') || md5('TNBBAAb'), secret, 'free');
  perform pg_temp.add(rid, 'Ana', pg_temp.hsh('k1', 1));
  perform pg_temp.tick(rid);
  b := (select next_clue_at > clock_timestamp() + interval '55 seconds' and next_clue_at <= clock_timestamp() + interval '60 seconds' from public.rooms where id = rid);
  perform pg_temp.ck(1, b and pg_temp.nc(rid) = 0, 'K1 the first read arms the timer 60 s ahead and reveals nothing', pg_temp.nc(rid)::text);
  perform pg_temp.tick(rid); perform pg_temp.tick(rid);
  perform pg_temp.ck(1, pg_temp.nc(rid) = 0, 'K1 more reads before the time do not reveal anything', pg_temp.nc(rid)::text);
  perform pg_temp.step(rid);
  t := pg_temp.clues(rid);
  perform pg_temp.ck(1, t = 'generation:' || sgen, 'K1 no attempts yet: the first clue is the generation', t);
  b := (select next_clue_at > clock_timestamp() + interval '55 seconds' from public.rooms where id = rid);
  perform pg_temp.tick(rid); perform pg_temp.tick(rid);
  perform pg_temp.ck(1, b and pg_temp.nc(rid) = 1, 'K1 after a clue the next one is 60 s away; reads do not add more', pg_temp.nc(rid)::text);
  perform pg_temp.step(rid);
  b := (select kind = 'type' and value = any (stypes) from public.room_clues where room_id = rid and seq = 2);
  perform pg_temp.ck(1, b, 'K1 the second clue is one type of the secret', pg_temp.clues(rid));
  perform pg_temp.ck(1, pg_temp.nc(rid) = 2 and (select clues_revealed = 2 and next_clue_at is null from public.rooms where id = rid), 'K1 after the 2nd clue the limit is reached and nothing is armed', pg_temp.clues(rid));
  perform pg_temp.tick(rid); perform pg_temp.tick(rid);
  perform pg_temp.ck(1, pg_temp.nc(rid) = 2 and (select next_clue_at is null from public.rooms where id = rid), 'K1 more reads change nothing (still not armed)', pg_temp.clues(rid));
  perform pg_temp.step(rid);
  perform pg_temp.ck(1, pg_temp.nc(rid) = 2, 'K1 even with the timer forced to be due, a 3rd clue never comes out', pg_temp.clues(rid));
  n := (select jsonb_array_length(o_clues) from public.apply_due_timers(rid));
  perform pg_temp.ck(1, n = 2, 'K1 apply_due_timers returns the 2 clues in order', n::text);

  raise exception E'RESULT part %: TOTAL % / FAILS %\n%', 1, coalesce(current_setting('sim.total', true), '0'), coalesce(nullif(current_setting('sim.fails', true), ''), '0'), coalesce(current_setting('sim.rep', true), '');
end
$do$;
