-- Step 6: close a room. Expand-only: one new function. Nothing existing is changed and no grants change.
--
-- ROLLBACK (documented, run manually if needed; it does not restore anything that was already deleted):
--   drop function if exists public.close_room(uuid);

-- Closes an open room and erases everything players left in it (BRIEF: "nada al cerrar la sala"):
-- attempts and players (nicknames) are deleted. The room row stays (code, hash, closed status) so the link
-- keeps answering "room not available". It holds no personal data.
-- Returns true when this call closed the room, false when the room does not exist or was already closed.
create function public.close_room(p_room_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  -- Same per-room lock the players trigger takes, so nobody can join while the room is being emptied.
  perform pg_advisory_xact_lock(hashtextextended('players_room:' || p_room_id::text, 0));
  -- Also serializes with submit_attempt(), which locks the same row.
  select r.status into v_status from public.rooms r where r.id = p_room_id for no key update;
  if not found or v_status <> 'open' then
    return false;
  end if;

  delete from public.attempts where room_id = p_room_id;
  delete from public.players where room_id = p_room_id;
  update public.rooms set status = 'closed', closed_at = clock_timestamp() where id = p_room_id;
  return true;
end
$$;

revoke all on function public.close_room(uuid) from public, anon, authenticated;
grant execute on function public.close_room(uuid) to service_role;
