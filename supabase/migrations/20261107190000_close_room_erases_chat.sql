-- Steps 7+8 (part 2): close_room() must also erase the chat, including the admin's messages
-- (they have no player row, so deleting the players does not remove them).
-- Replaces the function from 20261106200000_close_room with the same signature and grants.
--
-- ROLLBACK (documented): re-run the body of 20261106200000_close_room.sql (it restores the previous version).

create or replace function public.close_room(p_room_id uuid)
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
  -- Also serializes with submit_attempt() (NO KEY UPDATE) and waits for in-flight chat posts (FOR SHARE).
  select r.status into v_status from public.rooms r where r.id = p_room_id for no key update;
  if not found or v_status <> 'open' then
    return false;
  end if;

  delete from public.chat_messages where room_id = p_room_id;
  delete from public.attempts where room_id = p_room_id;
  delete from public.players where room_id = p_room_id;
  update public.rooms set status = 'closed', closed_at = clock_timestamp() where id = p_room_id;
  return true;
end
$$;
