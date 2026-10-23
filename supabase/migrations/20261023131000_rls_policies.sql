-- Row-level security for the core schema.
--
-- RLS policies decide WHICH ROWS a role can touch; column-level GRANTs decide
-- WHICH COLUMNS. Together they lock protected columns (is_guest, role,
-- created_at, a message's room_id/user_id) without relying on the UI.

alter table public.rooms alter column created_by set default auth.uid();

-- ---------------------------------------------------------------------------
-- Helpers. SECURITY DEFINER lets a policy look up membership without
-- recursing into room_members' own RLS (a policy on room_members that queries
-- room_members would otherwise loop). Each one checks auth.uid() itself, pins
-- search_path to '' and uses fully qualified names so a caller cannot
-- shadow a table with their own object.
-- ---------------------------------------------------------------------------
create function private.is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.room_members
    where room_id = p_room_id and user_id = (select auth.uid())
  );
$$;

create function private.is_room_owner(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.room_members
    where room_id = p_room_id and user_id = (select auth.uid()) and role = 'owner'
  );
$$;

create function private.room_type(p_room_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select type from public.rooms where id = p_room_id;
$$;

create function private.can_read_room(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.room_type(p_room_id) = 'public' or private.is_room_member(p_room_id);
$$;

create function private.is_banned()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.bans where user_id = (select auth.uid()));
$$;

-- Guests are Supabase anonymous users: role is still `authenticated`, but the
-- signed JWT carries is_anonymous = true. Never read user_metadata for this.
create function private.is_guest()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false);
$$;

-- True when p_room_id is a DM and the other member has blocked the caller.
create function private.dm_blocked(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.rooms r
    join public.room_members other
      on other.room_id = r.id and other.user_id <> (select auth.uid())
    join public.blocks b
      on b.blocker_id = other.user_id and b.blocked_id = (select auth.uid())
    where r.id = p_room_id and r.type = 'dm'
  );
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'private.is_room_member(uuid)', 'private.is_room_owner(uuid)',
    'private.room_type(uuid)', 'private.can_read_room(uuid)',
    'private.is_banned()', 'private.is_guest()', 'private.dm_blocked(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. Start from nothing, then grant only what the app needs.
-- anon gets no table access at all: every user, including guests, signs in.
-- ---------------------------------------------------------------------------
revoke all on public.profiles, public.rooms, public.room_members,
  public.messages, public.blocks, public.reports
  from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (username, display_name, avatar_path) on public.profiles to authenticated;

grant select on public.rooms to authenticated;
grant insert (type, name, description) on public.rooms to authenticated;
grant update (name, description) on public.rooms to authenticated;

grant select, delete on public.room_members to authenticated;
grant insert (room_id, user_id) on public.room_members to authenticated;
grant update (last_read_at) on public.room_members to authenticated;

grant select on public.messages to authenticated;
-- image_path is granted in Phase 3 together with its storage path check.
grant insert (id, room_id, body) on public.messages to authenticated;
grant update (body, deleted_at) on public.messages to authenticated;

grant select, delete on public.blocks to authenticated;
grant insert (blocked_id) on public.blocks to authenticated;

-- Reports are write-only for users; the admin queue reads them server-side.
grant insert (message_id, reason) on public.reports to authenticated;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy profiles_select_authenticated on public.profiles
  for select to authenticated
  using (true);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- rooms
-- ---------------------------------------------------------------------------
create policy rooms_select_visible on public.rooms
  for select to authenticated
  using (
    type = 'public'
    or private.is_room_member(id)
    -- lets INSERT ... RETURNING see a new private room before the owner
    -- membership row (added by trigger) exists
    or created_by = (select auth.uid())
  );

create policy rooms_insert_registered on public.rooms
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and type in ('public', 'private')
    and not (select private.is_guest())
    and not (select private.is_banned())
  );

create policy rooms_update_owner on public.rooms
  for update to authenticated
  using (private.is_room_owner(id))
  with check (private.is_room_owner(id));

-- ---------------------------------------------------------------------------
-- room_members
-- ---------------------------------------------------------------------------
create policy room_members_select_readable on public.room_members
  for select to authenticated
  using (private.can_read_room(room_id));

create policy room_members_insert_join_public on public.room_members
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and role = 'member'
    and private.room_type(room_id) = 'public'
    and not (select private.is_banned())
  );

create policy room_members_insert_by_owner on public.room_members
  for insert to authenticated
  with check (
    user_id <> (select auth.uid())
    and role = 'member'
    and private.room_type(room_id) = 'private'
    and private.is_room_owner(room_id)
    and not (select private.is_banned())
  );

create policy room_members_update_own on public.room_members
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy room_members_delete_leave on public.room_members
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    and role = 'member'
    and private.room_type(room_id) <> 'dm'
  );

create policy room_members_delete_by_owner on public.room_members
  for delete to authenticated
  using (
    user_id <> (select auth.uid())
    and private.room_type(room_id) = 'private'
    and private.is_room_owner(room_id)
  );

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------
create policy messages_select_member on public.messages
  for select to authenticated
  using (private.is_room_member(room_id));

create policy messages_insert_member on public.messages
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and private.is_room_member(room_id)
    and not (select private.is_banned())
    and not private.dm_blocked(room_id)
  );

create policy messages_update_own on public.messages
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and deleted_at is null
    and private.is_room_member(room_id)
  )
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- blocks
-- ---------------------------------------------------------------------------
create policy blocks_select_own on public.blocks
  for select to authenticated
  using (blocker_id = (select auth.uid()));

create policy blocks_insert_own on public.blocks
  for insert to authenticated
  with check (
    blocker_id = (select auth.uid())
    and not (select private.is_banned())
  );

create policy blocks_delete_own on public.blocks
  for delete to authenticated
  using (blocker_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- reports
-- ---------------------------------------------------------------------------
create policy reports_insert_visible_message on public.reports
  for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and not (select private.is_banned())
    -- runs under the caller's RLS, so only messages they can read qualify
    and exists (select 1 from public.messages m where m.id = message_id)
  );
