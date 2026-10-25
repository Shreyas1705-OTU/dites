-- #general: the public room every visitor lands in. Guests cannot create
-- rooms, so production needs at least one to exist. It has no owner
-- (created_by is null), so nobody can rename it. The fixed id lets the app
-- link straight to it. The other demo rooms arrive with the Phase 4 seed.
insert into public.rooms (id, type, name, description)
values (
  '00000000-0000-4000-8000-000000000001',
  'public',
  'general',
  'Say hello. Everyone who signs in starts here.'
)
on conflict (id) do nothing;

-- Every new profile joins #general, so "Try as guest" lands in a live room
-- with one click. SECURITY DEFINER because the insert happens inside the
-- signup transaction, before the user has a session.
create function private.join_general_room()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.room_members (room_id, user_id, role)
  select r.id, new.id, 'member'
  from public.rooms r
  where r.id = '00000000-0000-4000-8000-000000000001'
  on conflict do nothing;
  return new;
end;
$$;

create trigger profiles_join_general
  after insert on public.profiles
  for each row execute function private.join_general_room();

revoke execute on function private.join_general_room() from public, anon, authenticated;

-- Existing profiles (none in production) join too.
insert into public.room_members (room_id, user_id, role)
select '00000000-0000-4000-8000-000000000001', p.id, 'member'
from public.profiles p
on conflict do nothing;
