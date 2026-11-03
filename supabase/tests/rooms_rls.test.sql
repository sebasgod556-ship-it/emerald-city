-- pgTAP: permissions matrix and rules for public.rooms and public.rate_limits.
-- Run with: supabase test db
begin;
select plan(64);

-- A. Structure (6) ------------------------------------------------------------
select has_table('public', 'rooms', 'table rooms exists');
select has_table('public', 'rate_limits', 'table rate_limits exists');
select ok((select relrowsecurity from pg_class where oid = 'public.rooms'::regclass), 'RLS is enabled on rooms');
select ok((select relrowsecurity from pg_class where oid = 'public.rate_limits'::regclass), 'RLS is enabled on rate_limits');
select is((select count(*) from pg_policies where schemaname = 'public' and tablename = 'rooms'), 0::bigint, 'rooms has no policies');
select is((select count(*) from pg_policies where schemaname = 'public' and tablename = 'rate_limits'), 0::bigint, 'rate_limits has no policies');

-- B. Privilege matrix: role x table x operation (24) + function execute (3) ----
select is(has_table_privilege(v.role, v.rel, v.priv), v.expected, v.role || ' ' || v.priv || ' on ' || v.rel)
from (values
  ('anon',          'public.rooms',       'SELECT', false),
  ('anon',          'public.rooms',       'INSERT', false),
  ('anon',          'public.rooms',       'UPDATE', false),
  ('anon',          'public.rooms',       'DELETE', false),
  ('authenticated', 'public.rooms',       'SELECT', false),
  ('authenticated', 'public.rooms',       'INSERT', false),
  ('authenticated', 'public.rooms',       'UPDATE', false),
  ('authenticated', 'public.rooms',       'DELETE', false),
  ('service_role',  'public.rooms',       'SELECT', true),
  ('service_role',  'public.rooms',       'INSERT', true),
  ('service_role',  'public.rooms',       'UPDATE', false),
  ('service_role',  'public.rooms',       'DELETE', false),
  ('anon',          'public.rate_limits', 'SELECT', false),
  ('anon',          'public.rate_limits', 'INSERT', false),
  ('anon',          'public.rate_limits', 'UPDATE', false),
  ('anon',          'public.rate_limits', 'DELETE', false),
  ('authenticated', 'public.rate_limits', 'SELECT', false),
  ('authenticated', 'public.rate_limits', 'INSERT', false),
  ('authenticated', 'public.rate_limits', 'UPDATE', false),
  ('authenticated', 'public.rate_limits', 'DELETE', false),
  ('service_role',  'public.rate_limits', 'SELECT', false),
  ('service_role',  'public.rate_limits', 'INSERT', false),
  ('service_role',  'public.rate_limits', 'UPDATE', false),
  ('service_role',  'public.rate_limits', 'DELETE', false)
) as v(role, rel, priv, expected);

select is(has_function_privilege('anon', 'public.rate_limit_hit(text,integer,integer)', 'EXECUTE'), false, 'anon cannot EXECUTE rate_limit_hit');
select is(has_function_privilege('authenticated', 'public.rate_limit_hit(text,integer,integer)', 'EXECUTE'), false, 'authenticated cannot EXECUTE rate_limit_hit');
select is(has_function_privilege('service_role', 'public.rate_limit_hit(text,integer,integer)', 'EXECUTE'), true, 'service_role can EXECUTE rate_limit_hit');

-- C. Constraints (7) ----------------------------------------------------------
select throws_ok($$insert into public.rooms (room_code, admin_code_hash, secret_pokemon_id) values ('abc', repeat('a',64), 1)$$, '23514', null, 'bad room_code format rejected');
select throws_ok($$insert into public.rooms (room_code, admin_code_hash, secret_pokemon_id) values ('ABCDEF', 'plain-code', 1)$$, '23514', null, 'non-hash admin_code_hash rejected');
select throws_ok($$insert into public.rooms (room_code, admin_code_hash, secret_pokemon_id, status) values ('ABCDEF', repeat('a',64), 1, 'paused')$$, '23514', null, 'invalid status rejected');
select throws_ok($$insert into public.rooms (room_code, admin_code_hash, secret_pokemon_id, status) values ('ABCDEF', repeat('a',64), 1, 'closed')$$, '23514', null, 'closed without closed_at rejected');
select throws_ok($$insert into public.rooms (room_code, admin_code_hash, secret_pokemon_id) values ('ABCDEF', repeat('a',64), 999999)$$, '23503', null, 'unknown pokemon rejected');
select lives_ok($$insert into public.rooms (room_code, admin_code_hash, secret_pokemon_id) values ('ABCDEF', repeat('a',64), 1)$$, 'valid room inserts');
select throws_ok($$insert into public.rooms (room_code, admin_code_hash, secret_pokemon_id) values ('ABCDEF', repeat('b',64), 2)$$, '23505', null, 'duplicate room_code rejected');

