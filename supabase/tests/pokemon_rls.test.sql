-- pgTAP: permissions matrix for public.pokemon and public.pokemon_names.
-- Run with: supabase test db
-- Requires the data from supabase/seed.sql to be loaded (1082 rows).
begin;
select plan(63);

-- A. Structure and data (8) ---------------------------------------------------
select has_table('public', 'pokemon', 'table pokemon exists');
select has_view('public', 'pokemon_names', 'view pokemon_names exists');
select ok((select relrowsecurity from pg_class where oid = 'public.pokemon'::regclass),
          'RLS is enabled on pokemon');
select is((select count(*) from pg_policies where schemaname = 'public' and tablename = 'pokemon'), 0::bigint,
          'pokemon has no policies (deny by default for anon/authenticated)');
select columns_are('public', 'pokemon_names', array['id', 'nombre_es', 'search_key'],
                   'pokemon_names exposes only id, nombre_es, search_key');
select is((select count(*) from public.pokemon), 1082::bigint, 'pokemon has 1082 rows');
select is((select count(*) from public.pokemon where regional), 57::bigint, 'pokemon has 57 regional forms');
select is((select count(*) from public.pokemon where nombre_en = 'basculin-white-striped'), 0::bigint,
          'Basculin de Hisui is excluded');

-- B. Search key and constraints (9) --------------------------------------------
select is(public.normalize_name('Nidoran♀'), 'nidoran', 'normalize: Nidoran♀');
select is(public.normalize_name('Farfetch’d'), 'farfetchd', 'normalize: Farfetch’d');
select is(public.normalize_name('Mr. Mime'), 'mrmime', 'normalize: Mr. Mime');
select is(public.normalize_name('Ho-Oh'), 'hooh', 'normalize: Ho-Oh');
select is(public.normalize_name('Flabébé'), 'flabebe', 'normalize: accents removed');
select is(public.normalize_name('ÁÉÍÓÚ Ñandú'), 'aeiounandu', 'normalize: uppercase and ñ');
select throws_ok($$insert into public.pokemon (id, dex_number, nombre_es, nombre_en, tipos_es, generacion, regional)
                   values (99999, 1, 'Test A', 'test-a', array['Fuego','Fuego'], 1, false)$$,
                 '23514', null, 'duplicate type in tipos_es is rejected');
select throws_ok($$insert into public.pokemon (id, dex_number, nombre_es, nombre_en, tipos_es, generacion, regional)
                   values (99999, 1, 'Test B', 'test-b', array['Sonido'], 1, false)$$,
                 '23514', null, 'unknown type is rejected');
select throws_ok($$insert into public.pokemon (id, dex_number, nombre_es, nombre_en, tipos_es, generacion, regional)
                   values (99999, 1, 'Test C', 'test-c', array['Fuego'], 10, false)$$,
                 '23514', null, 'generation 10 is rejected');

-- C. Privilege matrix: role x table x operation (24) ---------------------------
select is(has_table_privilege(v.role, v.rel, v.priv), v.expected, v.role || ' ' || v.priv || ' on ' || v.rel)
from (values
  ('anon',          'public.pokemon',       'SELECT', false),
  ('anon',          'public.pokemon',       'INSERT', false),
  ('anon',          'public.pokemon',       'UPDATE', false),
  ('anon',          'public.pokemon',       'DELETE', false),
  ('authenticated', 'public.pokemon',       'SELECT', false),
  ('authenticated', 'public.pokemon',       'INSERT', false),
  ('authenticated', 'public.pokemon',       'UPDATE', false),
  ('authenticated', 'public.pokemon',       'DELETE', false),
  ('service_role',  'public.pokemon',       'SELECT', true),
  ('service_role',  'public.pokemon',       'INSERT', false),
  ('service_role',  'public.pokemon',       'UPDATE', false),
  ('service_role',  'public.pokemon',       'DELETE', false),
  ('anon',          'public.pokemon_names', 'SELECT', true),
  ('anon',          'public.pokemon_names', 'INSERT', false),
  ('anon',          'public.pokemon_names', 'UPDATE', false),
  ('anon',          'public.pokemon_names', 'DELETE', false),
  ('authenticated', 'public.pokemon_names', 'SELECT', true),
  ('authenticated', 'public.pokemon_names', 'INSERT', false),
  ('authenticated', 'public.pokemon_names', 'UPDATE', false),
  ('authenticated', 'public.pokemon_names', 'DELETE', false),
  ('service_role',  'public.pokemon_names', 'SELECT', true),
  ('service_role',  'public.pokemon_names', 'INSERT', false),
  ('service_role',  'public.pokemon_names', 'UPDATE', false),
  ('service_role',  'public.pokemon_names', 'DELETE', false)
) as v(role, rel, priv, expected);

