begin;
select plan(28);

-- Steps 11+12: turn mode, presence and kicking. Fixtures run as postgres.
-- T: turns, arrival order, playing. W: turns, lobby not due. F: free mode (regression).
insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, mode, turn_order, turn_seconds) values ('00000000-0000-0000-0000-0000000011a1', 'TKAAAA', repeat('a', 64), 1, 'turns', 'arrival', 20);
insert into public.players (room_id, nickname, session_hash) values ('00000000-0000-0000-0000-0000000011a1', 'Ana', repeat('a', 64));
insert into public.players (room_id, nickname, session_hash) values ('00000000-0000-0000-0000-0000000011a1', 'Beto', repeat('b', 64));
insert into public.players (room_id, nickname, session_hash) values ('00000000-0000-0000-0000-0000000011a1', 'Cami', repeat('c', 64));
insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, mode, turn_order, phase, start_deadline_at) values ('00000000-0000-0000-0000-0000000011b1', 'TKBBBB', repeat('b', 64), 1, 'turns', 'random', 'waiting', now() + interval '5 minutes');
insert into public.players (room_id, nickname, session_hash) values ('00000000-0000-0000-0000-0000000011b1', 'Dani', repeat('d', 64));
insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, attempt_cooldown_seconds) values ('00000000-0000-0000-0000-0000000011f1', 'TKFFFF', repeat('f', 64), 1, 3);
insert into public.players (room_id, nickname, session_hash) values ('00000000-0000-0000-0000-0000000011f1', 'Eli', repeat('e', 64));

-- Defaults and constraints
select is((select mode || '/' || turn_order || '/' || turn_seconds from public.rooms where id = '00000000-0000-0000-0000-0000000011f1'), 'free/random/20', 'a room created the old way is free mode');
select throws_ok($$insert into public.rooms (room_code, admin_code_hash, secret_pokemon_id, mode) values ('TKXXXX', repeat('9', 64), 1, 'chaos')$$, '23514', null, 'unknown mode refused');
select throws_ok($$insert into public.rooms (room_code, admin_code_hash, secret_pokemon_id, turn_seconds) values ('TKXXXX', repeat('9', 64), 1, 4)$$, '23514', null, 'turn shorter than 5 s refused');
select throws_ok($$insert into public.rooms (room_code, admin_code_hash, secret_pokemon_id, turn_seconds) values ('TKXXXX', repeat('9', 64), 1, 121)$$, '23514', null, 'turn longer than 120 s refused');

-- Queue
select is((select string_agg(nickname, ',' order by turn_rank) from public.players where room_id = '00000000-0000-0000-0000-0000000011a1'), 'Ana,Beto,Cami', 'arrival queue follows the order of entry');
select is((select turn_rank < 1 from public.players where room_id = '00000000-0000-0000-0000-0000000011b1'), true, 'random queue in a lobby: rank in [0,1)');

-- Turns
select is((select o_turn_nickname from public.apply_due_timers('00000000-0000-0000-0000-0000000011a1')), 'Ana', 'first turn goes to the first arrival');
select is((select o_outcome from public.submit_attempt('00000000-0000-0000-0000-0000000011a1', repeat('b', 64), 4)), 'not_your_turn', 'player without the turn refused');
select is((select o_outcome from public.submit_attempt('00000000-0000-0000-0000-0000000011a1', repeat('a', 64), 4)), 'ok', 'player with the turn accepted');
select is((select o_turn_nickname from public.apply_due_timers('00000000-0000-0000-0000-0000000011a1')), 'Beto', 'the turn passed to the next player');
select is((select o_outcome from public.submit_attempt('00000000-0000-0000-0000-0000000011a1', repeat('b', 64), 4)), 'ok', 'Beto accepted');
select is((select o_outcome from public.submit_attempt('00000000-0000-0000-0000-0000000011a1', repeat('c', 64), 4)), 'ok', 'Cami accepted');
select is((select o_outcome from public.submit_attempt('00000000-0000-0000-0000-0000000011a1', repeat('a', 64), 4)), 'ok', 'Ana again right away: no wait between attempts in turn mode');

-- Timeout: the deadline passes, the turn moves once
update public.rooms set turn_deadline_at = clock_timestamp() - interval '1 second' where id = '00000000-0000-0000-0000-0000000011a1';
select is((select o_turn_nickname from public.apply_due_timers('00000000-0000-0000-0000-0000000011a1')), 'Cami', 'expired turn passes to the next player');
select is((select o_turn_deadline_at > clock_timestamp() from public.apply_due_timers('00000000-0000-0000-0000-0000000011a1')), true, 'and the new turn has a fresh deadline');

-- Away player skipped at once
update public.players set last_seen_at = clock_timestamp() - interval '60 seconds' where room_id = '00000000-0000-0000-0000-0000000011a1' and nickname = 'Cami';
select is((select o_turn_nickname <> 'Cami' from public.apply_due_timers('00000000-0000-0000-0000-0000000011a1')), true, 'a disconnected turn holder is skipped at once');

-- Presence ping
update public.players set last_seen_at = clock_timestamp() - interval '60 seconds' where room_id = '00000000-0000-0000-0000-0000000011a1' and nickname = 'Cami';
select lives_ok($$select public.touch_player('00000000-0000-0000-0000-0000000011a1', repeat('c', 64))$$, 'touch_player runs');
select is((select last_seen_at > clock_timestamp() - interval '5 seconds' from public.players where room_id = '00000000-0000-0000-0000-0000000011a1' and nickname = 'Cami'), true, 'touch_player refreshed the presence');

-- Kicking
select is(public.kick_player('00000000-0000-0000-0000-0000000011a1', 'cami'), 'ok', 'kick by nickname, case does not matter');
select is(public.kick_player('00000000-0000-0000-0000-0000000011a1', 'Cami'), 'not_found', 'kicking twice -> not_found');
select is((select o_outcome from public.submit_attempt('00000000-0000-0000-0000-0000000011a1', repeat('c', 64), 4)), 'kicked', 'kicked player cannot send');
select is((select o_outcome from public.post_chat_message('00000000-0000-0000-0000-0000000011a1', repeat('c', 64), 'hola')), 'kicked', 'kicked player cannot chat');
select throws_ok($$insert into public.players (room_id, nickname, session_hash) values ('00000000-0000-0000-0000-0000000011a1', 'Cami', repeat('7', 64))$$, '23505', null, 'a kicked nickname stays reserved');

-- Turn lobby
select is((select o_outcome from public.submit_attempt('00000000-0000-0000-0000-0000000011b1', repeat('d', 64), 4)), 'not_started', 'turn lobby refuses attempts');
select is(public.start_room('00000000-0000-0000-0000-0000000011b1'), true, 'start_room starts the turn lobby');
select is((select o_turn_nickname from public.apply_due_timers('00000000-0000-0000-0000-0000000011b1')), 'Dani', 'and hands out the first turn');

-- Free mode unchanged
select is((select o_outcome from public.submit_attempt('00000000-0000-0000-0000-0000000011f1', repeat('e', 64), 4)), 'ok', 'free room: attempt without a turn');
select is((select o_outcome from public.submit_attempt('00000000-0000-0000-0000-0000000011f1', repeat('e', 64), 2)), 'cooldown', 'free room: the wait between attempts still applies');

select * from finish();
rollback;
