-- Step 5: free-play attempts (mode B) and the hint engine.
-- Expand-only: one nullable column on rooms, one new table, two new functions. Nothing existing is changed.
--
-- ROLLBACK (documented, run manually if needed; it deletes every stored attempt):
--   drop function if exists public.list_attempts(uuid, bigint, integer);
--   drop function if exists public.submit_attempt(uuid, text, integer);
--   drop table if exists public.attempts;
--   alter table public.rooms drop column if exists finished_at;

-- A room whose secret was guessed is "finished": still open (the admin closes it in step 6) but it accepts no more attempts.
alter table public.rooms add column finished_at timestamptz;

comment on column public.rooms.finished_at is
  'Set once, by submit_attempt(), when a player guesses the secret Pokémon. The room stays open until the admin closes it.';

create table public.attempts (
  id         bigint      generated always as identity primary key,
  room_id    uuid        not null references public.rooms (id) on delete cascade,
  player_id  uuid        not null references public.players (id) on delete cascade,
  pokemon_id integer     not null references public.pokemon (id),
  -- fire = same type AND same generation, warm = only one of the two, cold = neither.
  result     text        not null,
  is_winner  boolean     not null default false,
  created_at timestamptz not null default now(),
  constraint attempts_result_valid check (result in ('fire', 'warm', 'cold')),
  constraint attempts_winner_is_fire check (not is_winner or result = 'fire')
);

comment on table public.attempts is
  'Attempts of a room (nickname via players, Pokémon name via pokemon). Kept only until the room is closed (step 6 deletes them). Nobody has direct privileges: access is only through submit_attempt() and list_attempts().';

-- Feed reads (room + cursor), per-player cooldown lookup, and foreign key coverage.
create index attempts_room_id_id_idx on public.attempts (room_id, id);
create index attempts_player_created_idx on public.attempts (player_id, created_at desc);
create index attempts_pokemon_id_idx on public.attempts (pokemon_id);
-- Hard guarantee: a room can have at most one winning attempt.
create unique index attempts_one_winner_per_room on public.attempts (room_id) where is_winner;

-- Deny by default: RLS on, no policies, and no privileges for anyone (functions below run as the owner).
alter table public.attempts enable row level security;
revoke all on public.attempts from public, anon, authenticated, service_role;

-- Records one attempt, computes its hint and decides the winner, all in one transaction.
-- Types and generation never leave the database: the caller only gets the outcome and the icon name.
-- Outcomes: ok, unknown_room, room_closed, round_finished, not_player, unknown_pokemon, cooldown.
create function public.submit_attempt(p_room_id uuid, p_session_hash text, p_pokemon_id integer)
returns table (o_outcome text, o_result text, o_is_winner boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room      public.rooms%rowtype;
  v_secret    public.pokemon%rowtype;
  v_guess     public.pokemon%rowtype;
  v_player_id uuid;
  v_last      timestamptz;
  v_score     integer;
  v_result    text;
  v_winner    boolean;
begin
  -- Locks the room row: attempts to the same room run one at a time, so "first correct answer wins" is exact.
  -- NO KEY UPDATE does not block players joining (their foreign key check only needs KEY SHARE).
  select * into v_room from public.rooms where id = p_room_id for no key update;
  if not found then
    return query select 'unknown_room'::text, null::text, null::boolean;
    return;
  end if;
  if v_room.status <> 'open' then
    return query select 'room_closed'::text, null::text, null::boolean;
    return;
  end if;
  if v_room.finished_at is not null then
    return query select 'round_finished'::text, null::text, null::boolean;
    return;
  end if;

  select p.id into v_player_id
  from public.players p
  where p.room_id = p_room_id and p.session_hash = p_session_hash;
  if not found then
    return query select 'not_player'::text, null::text, null::boolean;
    return;
  end if;

  select * into v_guess from public.pokemon where id = p_pokemon_id;
  if not found then
    return query select 'unknown_pokemon'::text, null::text, null::boolean;
    return;
  end if;

  -- Minimal spam brake: one attempt per second per player. The admin-defined wait arrives in phase 2.
  select max(a.created_at) into v_last from public.attempts a where a.player_id = v_player_id;
  if v_last is not null and v_last > clock_timestamp() - interval '1 second' then
    return query select 'cooldown'::text, null::text, null::boolean;
    return;
  end if;

  select * into v_secret from public.pokemon where id = v_room.secret_pokemon_id;

  -- "Same type" = shares at least one type (BRIEF assumption).
  v_score := (v_guess.tipos_es && v_secret.tipos_es)::integer + (v_guess.generacion = v_secret.generacion)::integer;
  v_result := case v_score when 2 then 'fire' when 1 then 'warm' else 'cold' end;
  v_winner := v_guess.id = v_secret.id;

  insert into public.attempts (room_id, player_id, pokemon_id, result, is_winner, created_at)
  values (p_room_id, v_player_id, p_pokemon_id, v_result, v_winner, clock_timestamp());

  if v_winner then
    update public.rooms set finished_at = clock_timestamp() where id = p_room_id;
  end if;

  return query select 'ok'::text, v_result, v_winner;
end
$$;

revoke all on function public.submit_attempt(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.submit_attempt(uuid, text, integer) to service_role;

-- Feed page, oldest first. p_after = last attempt id the caller already has (null = the latest p_limit attempts).
-- Returns only nickname, Pokémon name, icon name and winner flag: never types or generation.
create function public.list_attempts(p_room_id uuid, p_after bigint, p_limit integer)
returns table (o_id bigint, o_nickname text, o_pokemon text, o_result text, o_is_winner boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.nickname, t.nombre_es, t.result, t.is_winner
  from (
    select a.id, p.nickname, k.nombre_es, a.result, a.is_winner
    from public.attempts a
    join public.players p on p.id = a.player_id
    join public.pokemon k on k.id = a.pokemon_id
    where a.room_id = p_room_id and (p_after is null or a.id > p_after)
    order by (case when p_after is null then a.id end) desc nulls last, a.id asc
    limit least(greatest(p_limit, 1), 200)
  ) t
  order by t.id
$$;

revoke all on function public.list_attempts(uuid, bigint, integer) from public, anon, authenticated;
grant execute on function public.list_attempts(uuid, bigint, integer) to service_role;
