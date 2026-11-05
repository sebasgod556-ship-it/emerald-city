begin;
select plan(20);

-- Fixtures (as postgres): one open room and one closed room.
insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id)
values ('00000000-0000-0000-0000-0000000000a1', 'TESTAB', repeat('b', 64), 1);
insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, status, closed_at)
values ('00000000-0000-0000-0000-0000000000c1', 'TESTCD', repeat('c', 64), 1, 'closed', now());

-- Structure
select ok((select relrowsecurity from pg_class where oid = 'public.players'::regclass), 'RLS enabled on players');
select is((select count(*)::int from pg_policies where tablename = 'players'), 0, 'players has no policies (deny by default)');

-- anon: no operation allowed
set local role anon;
select throws_ok($$select 1 from public.players$$, '42501', null, 'anon SELECT denied');
select throws_ok($$insert into public.players (room_id, nickname, session_hash) values ('00000000-0000-0000-0000-0000000000a1', 'Hack', repeat('6', 64))$$, '42501', null, 'anon INSERT denied');
select throws_ok($$update public.players set nickname = 'Hack'$$, '42501', null, 'anon UPDATE denied');
select throws_ok($$delete from public.players$$, '42501', null, 'anon DELETE denied');
reset role;

-- authenticated: no operation allowed
set local role authenticated;
select throws_ok($$select 1 from public.players$$, '42501', null, 'authenticated SELECT denied');
select throws_ok($$insert into public.players (room_id, nickname, session_hash) values ('00000000-0000-0000-0000-0000000000a1', 'Hack', repeat('6', 64))$$, '42501', null, 'authenticated INSERT denied');
select throws_ok($$update public.players set nickname = 'Hack'$$, '42501', null, 'authenticated UPDATE denied');
select throws_ok($$delete from public.players$$, '42501', null, 'authenticated DELETE denied');
reset role;

-- service_role: SELECT and INSERT only
set local role service_role;
select lives_ok($$insert into public.players (room_id, nickname, session_hash) values ('00000000-0000-0000-0000-0000000000a1', 'Ana', repeat('1', 64))$$, 'service_role INSERT allowed');
select lives_ok($$select 1 from public.players$$, 'service_role SELECT allowed');
select throws_ok($$update public.players set nickname = 'Zed'$$, '42501', null, 'service_role UPDATE denied');
select throws_ok($$delete from public.players$$, '42501', null, 'service_role DELETE denied');

-- Data rules (still as service_role)
select throws_ok($$insert into public.players (room_id, nickname, session_hash) values ('00000000-0000-0000-0000-0000000000a1', 'ANÁ', repeat('2', 64))$$, '23505', null, 'duplicate nickname ignoring case and accents');
select throws_ok($$insert into public.players (room_id, nickname, session_hash) values ('00000000-0000-0000-0000-0000000000a1', 'A', repeat('3', 64))$$, '23514', null, 'nickname too short');
select throws_ok($$insert into public.players (room_id, nickname, session_hash) values ('00000000-0000-0000-0000-0000000000a1', ' Luis', repeat('4', 64))$$, '23514', null, 'nickname with surrounding spaces');
select throws_ok($$insert into public.players (room_id, nickname, session_hash) values ('00000000-0000-0000-0000-0000000000a1', '🔥🔥', repeat('5', 64))$$, '23514', null, 'nickname without letters or digits');
reset role;

-- Capacity: fill the room to 100 (as postgres), then the 101st is blocked.
insert into public.players (room_id, nickname, session_hash)
select '00000000-0000-0000-0000-0000000000a1', 'Jugador' || g, lpad(to_hex(g), 64, '0')
from generate_series(100, 198) g;
set local role service_role;
select throws_ok($$insert into public.players (room_id, nickname, session_hash) values ('00000000-0000-0000-0000-0000000000a1', 'Extra', repeat('7', 64))$$, '53400', 'room full', '101st player blocked');

-- Closed room
select throws_ok($$insert into public.players (room_id, nickname, session_hash) values ('00000000-0000-0000-0000-0000000000c1', 'Tarde', repeat('8', 64))$$, 'P0001', 'room closed', 'joining a closed room blocked');
reset role;

select * from finish();
rollback;
