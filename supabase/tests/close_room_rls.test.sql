begin;
select plan(19);

-- Fixtures (as postgres): room A (open, with players and attempts), room B (open, must stay untouched).
insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id) values ('00000000-0000-0000-0000-0000000006a1', 'CLSAAA', repeat('a', 64), 1);
insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id) values ('00000000-0000-0000-0000-0000000006b1', 'CLSBBB', repeat('b', 64), 4);
insert into public.players (room_id, nickname, session_hash) values ('00000000-0000-0000-0000-0000000006a1', 'Ana', repeat('1', 64));
insert into public.players (room_id, nickname, session_hash) values ('00000000-0000-0000-0000-0000000006a1', 'Beto', repeat('2', 64));
insert into public.players (room_id, nickname, session_hash) values ('00000000-0000-0000-0000-0000000006b1', 'Cris', repeat('3', 64));
do $$ begin
  perform public.submit_attempt('00000000-0000-0000-0000-0000000006a1', repeat('1', 64), 2);
  perform public.submit_attempt('00000000-0000-0000-0000-0000000006b1', repeat('3', 64), 2);
  perform public.post_chat_message('00000000-0000-0000-0000-0000000006a1', repeat('1', 64), 'hola');
  perform public.post_admin_chat_message('00000000-0000-0000-0000-0000000006a1', 'bienvenidos');
  perform public.post_chat_message('00000000-0000-0000-0000-0000000006b1', repeat('3', 64), 'sigo aqui');
end $$;

-- Privileges: only service_role may call it, nobody gets direct write access to rooms or players
select is(has_function_privilege('anon', 'public.close_room(uuid)', 'execute'), false, 'anon cannot call close_room');
select is(has_function_privilege('authenticated', 'public.close_room(uuid)', 'execute'), false, 'authenticated cannot call close_room');
select is(has_function_privilege('service_role', 'public.close_room(uuid)', 'execute'), true, 'service_role can call close_room');
select is(has_table_privilege('service_role', 'public.rooms', 'update'), false, 'service_role still has no direct UPDATE on rooms');
select is(has_table_privilege('service_role', 'public.players', 'delete'), false, 'service_role still has no direct DELETE on players');

-- Behavior
select is(public.close_room('00000000-0000-0000-0000-0000000006a1'), true, 'closing an open room returns true');
select is((select status from public.rooms where id = '00000000-0000-0000-0000-0000000006a1'), 'closed', 'room A is closed');
select isnt((select closed_at from public.rooms where id = '00000000-0000-0000-0000-0000000006a1'), null, 'closed_at is set');
select is((select count(*)::int from public.attempts where room_id = '00000000-0000-0000-0000-0000000006a1'), 0, 'attempts of room A are erased');
select is((select count(*)::int from public.players where room_id = '00000000-0000-0000-0000-0000000006a1'), 0, 'players (nicknames) of room A are erased');
select is((select count(*)::int from public.rooms where id = '00000000-0000-0000-0000-0000000006a1'), 1, 'the room row stays, so the link answers "not available"');
select is((select count(*)::int from public.players where room_id = '00000000-0000-0000-0000-0000000006b1'), 1, 'room B players untouched');
select is((select count(*)::int from public.attempts where room_id = '00000000-0000-0000-0000-0000000006b1'), 1, 'room B attempts untouched');
select is((select status from public.rooms where id = '00000000-0000-0000-0000-0000000006b1'), 'open', 'room B stays open');
select is((select count(*)::int from public.chat_messages where room_id = '00000000-0000-0000-0000-0000000006a1'), 0, 'chat of room A is erased, including the admin messages');
select is((select count(*)::int from public.chat_messages where room_id = '00000000-0000-0000-0000-0000000006b1'), 1, 'room B chat untouched');
select is(public.close_room('00000000-0000-0000-0000-0000000006a1'), false, 'closing twice returns false');
select is(public.close_room('00000000-0000-0000-0000-000000000000'), false, 'closing an unknown room returns false');
select is((select o_outcome from public.submit_attempt('00000000-0000-0000-0000-0000000006a1', repeat('1', 64), 2)), 'room_closed', 'a closed room accepts no attempts');

select * from finish();
rollback;
