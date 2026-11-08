-- Steps 7+8: hints table, repeat warning and the stored chat.
-- Expand-only: one new table, one new index and five new functions. Nothing existing is changed.
-- The matching change to close_room() (it must also erase the chat) is the next migration.
--
-- ROLLBACK (documented, run manually if needed; it deletes every stored chat message):
--   drop function if exists public.list_chat(uuid, bigint, integer);
--   drop function if exists public.post_admin_chat_message(uuid, text);
--   drop function if exists public.post_chat_message(uuid, text, text);
--   drop function if exists public.list_hints(uuid);
--   drop function if exists public.was_tried(uuid, integer);
--   drop table if exists public.chat_messages;
--   drop index if exists public.attempts_room_pokemon_idx;

-- "Was this Pokémon already tried in this room?" (repeat warning) and the hints table both read by room + Pokémon.
create index attempts_room_pokemon_idx on public.attempts (room_id, pokemon_id);

create table public.chat_messages (
  id         bigint      generated always as identity primary key,
  room_id    uuid        not null references public.rooms (id) on delete cascade,
  -- null = message written by the room's admin
  player_id  uuid        references public.players (id) on delete cascade,
  body       text        not null,
  created_at timestamptz not null default now(),
  constraint chat_messages_body_valid check (char_length(body) between 1 and 200 and body !~ '[[:cntrl:]]')
);

comment on table public.chat_messages is
  'Conversation chat of a room. Kept only until the room is closed (close_room erases it). Nobody has direct privileges: access is only through post_chat_message(), post_admin_chat_message() and list_chat().';

create index chat_messages_room_id_id_idx on public.chat_messages (room_id, id);
create index chat_messages_player_created_idx on public.chat_messages (player_id, created_at desc);

alter table public.chat_messages enable row level security;
revoke all on public.chat_messages from public, anon, authenticated, service_role;

-- True when somebody in the room already sent this Pokémon. Courtesy check for the warning, not a rule.
create function public.was_tried(p_room_id uuid, p_pokemon_id integer)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.attempts a where a.room_id = p_room_id and a.pokemon_id = p_pokemon_id)
$$;

-- Side table of hints: every Pokémon tried in the room that was not cold, with its icon name. Names only.
-- Fire first, then warm, each alphabetical. Capped at 500 rows.
create function public.list_hints(p_room_id uuid)
returns table (o_pokemon text, o_result text)
language sql
stable
security definer
set search_path = ''
as $$
  select k.nombre_es, a.result
  from public.attempts a
  join public.pokemon k on k.id = a.pokemon_id
  where a.room_id = p_room_id and a.result in ('fire', 'warm')
  group by k.id, k.nombre_es, a.result
  order by (a.result = 'fire') desc, k.nombre_es
  limit 500
$$;

-- Player writes a chat message. Outcomes: ok, unknown_room, room_closed, not_player, invalid, rate_limited.
-- Limit: 10 messages per minute per player (the phase 3 admin-defined limit will replace the constant).
create function public.post_chat_message(p_room_id uuid, p_session_hash text, p_body text)
returns table (o_outcome text, o_id bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status    text;
  v_player_id uuid;
  v_id        bigint;
begin
  -- FOR SHARE: waits for a room being closed (close_room holds NO KEY UPDATE) so no message can slip in after the erase.
  select r.status into v_status from public.rooms r where r.id = p_room_id for share;
  if not found then
    return query select 'unknown_room'::text, null::bigint;
    return;
  end if;
  if v_status <> 'open' then
    return query select 'room_closed'::text, null::bigint;
    return;
  end if;

  select p.id into v_player_id from public.players p where p.room_id = p_room_id and p.session_hash = p_session_hash;
  if not found then
    return query select 'not_player'::text, null::bigint;
    return;
  end if;

  if p_body is null or char_length(p_body) not between 1 and 200 or p_body ~ '[[:cntrl:]]' then
    return query select 'invalid'::text, null::bigint;
    return;
  end if;

  if (select count(*) from public.chat_messages c
      where c.player_id = v_player_id and c.created_at > clock_timestamp() - interval '1 minute') >= 10 then
    return query select 'rate_limited'::text, null::bigint;
    return;
  end if;

  insert into public.chat_messages (room_id, player_id, body, created_at)
  values (p_room_id, v_player_id, p_body, clock_timestamp())
  returning id into v_id;
  return query select 'ok'::text, v_id;
end
$$;

-- The room's admin writes a chat message. The server has already verified the admin code.
-- Outcomes: ok, unknown_room, room_closed, invalid, rate_limited (30 per minute for the admin).
create function public.post_admin_chat_message(p_room_id uuid, p_body text)
returns table (o_outcome text, o_id bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_id     bigint;
begin
  select r.status into v_status from public.rooms r where r.id = p_room_id for share;
  if not found then
    return query select 'unknown_room'::text, null::bigint;
    return;
  end if;
  if v_status <> 'open' then
    return query select 'room_closed'::text, null::bigint;
    return;
  end if;
  if p_body is null or char_length(p_body) not between 1 and 200 or p_body ~ '[[:cntrl:]]' then
    return query select 'invalid'::text, null::bigint;
    return;
  end if;
  if (select count(*) from public.chat_messages c
      where c.room_id = p_room_id and c.player_id is null and c.created_at > clock_timestamp() - interval '1 minute') >= 30 then
    return query select 'rate_limited'::text, null::bigint;
    return;
  end if;

  insert into public.chat_messages (room_id, player_id, body, created_at)
  values (p_room_id, null, p_body, clock_timestamp())
  returning id into v_id;
  return query select 'ok'::text, v_id;
end
$$;

-- Chat page, oldest first. p_after = last message id the caller already has (null = the latest p_limit messages).
create function public.list_chat(p_room_id uuid, p_after bigint, p_limit integer)
returns table (o_id bigint, o_nickname text, o_body text, o_is_admin boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.nickname, t.body, t.is_admin
  from (
    select c.id, coalesce(p.nickname, 'Admin') as nickname, c.body, (c.player_id is null) as is_admin
    from public.chat_messages c
    left join public.players p on p.id = c.player_id
    where c.room_id = p_room_id and (p_after is null or c.id > p_after)
    order by (case when p_after is null then c.id end) desc nulls last, c.id asc
    limit least(greatest(p_limit, 1), 200)
  ) t
  order by t.id
$$;

revoke all on function public.was_tried(uuid, integer) from public, anon, authenticated;
revoke all on function public.list_hints(uuid) from public, anon, authenticated;
revoke all on function public.post_chat_message(uuid, text, text) from public, anon, authenticated;
revoke all on function public.post_admin_chat_message(uuid, text) from public, anon, authenticated;
revoke all on function public.list_chat(uuid, bigint, integer) from public, anon, authenticated;
grant execute on function public.was_tried(uuid, integer) to service_role;
grant execute on function public.list_hints(uuid) to service_role;
grant execute on function public.post_chat_message(uuid, text, text) to service_role;
grant execute on function public.post_admin_chat_message(uuid, text) to service_role;
grant execute on function public.list_chat(uuid, bigint, integer) to service_role;
