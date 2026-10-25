-- Private room invites: owners add people by username. Guests are limited to
-- public rooms and DMs (spec), so an owner can only add registered users.
-- The check reads profiles.is_guest, which is kept in sync with the signed
-- is_anonymous flag by a trigger and cannot be changed by users.

drop policy room_members_insert on public.room_members;

create policy room_members_insert on public.room_members
  for insert to authenticated
  with check (
    role = 'member'
    and not (select private.is_banned())
    and (
      -- join a public room yourself
      (user_id = (select auth.uid()) and private.room_type(room_id) = 'public')
      -- an owner adds a registered user to their private room
      or (
        user_id <> (select auth.uid())
        and private.room_type(room_id) = 'private'
        and private.is_room_owner(room_id)
        and exists (select 1 from public.profiles p where p.id = user_id and not p.is_guest)
      )
    )
  );
