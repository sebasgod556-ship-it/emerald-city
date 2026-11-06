begin;
select plan(44);

-- Fixtures (as postgres). Secret Pokémon: Bulbasaur (id 1: Planta/Veneno, gen 1) in room A, Charmander (id 4) in room B.
-- Guesses used: Ivysaur 2 (same type + gen = fire), Charmander 4 (gen only = warm),
-- Chikorita 188 (type only = warm), Mr. Mime de Galar 152 (nothing = cold).
insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id) values ('00000000-0000-0000-0000-0000000005a1', 'ATTAAA', repeat('a', 64), 1);
insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id) values ('00000000-0000-0000-0000-0000000005b1', 'ATTBBB', repeat('b', 64), 4);
insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id) values ('00000000-0000-0000-0000-0000000005c1', 'ATTCCC', repeat('c', 64), 1);
insert into public.players (room_id, nickname, session_hash) values ('00000000-0000-0000-0000-0000000005a1', 'Ana', repeat('1', 64));
insert into public.players (room_id, nickname, session_hash) values ('00000000-0000-0000-0000-0000000005a1', 'Beto', repeat('2', 64));
insert into public.players (room_id, nickname, session_hash) values ('00000000-0000-0000-0000-0000000005a1', 'Cris', repeat('3', 64));
insert into public.players (room_id, nickname, session_hash) values ('00000000-0000-0000-0000-0000000005b1', 'Dana', repeat('4', 64));
insert into public.players (room_id, nickname, session_hash) values ('00000000-0000-0000-0000-0000000005c1', 'Eva', repeat('5', 64));
update public.rooms set status = 'closed', closed_at = now() where id = '00000000-0000-0000-0000-0000000005c1';

-- Structure
select ok((select relrowsecurity from pg_class where oid = 'public.attempts'::regclass), 'RLS enabled on attempts');
select is((select count(*)::int from pg_policies where tablename = 'attempts'), 0, 'attempts has no policies (deny by default)');
select ok(not (pg_get_function_result('public.list_attempts(uuid,bigint,integer)'::regprocedure) ~ 'tipos|generacion'), 'list_attempts exposes no types or generation');

-- anon: nothing on the table, no function
set local role anon;
select throws_ok($$select 1 from public.attempts$$, '42501', null, 'anon SELECT denied');
select throws_ok($$insert into public.attempts (room_id, player_id, pokemon_id, result) select room_id, id, 1, 'cold' from public.players$$, '42501', null, 'anon INSERT denied');
select throws_ok($$update public.attempts set result = 'fire'$$, '42501', null, 'anon UPDATE denied');
select throws_ok($$delete from public.attempts$$, '42501', null, 'anon DELETE denied');
select throws_ok($$select * from public.submit_attempt('00000000-0000-0000-0000-0000000005a1', repeat('1', 64), 1)$$, '42501', null, 'anon cannot call submit_attempt');
select throws_ok($$select * from public.list_attempts('00000000-0000-0000-0000-0000000005a1', null, 10)$$, '42501', null, 'anon cannot call list_attempts');
reset role;

-- authenticated: same
set local role authenticated;
select throws_ok($$select 1 from public.attempts$$, '42501', null, 'authenticated SELECT denied');
select throws_ok($$insert into public.attempts (room_id, player_id, pokemon_id, result) select room_id, id, 1, 'cold' from public.players$$, '42501', null, 'authenticated INSERT denied');
select throws_ok($$update public.attempts set result = 'fire'$$, '42501', null, 'authenticated UPDATE denied');
select throws_ok($$delete from public.attempts$$, '42501', null, 'authenticated DELETE denied');
select throws_ok($$select * from public.submit_attempt('00000000-0000-0000-0000-0000000005a1', repeat('1', 64), 1)$$, '42501', null, 'authenticated cannot call submit_attempt');
select throws_ok($$select * from public.list_attempts('00000000-0000-0000-0000-0000000005a1', null, 10)$$, '42501', null, 'authenticated cannot call list_attempts');
reset role;

-- service_role: no direct table access either, only the two functions
set local role service_role;
select throws_ok($$select 1 from public.attempts$$, '42501', null, 'service_role SELECT denied (functions only)');
select throws_ok($$insert into public.attempts (room_id, player_id, pokemon_id, result) select room_id, id, 1, 'cold' from public.players$$, '42501', null, 'service_role INSERT denied (functions only)');
select throws_ok($$update public.attempts set result = 'fire'$$, '42501', null, 'service_role UPDATE denied');
select throws_ok($$delete from public.attempts$$, '42501', null, 'service_role DELETE denied');
select lives_ok($$select * from public.list_attempts('00000000-0000-0000-0000-0000000005a1', null, 10)$$, 'service_role can call list_attempts');