-- D. Real behavior per role (18) ----------------------------------------------
set local role anon;
select throws_ok($$select 1 from public.rooms limit 1$$, '42501', null, 'anon cannot SELECT rooms');
select throws_ok($$insert into public.rooms (room_code, admin_code_hash, secret_pokemon_id) values ('ZZZZZ2', repeat('c',64), 1)$$, '42501', null, 'anon cannot INSERT rooms');
select throws_ok($$select 1 from public.rate_limits limit 1$$, '42501', null, 'anon cannot SELECT rate_limits');
select throws_ok($$select * from public.rate_limit_hit('k', 5, 60)$$, '42501', null, 'anon cannot call rate_limit_hit');
reset role;

set local role authenticated;
select throws_ok($$select 1 from public.rooms limit 1$$, '42501', null, 'authenticated cannot SELECT rooms');
select throws_ok($$insert into public.rooms (room_code, admin_code_hash, secret_pokemon_id) values ('ZZZZZ2', repeat('c',64), 1)$$, '42501', null, 'authenticated cannot INSERT rooms');
select throws_ok($$select 1 from public.rate_limits limit 1$$, '42501', null, 'authenticated cannot SELECT rate_limits');
select throws_ok($$select * from public.rate_limit_hit('k', 5, 60)$$, '42501', null, 'authenticated cannot call rate_limit_hit');
reset role;

set local role service_role;
select lives_ok($$select 1 from public.rooms limit 1$$, 'service_role can SELECT rooms');
select lives_ok($$insert into public.rooms (room_code, admin_code_hash, secret_pokemon_id) values ('ZZZZZ2', repeat('c',64), 1)$$, 'service_role can INSERT rooms');
select throws_ok($$update public.rooms set status = 'closed'$$, '42501', null, 'service_role cannot UPDATE rooms yet');
select throws_ok($$delete from public.rooms$$, '42501', null, 'service_role cannot DELETE rooms');
select is((select allowed from public.rate_limit_hit('pgtap-key', 2, 86400)), true, 'rate limit: 1st hit allowed');
select is((select allowed from public.rate_limit_hit('pgtap-key', 2, 86400)), true, 'rate limit: 2nd hit allowed');
select is((select allowed from public.rate_limit_hit('pgtap-key', 2, 86400)), false, 'rate limit: 3rd hit denied');
select cmp_ok((select retry_after from public.rate_limit_hit('pgtap-key', 2, 86400)), '>', 0, 'rate limit: denied hit has retry_after > 0');
select throws_ok($$select * from public.rate_limit_hit('k', 0, 60)$$, '22023', null, 'rate limit: invalid arguments rejected');
select throws_ok($$select 1 from public.rate_limits limit 1$$, '42501', null, 'service_role cannot read rate_limits directly');
reset role;

-- E. At most 10 open rooms (6) ------------------------------------------------
select has_trigger('public', 'rooms', 'rooms_enforce_open_limit', 'open-room limit trigger exists');
update public.rooms set status = 'closed', closed_at = now() where status = 'open';  -- start from zero open rooms
select lives_ok($$insert into public.rooms (room_code, admin_code_hash, secret_pokemon_id)
                  select 'AAAAA' || substr('ABCDEFGHJK', i, 1), repeat('d',64), 1 from generate_series(1, 10) as i$$,
                '10 open rooms can exist');
select throws_ok($$insert into public.rooms (room_code, admin_code_hash, secret_pokemon_id) values ('BBBBBB', repeat('e',64), 1)$$,
                 '53400', null, 'the 11th open room is rejected');
update public.rooms set status = 'closed', closed_at = now() where room_code = 'AAAAAA';
select lives_ok($$insert into public.rooms (room_code, admin_code_hash, secret_pokemon_id) values ('BBBBBB', repeat('e',64), 1)$$,
                'closing a room frees a slot');
select throws_ok($$insert into public.rooms (room_code, admin_code_hash, secret_pokemon_id) values ('CCCCCC', repeat('f',64), 1)$$,
                 '53400', null, 'the limit applies again at 10 open rooms');
update public.rooms set created_at = now() - interval '25 hours' where room_code = 'AAAAAB';
select lives_ok($$insert into public.rooms (room_code, admin_code_hash, secret_pokemon_id) values ('CCCCCC', repeat('f',64), 1)$$,
                'open rooms older than 24 hours do not count');

select * from finish();
rollback;
