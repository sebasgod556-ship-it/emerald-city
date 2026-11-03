-- Step 3: at most 10 open rooms at once, enforced in the database.
-- Open rooms older than 24 hours are treated as abandoned and do not count (auto-close arrives in Phase 3).

create index rooms_open_created_at_idx on public.rooms (created_at) where status = 'open';

create function public.rooms_enforce_open_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_open integer;
begin
  -- Serialize concurrent inserts so two requests cannot both pass the check.
  perform pg_advisory_xact_lock(hashtext('rooms_open_limit'));

  select count(*) into v_open
  from public.rooms
  where status = 'open' and created_at > now() - interval '24 hours';

  if new.status = 'open' and v_open >= 10 then
    raise exception 'open room limit reached' using errcode = '53400';
  end if;
  return new;
end
$$;

revoke all on function public.rooms_enforce_open_limit() from public, anon, authenticated;

create trigger rooms_enforce_open_limit
  before insert on public.rooms
  for each row execute function public.rooms_enforce_open_limit();

-- ROLLBACK (documented, not executed):
--   drop trigger rooms_enforce_open_limit on public.rooms;
--   drop function public.rooms_enforce_open_limit();
--   drop index public.rooms_open_created_at_idx;
