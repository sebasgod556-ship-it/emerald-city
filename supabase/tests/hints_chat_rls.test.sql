begin;
select plan(44);

-- Fixtures (as postgres): room A open (secret Bulbasaur, id 1) with Ana and Beto; room C closed.
insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id) values ('00000000-0000-0000-0000-0000000007a1', 'CHTAAA', repeat('a', 64), 1);
insert into public.rooms (id, room_code, admin_code_hash, secret_pokemon_id, status, closed_at) values ('00000000-0000-0000-0000-0000000007c1', 'CHTCCC', repeat('c', 64), 1, 'closed', now());
insert into public.players (room_id, nickname, session_hash) values ('00000000-0000-0000-0000-0000000007a1', 'Ana', repeat('1', 64));
insert into public.players (room_id, nickname, session_hash) values ('00000000-0000-0000-0000-0000000007a1', 'Beto', repeat('2', 64));

select is((select relrowsecurity from pg_class where oid = 'public.chat_messages'::regclass), true, 'RLS enabled on chat_messages');
select is((select count(*)::int from pg_policies where tablename = 'chat_messages'), 0, 'chat_messages has no policies (deny by default)');
select is(has_table_privilege('anon', 'public.chat_messages', 'select'), false, 'anon has no select on chat_messages');
select is(has_table_privilege('anon', 'public.chat_messages', 'insert'), false, 'anon has no insert on chat_messages');
select is(has_table_privilege('anon', 'public.chat_messages', 'update'), false, 'anon has no update on chat_messages');
select is(has_table_privilege('anon', 'public.chat_messages', 'delete'), false, 'anon has no delete on chat_messages');
select is(has_table_privilege('authenticated', 'public.chat_messages', 'select'), false, 'authenticated has no select on chat_messages');
select is(has_table_privilege('authenticated', 'public.chat_messages', 'insert'), false, 'authenticated has no insert on chat_messages');
select is(has_table_privilege('authenticated', 'public.chat_messages', 'update'), false, 'authenticated has no update on chat_messages');
select is(has_table_privilege('authenticated', 'public.chat_messages', 'delete'), false, 'authenticated has no delete on chat_messages');
select is(has_table_privilege('service_role', 'public.chat_messages', 'select'), false, 'service_role has no select on chat_messages');
select is(has_table_privilege('service_role', 'public.chat_messages', 'insert'), false, 'service_role has no insert on chat_messages');
select is(has_table_privilege('service_role', 'public.chat_messages', 'update'), false, 'service_role has no update on chat_messages');
select is(has_table_privilege('service_role', 'public.chat_messages', 'delete'), false, 'service_role has no delete on chat_messages');
select is((select string_agg(r || '=' || has_function_privilege(r, 'public.was_tried(uuid,integer)', 'execute')::text, ',' order by r) from unnest(array['anon','authenticated','service_role']) r), 'anon=false,authenticated=false,service_role=true', 'only service_role can execute was_tried');
select is((select string_agg(r || '=' || has_function_privilege(r, 'public.list_hints(uuid)', 'execute')::text, ',' order by r) from unnest(array['anon','authenticated','service_role']) r), 'anon=false,authenticated=false,service_role=true', 'only service_role can execute list_hints');
select is((select string_agg(r || '=' || has_function_privilege(r, 'public.post_chat_message(uuid,text,text)', 'execute')::text, ',' order by r) from unnest(array['anon','authenticated','service_role']) r), 'anon=false,authenticated=false,service_role=true', 'only service_role can execute post_chat_message');
select is((select string_agg(r || '=' || has_function_privilege(r, 'public.post_admin_chat_message(uuid,text)', 'execute')::text, ',' order by r) from unnest(array['anon','authenticated','service_role']) r), 'anon=false,authenticated=false,service_role=true', 'only service_role can execute post_admin_chat_message');
select is((select string_agg(r || '=' || has_function_privilege(r, 'public.list_chat(uuid,bigint,integer)', 'execute')::text, ',' order by r) from unnest(array['anon','authenticated','service_role']) r), 'anon=false,authenticated=false,service_role=true', 'only service_role can execute list_chat');
select is(public.was_tried('00000000-0000-0000-0000-0000000007a1', 4), false, 'was_tried is false at the start');

-- Attempts: Charmander (4) warm, Ivysaur (2) fire, Mr. Mime de Galar (152) cold, Chikorita (188) warm.
do $$ begin
  perform public.submit_attempt('00000000-0000-0000-0000-0000000007a1', repeat('1', 64), 4);
  perform public.submit_attempt('00000000-0000-0000-0000-0000000007a1', repeat('2', 64), 2);
  perform pg_sleep(1.1);
  perform public.submit_attempt('00000000-0000-0000-0000-0000000007a1', repeat('1', 64), 152);
  perform public.submit_attempt('00000000-0000-0000-0000-0000000007a1', repeat('2', 64), 188);
