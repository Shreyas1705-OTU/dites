-- Owners can delete their rooms. Deleting a room cascades to its messages and
-- memberships (foreign keys with ON DELETE CASCADE), and the cascaded
-- membership deletes fire private.broadcast_membership(), so every member's
-- sidebar updates live and an open room turns into "Room not found".
--
-- Not deletable: Global chat (it has no owner) and DMs (nobody owns them).

grant delete on public.rooms to authenticated;

create policy rooms_delete_owner on public.rooms
  for delete to authenticated
  using (type <> 'dm' and private.is_room_owner(id));
