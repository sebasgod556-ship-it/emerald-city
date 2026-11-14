-- Phase 3 block 1, verification 2 of 7: scenarios K2.
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

  -- ===== K2: the first clue depends on the warm attempts
  rid := gen_random_uuid();
  insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, mode, clue_max, clue_interval_seconds)
    values (rid, 'TNBBAB', md5('TNBBABa') || md5('TNBBABb'), secret, 'free', 5, 15);
  perform pg_temp.add(rid, 'Ana', pg_temp.hsh('k2', 1));
  perform pg_temp.add(rid, 'Beto', pg_temp.hsh('k2', 2));
  t := pg_temp.snd(rid, pg_temp.hsh('k2', 1), gw[1]) || '/' || pg_temp.snd(rid, pg_temp.hsh('k2', 2), gw[2]);
  n := (select count(*) from public.attempts where room_id = rid and result = 'warm');
  perform pg_temp.ck(2, t = 'ok/ok' and n = 2, 'K2a two attempts warm by generation', t || '/' || n);
  perform pg_temp.tick(rid); perform pg_temp.step(rid);
  t := pg_temp.clues(rid);
  perform pg_temp.ck(2, t like 'type:%', 'K2a warm by generation: the first clue reveals a TYPE', t);
  perform pg_temp.step(rid);
  perform pg_temp.ck(2, (select kind = 'generation' and value = sgen::text from public.room_clues where room_id = rid and seq = 2), 'K2a the second clue is the generation', pg_temp.clues(rid));
  perform pg_temp.step(rid);
  b := (select kind = 'type' and value <> (select value from public.room_clues where room_id = rid and seq = 1) from public.room_clues where room_id = rid and seq = 3);
  perform pg_temp.ck(2, b, 'K2a the third clue is the OTHER type (never repeats)', pg_temp.clues(rid));
  perform pg_temp.step(rid); perform pg_temp.step(rid);
  perform pg_temp.ck(2, pg_temp.nc(rid) = 3 and (select next_clue_at = 'infinity' from public.rooms where id = rid), 'K2a nothing left after 3 clues: the timer stops (infinity)', pg_temp.nc(rid)::text);
  b := (select array_agg(value order by value) from public.room_clues where room_id = rid and kind = 'type') = (select array_agg(x order by x) from unnest(stypes) x);
  perform pg_temp.ck(2, b, 'K2a the two revealed types are exactly the secret types', '');
  rid := gen_random_uuid();
  insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, mode, clue_max, clue_interval_seconds)
    values (rid, 'TNBBAC', md5('TNBBACa') || md5('TNBBACb'), secret, 'free', 5, 15);
  perform pg_temp.add(rid, 'Ana', pg_temp.hsh('k2', 3));
  perform pg_temp.add(rid, 'Beto', pg_temp.hsh('k2', 4));
  t := pg_temp.snd(rid, pg_temp.hsh('k2', 3), tw[1]) || '/' || pg_temp.snd(rid, pg_temp.hsh('k2', 4), tw[2]);
  perform pg_temp.tick(rid); perform pg_temp.step(rid);
  perform pg_temp.ck(2, t = 'ok/ok' and pg_temp.clues(rid) = 'generation:' || sgen, 'K2b warm by type: the first clue reveals the GENERATION', t || ' ' || pg_temp.clues(rid));
  rid := gen_random_uuid();
  insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, mode, clue_max, clue_interval_seconds)
    values (rid, 'TNBBAD', md5('TNBBADa') || md5('TNBBADb'), secret, 'free', 5, 15);
  perform pg_temp.add(rid, 'Ana', pg_temp.hsh('k2', 5));
  perform pg_temp.add(rid, 'Beto', pg_temp.hsh('k2', 6));
  t := pg_temp.snd(rid, pg_temp.hsh('k2', 5), gw[1]) || '/' || pg_temp.snd(rid, pg_temp.hsh('k2', 6), tw[1]);
  perform pg_temp.tick(rid); perform pg_temp.step(rid);
  perform pg_temp.ck(2, pg_temp.clues(rid) = 'generation:' || sgen, 'K2c a tie (one of each): reserve rule, the generation', t || ' ' || pg_temp.clues(rid));
  rid := gen_random_uuid();
  insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, mode, clue_max, clue_interval_seconds)
    values (rid, 'TNBBAE', md5('TNBBAEa') || md5('TNBBAEb'), secret, 'free', 5, 15);
  perform pg_temp.add(rid, 'Ana', pg_temp.hsh('k2', 7));
  t := pg_temp.snd(rid, pg_temp.hsh('k2', 7), cw[1]);
  perform pg_temp.tick(rid); perform pg_temp.step(rid);
  perform pg_temp.ck(2, t = 'ok' and pg_temp.clues(rid) = 'generation:' || sgen, 'K2d only a cold attempt: the generation', t || ' ' || pg_temp.clues(rid));
  secret := mono;
  rid := gen_random_uuid();
  insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, mode, clue_max, clue_interval_seconds)
    values (rid, 'TNBBAF', md5('TNBBAFa') || md5('TNBBAFb'), secret, 'free', 5, 15);
  secret := 1;
  perform pg_temp.tick(rid); perform pg_temp.step(rid); perform pg_temp.step(rid); perform pg_temp.step(rid); perform pg_temp.step(rid);
  t := pg_temp.clues(rid);
  perform pg_temp.ck(2, t = 'generation:' || (select generacion from public.pokemon where id = mono) || ',type:' || (select tipos_es[1] from public.pokemon where id = mono), 'K2e a single-type secret has only 2 clues: generation and its type', t);

  raise exception E'RESULT part %: TOTAL % / FAILS %\n%', 2, coalesce(current_setting('sim.total', true), '0'), coalesce(nullif(current_setting('sim.fails', true), ''), '0'), coalesce(current_setting('sim.rep', true), '');
end
$do$;
