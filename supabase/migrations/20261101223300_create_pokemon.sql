-- Step 2: Pokémon reference data.
-- Full data (types, generation) is server-only. Players get a names-only view.

-- Search key: lowercase, accents removed, everything except a-z/0-9 dropped.
-- Mirrors normalizeName() in lib/validation/pokemon.ts.
create or replace function public.normalize_name(input text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select regexp_replace(
    translate(lower(input), 'áàâäãåéèêëíìîïóòôöõúùûüñç', 'aaaaaaeeeeiiiiooooouuuunc'),
    '[^a-z0-9]', '', 'g')
$$;

revoke all on function public.normalize_name(text) from public, anon, authenticated;

create table public.pokemon (
  id          integer  primary key check (id > 0),
  dex_number  integer  not null check (dex_number > 0),
  nombre_es   text     not null check (btrim(nombre_es) <> ''),
  nombre_en   text     not null check (btrim(nombre_en) <> ''),
  tipos_es    text[]   not null,
  generacion  smallint not null check (generacion between 1 and 9),
  regional    boolean  not null,
  search_key  text     generated always as (public.normalize_name(nombre_es)) stored,
  constraint pokemon_nombre_es_key unique (nombre_es),
  constraint pokemon_nombre_en_key unique (nombre_en),
  constraint pokemon_search_key_not_empty check (search_key <> ''),
  constraint pokemon_tipos_valid check (
    cardinality(tipos_es) between 1 and 2
    and tipos_es[1] is distinct from tipos_es[2]
    and tipos_es <@ array['Acero','Agua','Bicho','Dragón','Eléctrico','Fantasma','Fuego','Hada','Hielo',
                          'Lucha','Normal','Planta','Psíquico','Roca','Siniestro','Tierra','Veneno','Volador']::text[]
  )
);

comment on table public.pokemon is
  'Server-only. RLS on with NO policies = deny by default for anon/authenticated; only service_role can SELECT. Never expose to the browser: types and generation are the game clues.';

alter table public.pokemon enable row level security;
revoke all on table public.pokemon from public, anon, authenticated, service_role;
grant select on table public.pokemon to service_role;

-- Names-only view for the player search box. Deliberately runs with the owner's rights
-- (security_invoker = false) so players can read names without any access to the table.
create view public.pokemon_names
  with (security_invoker = false)
  as select id, nombre_es, search_key from public.pokemon order by id;

comment on view public.pokemon_names is
  'Public by design: only id, nombre_es, search_key (no types, no generation). Read-only.';

revoke all on table public.pokemon_names from public, anon, authenticated, service_role;
grant select on table public.pokemon_names to anon, authenticated, service_role;

-- ROLLBACK (documented, not executed):
--   drop view public.pokemon_names;
--   drop table public.pokemon;
--   drop function public.normalize_name(text);
