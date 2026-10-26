-- Leaving and removal now have consequences:
--   * Nobody can leave Global chat.
--   * Leave a public room: you can't rejoin it for 5 days.
--   * Removed by a room's owner (public or private): you can't rejoin it.
--   * Private rooms: only the owner adds people (unchanged), and an owner
--     adding someone back clears their departure record.
--
-- Departures are recorded by a trigger, so they can't be skipped by calling
-- the API directly, and the join policy reads them.

create table public.room_departures (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  departed_at timestamptz not null default now(),
  primary key (room_id, user_id),
  constraint room_departures_kind_valid check (kind in ('left', 'removed'))
);
alter table public.room_departures enable row level security;
create index room_departures_user_idx on public.room_departures (user_id);

-- Users can see their own departures (to show "you can rejoin on ..."),
-- and nothing else. Only the triggers below write here.
revoke all on public.room_departures from anon, authenticated;
grant select on public.room_departures to authenticated;

create policy room_departures_select_own on public.room_departures
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Record who left and who was removed.
-- ---------------------------------------------------------------------------
create function private.record_departure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_type text;
begin
  -- No user: a cleanup job or account deletion, not a choice anyone made.
  if v_uid is null then
    return null;
  end if;
  -- The room itself is being deleted (this delete is its cascade).
  select type into v_type from public.rooms where id = old.room_id;
  if v_type is null or v_type = 'dm' then
    return null;
  end if;

  insert into public.room_departures (room_id, user_id, kind)
  values (old.room_id, old.user_id, case when old.user_id = v_uid then 'left' else 'removed' end)
  on conflict (room_id, user_id) do update set kind = excluded.kind, departed_at = now();
  return null;
end;
$$;

create trigger room_members_record_departure
  after delete on public.room_members
  for each row execute function private.record_departure();

-- Being added back (by an owner, or rejoining after the wait) clears it.
create function private.clear_departure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.room_departures where room_id = new.room_id and user_id = new.user_id;
  return null;
end;
$$;

create trigger room_members_clear_departure
  after insert on public.room_members
  for each row execute function private.clear_departure();

-- ---------------------------------------------------------------------------
-- May the caller join this public room themselves?
-- ---------------------------------------------------------------------------
create function private.can_self_join(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.room_departures d
    where d.room_id = p_room_id
      and d.user_id = (select auth.uid())
      and (d.kind = 'removed' or d.departed_at > now() - interval '5 days')
  );
$$;

revoke execute on function private.record_departure() from public, anon, authenticated;
revoke execute on function private.clear_departure() from public, anon, authenticated;
revoke execute on function private.can_self_join(uuid) from public, anon;
grant execute on function private.can_self_join(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
drop policy room_members_insert on public.room_members;
create policy room_members_insert on public.room_members
  for insert to authenticated
  with check (
    role = 'member'
    and not (select private.is_banned())
    and (
      -- join a public room yourself, unless you were removed or left recently
      (
        user_id = (select auth.uid())
        and private.room_type(room_id) = 'public'
        and private.can_self_join(room_id)
      )
      -- an owner adds a registered user to their private room
      or (
        user_id <> (select auth.uid())
        and private.room_type(room_id) = 'private'
        and private.is_room_owner(room_id)
        and exists (select 1 from public.profiles p where p.id = user_id and not p.is_guest)
      )
    )
  );

drop policy room_members_delete on public.room_members;
create policy room_members_delete on public.room_members
  for delete to authenticated
  using (
    -- leave a room yourself: not a DM, not Global chat, not as its owner
    (
      user_id = (select auth.uid())
      and role = 'member'
      and private.room_type(room_id) <> 'dm'
      and room_id <> '00000000-0000-4000-8000-000000000001'
    )
    -- an owner removes someone else from their public or private room
    or (
      user_id <> (select auth.uid())
      and private.room_type(room_id) in ('public', 'private')
      and private.is_room_owner(room_id)
    )
  );