-- Hints, in room A as Ana (service_role). Each attempt is aged 5 seconds so the 1-per-second brake does not interfere.
select is((select o_outcome || ':' || o_result || ':' || o_is_winner from public.submit_attempt('00000000-0000-0000-0000-0000000005a1', repeat('1', 64), 4)), 'ok:warm:false', 'same generation only = warm');
select is((select o_outcome from public.submit_attempt('00000000-0000-0000-0000-0000000005a1', repeat('1', 64), 4)), 'cooldown', 'second attempt within 1 second = cooldown');
reset role;
update public.attempts set created_at = created_at - interval '5 seconds';
set local role service_role;
select is((select o_outcome || ':' || o_result || ':' || o_is_winner from public.submit_attempt('00000000-0000-0000-0000-0000000005a1', repeat('1', 64), 188)), 'ok:warm:false', 'same type only = warm');
reset role;
update public.attempts set created_at = created_at - interval '5 seconds';
set local role service_role;
select is((select o_outcome || ':' || o_result || ':' || o_is_winner from public.submit_attempt('00000000-0000-0000-0000-0000000005a1', repeat('1', 64), 152)), 'ok:cold:false', 'nothing in common = cold');
reset role;
update public.attempts set created_at = created_at - interval '5 seconds';
set local role service_role;
select is((select o_outcome || ':' || o_result || ':' || o_is_winner from public.submit_attempt('00000000-0000-0000-0000-0000000005a1', repeat('1', 64), 2)), 'ok:fire:false', 'same type and generation but not the secret = fire, not a win');

-- Winner: Beto guesses the secret; the room becomes finished
select is((select o_outcome || ':' || o_result || ':' || o_is_winner from public.submit_attempt('00000000-0000-0000-0000-0000000005a1', repeat('2', 64), 1)), 'ok:fire:true', 'the secret itself wins');
reset role;
select isnt((select finished_at from public.rooms where id = '00000000-0000-0000-0000-0000000005a1'), null, 'room A is finished after the win');
select is((select count(*)::int from public.attempts where room_id = '00000000-0000-0000-0000-0000000005a1' and is_winner), 1, 'exactly one winning attempt');
set local role service_role;
select is((select o_outcome from public.submit_attempt('00000000-0000-0000-0000-0000000005a1', repeat('3', 64), 1)), 'round_finished', 'attempts after the win are rejected');

-- Other outcomes
select is((select o_outcome from public.submit_attempt('00000000-0000-0000-0000-0000000005b1', repeat('9', 64), 1)), 'not_player', 'unknown session = not_player');
select is((select o_outcome from public.submit_attempt('00000000-0000-0000-0000-0000000005b1', repeat('1', 64), 1)), 'not_player', 'a session from another room cannot play here');
select is((select o_outcome from public.submit_attempt('00000000-0000-0000-0000-0000000005a1', repeat('9', 64), 1)), 'round_finished', 'finished room answers before checking the player');
select is((select o_outcome from public.submit_attempt('00000000-0000-0000-0000-0000000005b1', repeat('4', 64), 999999)), 'unknown_pokemon', 'unknown Pokémon id');
select is((select o_outcome from public.submit_attempt('00000000-0000-0000-0000-000000000000', repeat('4', 64), 1)), 'unknown_room', 'unknown room');
select is((select o_outcome from public.submit_attempt('00000000-0000-0000-0000-0000000005c1', repeat('5', 64), 1)), 'room_closed', 'closed room');
select is((select o_outcome || ':' || o_result || ':' || o_is_winner from public.submit_attempt('00000000-0000-0000-0000-0000000005b1', repeat('4', 64), 4)), 'ok:fire:true', 'a player of another room can win its own room');

-- Feed
select is((select count(*)::int from public.list_attempts('00000000-0000-0000-0000-0000000005a1', null, 50)), 5, 'feed: 5 stored attempts in room A (cooldown one not stored)');
select is((select string_agg(o_nickname || ':' || o_pokemon, ',' order by o_id) from public.list_attempts('00000000-0000-0000-0000-0000000005a1', null, 2)), 'Ana:Ivysaur,Beto:Bulbasaur', 'feed without cursor returns the latest N, oldest first');
select is((select count(*)::int from public.list_attempts('00000000-0000-0000-0000-0000000005a1', (select o_id from public.list_attempts('00000000-0000-0000-0000-0000000005a1', null, 50) order by o_id offset 3 limit 1), 50)), 1, 'feed with cursor returns only newer attempts');
select is((select count(*)::int from public.list_attempts('00000000-0000-0000-0000-0000000005b1', null, 50)), 1, 'feed is scoped to its room');
reset role;

-- Data rules (as postgres)
select throws_ok($$insert into public.attempts (room_id, player_id, pokemon_id, result, is_winner) select room_id, id, 1, 'fire', true from public.players where nickname = 'Ana'$$, '23505', null, 'a second winner in the same room is impossible');
select throws_ok($$insert into public.attempts (room_id, player_id, pokemon_id, result, is_winner) select room_id, id, 1, 'cold', true from public.players where nickname = 'Cris'$$, '23514', null, 'a winner must be a fire result');
select throws_ok($$insert into public.attempts (room_id, player_id, pokemon_id, result) select room_id, id, 1, 'hot' from public.players where nickname = 'Cris'$$, '23514', null, 'invalid result value rejected');
delete from public.rooms where id = '00000000-0000-0000-0000-0000000005a1';
select is((select count(*)::int from public.attempts where room_id = '00000000-0000-0000-0000-0000000005a1'), 0, 'deleting a room deletes its attempts');

select * from finish();
rollback;