end $$;

select is(public.was_tried('00000000-0000-0000-0000-0000000007a1', 4), true, 'was_tried is true after an attempt');
select is(public.was_tried('00000000-0000-0000-0000-0000000007a1', 152), true, 'was_tried is true for a cold Pokémon');
select is(public.was_tried('00000000-0000-0000-0000-0000000007a1', 25), false, 'was_tried is false for an untried Pokémon');
select is(public.was_tried('00000000-0000-0000-0000-0000000007c1', 4), false, 'was_tried is scoped to the room');
select is((select string_agg(o_result || ':' || o_pokemon, ',') from public.list_hints('00000000-0000-0000-0000-0000000007a1')), 'fire:Ivysaur,warm:Charmander,warm:Chikorita', 'hints: fire first, then warm, no cold');
select is((select count(*)::int from public.list_hints('00000000-0000-0000-0000-0000000007a1')), 3, 'hints do not duplicate a repeated Pokémon');

select is((select o_outcome from public.post_chat_message('00000000-0000-0000-0000-0000000007a1', repeat('1', 64), 'hola a todos')), 'ok', 'a player can post');
select is((select o_outcome from public.post_admin_chat_message('00000000-0000-0000-0000-0000000007a1', 'bienvenidos')), 'ok', 'the admin can post');
select is((select o_outcome from public.post_chat_message('00000000-0000-0000-0000-0000000007a1', repeat('9', 64), 'x')), 'not_player', 'unknown session cannot post');
select is((select o_outcome from public.post_chat_message('00000000-0000-0000-0000-0000000007c1', repeat('1', 64), 'x')), 'room_closed', 'closed room rejects posts');
select is((select o_outcome from public.post_admin_chat_message('00000000-0000-0000-0000-0000000007c1', 'x')), 'room_closed', 'closed room rejects admin posts');
select is((select o_outcome from public.post_chat_message('00000000-0000-0000-0000-000000000000', repeat('1', 64), 'x')), 'unknown_room', 'unknown room');
select is((select o_outcome from public.post_chat_message('00000000-0000-0000-0000-0000000007a1', repeat('1', 64), '')), 'invalid', 'empty message is invalid');
select is((select o_outcome from public.post_chat_message('00000000-0000-0000-0000-0000000007a1', repeat('1', 64), repeat('x', 201))), 'invalid', '201 characters is invalid');
select is((select o_outcome from public.post_chat_message('00000000-0000-0000-0000-0000000007a1', repeat('1', 64), E'a\nb')), 'invalid', 'control characters are invalid');
select is((select o_outcome from public.post_chat_message('00000000-0000-0000-0000-0000000007a1', repeat('2', 64), repeat('x', 200))), 'ok', '200 characters is valid');

-- Ana already sent 1 message; 9 more fit in the minute, so the next one is the 11th.
do $$ begin
  for i in 1..9 loop perform public.post_chat_message('00000000-0000-0000-0000-0000000007a1', repeat('1', 64), 'm' || i); end loop;
end $$;

select is((select o_outcome from public.post_chat_message('00000000-0000-0000-0000-0000000007a1', repeat('1', 64), 'one too many')), 'rate_limited', 'the 11th message in a minute is rate limited');
select is((select o_outcome from public.post_chat_message('00000000-0000-0000-0000-0000000007a1', repeat('2', 64), 'yo sigo')), 'ok', 'another player is not affected by the limit');
select is((select count(*)::int from public.list_chat('00000000-0000-0000-0000-0000000007a1', null, 50)), 13, 'chat has 13 stored messages');
select is((select o_nickname || ':' || o_body from public.list_chat('00000000-0000-0000-0000-0000000007a1', null, 50) order by o_id limit 1), 'Ana:hola a todos', 'chat is oldest first with the nickname');
select is((select o_nickname || ':' || o_is_admin::text from public.list_chat('00000000-0000-0000-0000-0000000007a1', null, 50) where o_body = 'bienvenidos'), 'Admin:true', 'admin messages are flagged and named Admin');
select is((select string_agg(o_nickname, ',' order by o_id) from public.list_chat('00000000-0000-0000-0000-0000000007a1', null, 2)), 'Ana,Beto', 'latest 2 messages, oldest first');
select is((select count(*)::int from public.list_chat('00000000-0000-0000-0000-0000000007a1', (select o_id from public.list_chat('00000000-0000-0000-0000-0000000007a1', null, 50) order by o_id offset 10 limit 1), 50)), 2, 'chat cursor returns only newer messages');
select is((select count(*)::int from public.list_chat('00000000-0000-0000-0000-0000000007c1', null, 50)), 0, 'chat is scoped to its room');

select * from finish();
rollback;
