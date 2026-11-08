begin;
select plan(32);

-- Steps 9+10: waiting room, start timer and admin-defined wait between attempts.
-- Fixtures (as postgres): A waiting (deadline in 1 h, wait 3 s), B waiting and already due, C playing (wait 2 s, created the old way), D waiting and due.
insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, phase, start_deadline_at, attempt_cooldown_seconds) values ('00000000-0000-0000-0000-0000000009a1', 'WTAAAA', repeat('a', 64), 1, 'waiting', now() + interval '1 hour', 3);
insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, phase, start_deadline_at) values ('00000000-0000-0000-0000-0000000009b1', 'WTBBBB', repeat('b', 64), 1, 'waiting', now() - interval '1 minute');
insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, attempt_cooldown_seconds) values ('00000000-0000-0000-0000-0000000009c1', 'WTCCCC', repeat('c', 64), 1, 2);
insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, phase, start_deadline_at) values ('00000000-0000-0000-0000-0000000009d1', 'WTDDDD', repeat('d', 64), 1, 'waiting', now() - interval '1 minute');
insert into public.players (room_id, nickname, session_hash) values ('00000000-0000-0000-0000-0000000009a1', 'Ana', repeat('a', 64));
insert into public.players (room_id, nickname, session_hash) values ('00000000-0000-0000-0000-0000000009b1', 'Beto', repeat('b', 64));
insert into public.players (room_id, nickname, session_hash) values ('00000000-0000-0000-0000-0000000009c1', 'Cami', repeat('c', 64));
insert into public.players (room_id, nickname, session_hash) values ('00000000-0000-0000-0000-0000000009d1', 'Dani', repeat('d', 64));

-- Defaults and constraints
select is((select phase || '/' || attempt_cooldown_seconds || '/' || coalesce(start_deadline_at::text, 'null') from public.rooms where id = '00000000-0000-0000-0000-0000000009c1'), 'playing/2/null', 'a room created without phase is playing with no deadline');
select throws_ok($$insert into public.rooms (room_code, admin_code_hash, secret_pokemon_id, phase) values ('WTEEEE', repeat('e', 64), 1, 'waiting')$$, '23514', null, 'a waiting room needs a deadline');
select throws_ok($$insert into public.rooms (room_code, admin_code_hash, secret_pokemon_id, attempt_cooldown_seconds) values ('WTFFFF', repeat('f', 64), 1, 121)$$, '23514', null, 'wait above 120 s refused');
select throws_ok($$insert into public.rooms (room_code, admin_code_hash, secret_pokemon_id, attempt_cooldown_seconds) values ('WTFFFF', repeat('f', 64), 1, 0)$$, '23514', null, 'wait below 1 s refused');
select throws_ok($$insert into public.rooms (room_code, admin_code_hash, secret_pokemon_id, phase, start_deadline_at) values ('WTGGGG', repeat('9', 64), 1, 'paused', now())$$, '23514', null, 'unknown phase refused');

-- Waiting room refuses attempts; strangers are told apart first
select is((select o_outcome from public.submit_attempt('00000000-0000-0000-0000-0000000009a1', repeat('a', 64), 4)), 'not_started', 'waiting room: attempt refused with not_started');
select is((select o_outcome from public.submit_attempt('00000000-0000-0000-0000-0000000009a1', repeat('9', 64), 4)), 'not_player', 'waiting room: a stranger gets not_player');
select is((select count(*)::int from public.attempts where room_id = '00000000-0000-0000-0000-0000000009a1'), 0, 'waiting room: nothing was stored');

