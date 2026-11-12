-- Steps 11+12: verification by simulation, part 3 of 3 (kicking and the 100-player cap, free mode regression, privileges).
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
  -- ===== G4: kicking
  rid := gen_random_uuid();
  insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, mode, turn_order, turn_seconds)
    values (rid, 'TNAAAE', md5('9') || md5('10'), secret, 'turns', 'arrival', 20);
  hs := array[]::text[];
  for i in 1..4 loop
    hs := hs || (md5('g4-' || i) || md5(i || '-g4'));
    insert into public.players (room_id, nickname, session_hash) values (rid, nicks[i], hs[i]);
  end loop;
  t := (select o_turn_nickname from public.apply_due_timers(rid));
  seq0 := (select turn_seq from public.rooms where id = rid);
  t := (select public.kick_player(rid, 'ana'));
  perform pg_temp.ck(4, t = 'ok', 'kick by nickname (case does not matter) -> ok', t);
  holder := (select o_turn_nickname from public.apply_due_timers(rid));
  seq1 := (select turn_seq from public.rooms where id = rid);
  perform pg_temp.ck(4, holder = 'Beto' and seq1 = seq0 + 1, 'kicking the turn holder passes the turn at once', holder || '/' || seq1);
  t := (select o_outcome from public.submit_attempt(rid, hs[1], wrong));
  perform pg_temp.ck(4, t = 'kicked', 'kicked player cannot send', t);
  t := (select o_outcome from public.post_chat_message(rid, hs[1], 'sigo aqui'));
  perform pg_temp.ck(4, t = 'kicked', 'kicked player cannot chat', t);
  t := (select public.kick_player(rid, 'Ana'));
  perform pg_temp.ck(4, t = 'not_found', 'kicking the same player twice -> not_found', t);
  t := (select public.kick_player(rid, 'Zzz'));
  perform pg_temp.ck(4, t = 'not_found', 'kicking a stranger -> not_found', t);
  begin
    insert into public.players (room_id, nickname, session_hash) values (rid, 'Ana', md5('other') || md5('device'));
    perform pg_temp.ck(4, false, 'a kicked nickname stays reserved', 'accepted');
  exception when unique_violation then
    perform pg_temp.ck(4, true, 'a kicked nickname stays reserved', '23505');
  end;
  n := (select count(*) from public.players where room_id = rid and kicked_at is null);
  perform pg_temp.ck(4, n = 3, 'the kicked player no longer counts as in the room', n::text);
  -- kicked player never gets the turn again
  ord := '';
  for i in 1..6 loop
    holder := (select o_turn_nickname from public.apply_due_timers(rid));
    ord := ord || holder || ',';
    t := (select o_outcome from public.submit_attempt(rid, hs[array_position(nicks, holder)], wrong));
  end loop;
  perform pg_temp.ck(4, ord = 'Beto,Cami,Dani,Beto,Cami,Dani,', 'the queue skips the kicked player', ord);
  -- kick everybody: no holder, and reads do not keep writing
  perform public.kick_player(rid, 'Beto'); perform public.kick_player(rid, 'Cami'); perform public.kick_player(rid, 'Dani');
  n := (select count(*) from public.apply_due_timers(rid) where o_turn_nickname is not null);
  seq0 := (select turn_seq from public.rooms where id = rid);
  perform public.apply_due_timers(rid); perform public.apply_due_timers(rid);
  seq1 := (select turn_seq from public.rooms where id = rid);
  perform pg_temp.ck(4, n = 0 and seq0 = seq1, 'everybody kicked: nobody has the turn and reads do not write', n || '/' || seq0 || '/' || seq1);
  -- the 100-player cap ignores kicked players
  rid := gen_random_uuid();
  insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id) values (rid, 'TNAAAF', md5('11') || md5('12'), secret);
  for i in 1..100 loop
    insert into public.players (room_id, nickname, session_hash) values (rid, 'P' || i, md5('cap-' || i) || md5(i || '-cap'));
  end loop;
  begin
    insert into public.players (room_id, nickname, session_hash) values (rid, 'Extra1', md5('x1') || md5('x2'));
    perform pg_temp.ck(4, false, '101st player refused', 'accepted');
  exception when others then
    perform pg_temp.ck(4, sqlstate = '53400', '101st player refused (room full)', sqlstate);
  end;
  perform public.kick_player(rid, 'P1');
  begin
    insert into public.players (room_id, nickname, session_hash) values (rid, 'Extra2', md5('x3') || md5('x4'));
    perform pg_temp.ck(4, true, 'after kicking one, a new player fits', 'accepted');
  exception when others then
    perform pg_temp.ck(4, false, 'after kicking one, a new player fits', sqlstate);
  end;

  -- ===== G5: free mode is unchanged
  rid := gen_random_uuid();
  insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, attempt_cooldown_seconds)
    values (rid, 'TNAAAG', md5('13') || md5('14'), secret, 3);
  insert into public.players (room_id, nickname, session_hash) values (rid, 'Ana', md5('g5-1') || md5('1-g5')), (rid, 'Beto', md5('g5-2') || md5('2-g5'));
  n := (select count(*) from public.apply_due_timers(rid) where o_turn_nickname is null and o_turn_deadline_at is null and o_phase = 'playing');
  perform pg_temp.ck(5, n = 1, 'free room: apply_due_timers reports no turn', n::text);
  t := (select o_outcome from public.submit_attempt(rid, md5('g5-1') || md5('1-g5'), wrong));
  perform pg_temp.ck(5, t = 'ok', 'free room: anybody can send at any time (no turn needed)', t);
  t := (select o_outcome || ':' || (o_retry_after between 1 and 3) from public.submit_attempt(rid, md5('g5-1') || md5('1-g5'), 2));
  perform pg_temp.ck(5, t = 'cooldown:true', 'free room: the wait between attempts still applies', t);
  t := (select o_outcome from public.submit_attempt(rid, md5('g5-2') || md5('2-g5'), wrong));
  perform pg_temp.ck(5, t = 'ok', 'free room: the other player is not blocked', t);
  t := (select public.kick_player(rid, 'Beto'));
  t := (select o_outcome from public.submit_attempt(rid, md5('g5-2') || md5('2-g5'), wrong));
  perform pg_temp.ck(5, t = 'kicked', 'free room: kick works too', t);
  t := (select turn_seq || '/' || coalesce(turn_player_id::text, 'null') from public.rooms where id = rid);
  perform pg_temp.ck(5, t = '0/null', 'free room: the turn fields are never touched', t);

  -- ===== privileges
  for t in select unnest(array['public.kick_player(uuid,text)','public.touch_player(uuid,text)','public.apply_due_timers(uuid)','public.submit_attempt(uuid,text,integer)','public.start_room(uuid)','public.post_chat_message(uuid,text,text)']) loop
    perform pg_temp.ck(0, has_function_privilege('service_role', t, 'execute') and not has_function_privilege('anon', t, 'execute') and not has_function_privilege('authenticated', t, 'execute'), 'only service_role executes ' || t, '');
  end loop;
  for t in select unnest(array['public._advance_turn(uuid)','public._turn_tick(uuid)']) loop
    perform pg_temp.ck(0, not has_function_privilege('service_role', t, 'execute') and not has_function_privilege('anon', t, 'execute') and not has_function_privilege('authenticated', t, 'execute'), 'nobody can call the internal helper ' || t, '');
  end loop;
  perform pg_temp.ck(0, not has_table_privilege('service_role', 'public.players', 'update'), 'service_role still has no UPDATE on players', '');
  perform pg_temp.ck(0, not has_table_privilege('service_role', 'public.rooms', 'update'), 'service_role still has no UPDATE on rooms', '');
  perform pg_temp.ck(0, (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'apply_due_timers') = 1, 'exactly one apply_due_timers', '');

  raise exception E'RESULT part %: TOTAL % / FAILS %\n%', 3, coalesce(current_setting('sim.total', true), '0'), coalesce(nullif(current_setting('sim.fails', true), ''), '0'), coalesce(current_setting('sim.rep', true), '');
end
$do$;