-- D. Real behavior per role (22) -----------------------------------------------
-- anon (8)
set local role anon;
select throws_ok($$select 1 from public.pokemon limit 1$$, '42501', null, 'anon cannot SELECT pokemon');
select throws_ok($$insert into public.pokemon (id, dex_number, nombre_es, nombre_en, tipos_es, generacion, regional)
                    values (99999, 1, 'T', 't', array['Fuego'], 1, false)$$, '42501', null, 'anon cannot INSERT pokemon');
select throws_ok($$update public.pokemon set generacion = 1$$, '42501', null, 'anon cannot UPDATE pokemon');
select throws_ok($$delete from public.pokemon$$, '42501', null, 'anon cannot DELETE pokemon');
select is((select count(*) from public.pokemon_names), 1082::bigint, 'anon reads 1082 names from pokemon_names');
select throws_ok($$insert into public.pokemon_names (id, nombre_es) values (99999, 'T')$$, '42501', null,
                 'anon cannot INSERT pokemon_names');
select throws_ok($$update public.pokemon_names set nombre_es = 'T'$$, '42501', null, 'anon cannot UPDATE pokemon_names');
select throws_ok($$delete from public.pokemon_names$$, '42501', null, 'anon cannot DELETE pokemon_names');
reset role;

-- authenticated (8)
set local role authenticated;
select throws_ok($$select 1 from public.pokemon limit 1$$, '42501', null, 'authenticated cannot SELECT pokemon');
select throws_ok($$insert into public.pokemon (id, dex_number, nombre_es, nombre_en, tipos_es, generacion, regional)
                    values (99999, 1, 'T', 't', array['Fuego'], 1, false)$$, '42501', null, 'authenticated cannot INSERT pokemon');
select throws_ok($$update public.pokemon set generacion = 1$$, '42501', null, 'authenticated cannot UPDATE pokemon');
select throws_ok($$delete from public.pokemon$$, '42501', null, 'authenticated cannot DELETE pokemon');
select is((select count(*) from public.pokemon_names), 1082::bigint, 'authenticated reads 1082 names from pokemon_names');
select throws_ok($$insert into public.pokemon_names (id, nombre_es) values (99999, 'T')$$, '42501', null,
                 'authenticated cannot INSERT pokemon_names');
select throws_ok($$update public.pokemon_names set nombre_es = 'T'$$, '42501', null, 'authenticated cannot UPDATE pokemon_names');
select throws_ok($$delete from public.pokemon_names$$, '42501', null, 'authenticated cannot DELETE pokemon_names');
reset role;

-- service_role (5)
set local role service_role;
select lives_ok($$select count(*) from public.pokemon$$, 'service_role can SELECT pokemon');
select throws_ok($$insert into public.pokemon (id, dex_number, nombre_es, nombre_en, tipos_es, generacion, regional)
                    values (99999, 1, 'T', 't', array['Fuego'], 1, false)$$, '42501', null, 'service_role cannot INSERT pokemon');
select throws_ok($$update public.pokemon set generacion = 1$$, '42501', null, 'service_role cannot UPDATE pokemon');
select throws_ok($$delete from public.pokemon$$, '42501', null, 'service_role cannot DELETE pokemon');
select throws_ok($$insert into public.pokemon_names (id, nombre_es) values (99999, 'T')$$, '42501', null,
                 'service_role cannot INSERT pokemon_names');
reset role;

-- E. Players never see the clues (1) -------------------------------------------
set local role anon;
select throws_ok($$select tipos_es from public.pokemon_names$$, '42703', null,
                 'tipos_es is not reachable through pokemon_names');
reset role;

select * from finish();
rollback;