-- Start timer, applied once
select is((select o_phase from public.apply_due_timers('00000000-0000-0000-0000-0000000009a1')), 'waiting', 'timer not due: stays waiting');
select is((select o_phase from public.apply_due_timers('00000000-0000-0000-0000-0000000009b1')), 'playing', 'timer due: becomes playing');
select is((select o_phase from public.apply_due_timers('00000000-0000-0000-0000-0000000009b1')), 'playing', 'second call: still playing (idempotent)');
select is((select (o_server_now is not null and o_start_deadline_at is not null) from public.apply_due_timers('00000000-0000-0000-0000-0000000009b1')), true, 'returns the deadline and the database clock');
select is((select count(*)::int from public.apply_due_timers('00000000-0000-0000-0000-000000000000')), 0, 'unknown room: no row');
select is((select o_outcome from public.submit_attempt('00000000-0000-0000-0000-0000000009b1', repeat('b', 64), 4)), 'ok', 'after the timer the room accepts attempts');
select is((select o_outcome from public.submit_attempt('00000000-0000-0000-0000-0000000009d1', repeat('d', 64), 4)), 'ok', 'due but not applied yet: the first attempt starts the room and is accepted');
select is((select phase from public.rooms where id = '00000000-0000-0000-0000-0000000009d1'), 'playing', 'and the phase is now playing');

-- start_room (admin "start now")
select is(public.start_room('00000000-0000-0000-0000-0000000009a1'), true, 'start_room starts a waiting room');
select is(public.start_room('00000000-0000-0000-0000-0000000009a1'), false, 'start_room twice: false');
select is(public.start_room('00000000-0000-0000-0000-0000000009c1'), false, 'start_room on a playing room: false');
select is((select o_outcome from public.submit_attempt('00000000-0000-0000-0000-0000000009a1', repeat('a', 64), 4)), 'ok', 'started room accepts attempts');

-- Wait between attempts
select is((select o_outcome || ':' || (o_retry_after between 1 and 3) from public.submit_attempt('00000000-0000-0000-0000-0000000009a1', repeat('a', 64), 2)), 'cooldown:true', 'wait 3 s: second attempt refused with 1..3 s left');
select is((select o_outcome from public.submit_attempt('00000000-0000-0000-0000-0000000009c1', repeat('c', 64), 4)), 'ok', 'room C first attempt ok');
select is((select o_outcome from public.submit_attempt('00000000-0000-0000-0000-0000000009c1', repeat('c', 64), 2)), 'cooldown', 'room C wait 2 s: refused');
select is(public.set_attempt_cooldown('00000000-0000-0000-0000-0000000009c1', 1), true, 'set_attempt_cooldown changes an open room');
select pg_sleep(1.2);
select is((select o_outcome from public.submit_attempt('00000000-0000-0000-0000-0000000009c1', repeat('c', 64), 2)), 'ok', 'after lowering to 1 s and waiting 1.2 s the attempt is accepted');
select throws_ok($$select public.set_attempt_cooldown('00000000-0000-0000-0000-0000000009c1', 0)$$, '23514', null, 'set_attempt_cooldown 0 refused');
select throws_ok($$select public.set_attempt_cooldown('00000000-0000-0000-0000-0000000009c1', 121)$$, '23514', null, 'set_attempt_cooldown 121 refused');
select is(public.set_attempt_cooldown('00000000-0000-0000-0000-000000000000', 5), false, 'set_attempt_cooldown unknown room: false');

-- close_room still works on a waiting room and the helpers answer nothing afterwards
select is(public.close_room('00000000-0000-0000-0000-0000000009d1'), true, 'close_room works');
select is(public.start_room('00000000-0000-0000-0000-0000000009d1'), false, 'start_room on a closed room: false');

-- Privileges: service_role only; still no UPDATE on rooms
select is((select string_agg(f || ':' || (has_function_privilege('service_role', f, 'execute') and not has_function_privilege('anon', f, 'execute') and not has_function_privilege('authenticated', f, 'execute'))::text, ',' order by f) from unnest(array['public.submit_attempt(uuid,text,integer)','public.apply_due_timers(uuid)','public.start_room(uuid)','public.set_attempt_cooldown(uuid,integer)']) f), 'public.apply_due_timers(uuid):true,public.set_attempt_cooldown(uuid,integer):true,public.start_room(uuid):true,public.submit_attempt(uuid,text,integer):true', 'only service_role can execute the four functions');
select is(has_table_privilege('service_role', 'public.rooms', 'update'), false, 'service_role still has no UPDATE on rooms');

select * from finish();
rollback;
