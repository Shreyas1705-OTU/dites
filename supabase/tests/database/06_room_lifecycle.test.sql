-- Deleting and leaving rooms.
begin;
create extension if not exists pgtap with schema extensions;

create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.act_as(p_uid uuid, p_anonymous boolean default false)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', p_uid, 'role', 'authenticated', 'is_anonymous', p_anonymous)::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
grant execute on all functions in schema tests to anon, authenticated;

insert into auth.users (id, email, raw_user_meta_data, is_anonymous, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@test.dev', '{"user_name":"alice"}', false, 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@test.dev',   '{"user_name":"bob"}',   false, 'authenticated', 'authenticated');

-- Alice owns a private room with Bob in it, plus a message; they also share a DM.
insert into public.rooms (id, type, name, created_by) values
  ('10000000-0000-0000-0000-000000000002', 'private', 'doomed-room', '00000000-0000-0000-0000-00000000000a');
insert into public.room_members (room_id, user_id) values
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b');
insert into public.messages (room_id, user_id, body) values
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b', 'last words');
insert into public.rooms (id, type, created_by) values
  ('10000000-0000-0000-0000-000000000003', 'dm', '00000000-0000-0000-0000-00000000000a');
insert into public.room_members (room_id, user_id) values
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000b');

select plan(10);

-- Non-owners: RLS turns a disallowed delete into "0 rows".
select tests.act_as('00000000-0000-0000-0000-00000000000b');
select is_empty($$ delete from public.rooms where id = '10000000-0000-0000-0000-000000000002' returning id $$,
  'a member cannot delete a room they do not own');
select is_empty($$ delete from public.rooms where id = '00000000-0000-4000-8000-000000000001' returning id $$,
  'nobody can delete Global chat');
select is_empty($$ delete from public.rooms where id = '10000000-0000-0000-0000-000000000003' returning id $$,
  'a DM cannot be deleted');

-- Leaving: members can, owners can't (that would orphan the room).
select tests.act_as('00000000-0000-0000-0000-00000000000a');
select is_empty($$ delete from public.room_members
  where room_id = '10000000-0000-0000-0000-000000000002' and user_id = '00000000-0000-0000-0000-00000000000a' returning user_id $$,
  'the owner cannot leave their own room');

-- The owner deletes it: messages and memberships go with it.
select isnt_empty($$ delete from public.rooms where id = '10000000-0000-0000-0000-000000000002' returning id $$,
  'the owner deletes their room');
reset role;
select is((select count(*)::int from public.messages where room_id = '10000000-0000-0000-0000-000000000002'), 0,
  'its messages are deleted with it');
select is((select count(*)::int from public.room_members where room_id = '10000000-0000-0000-0000-000000000002'), 0,
  'its memberships are deleted with it');
select isnt_empty(
  $$ select 1 from realtime.messages
     where topic = 'user:00000000-0000-0000-0000-00000000000b' and event = 'membership.removed'
       and payload ->> 'room_id' = '10000000-0000-0000-0000-000000000002' $$,
  'each member is told live that the room is gone');
select isnt_empty($$ select 1 from public.rooms where id = '10000000-0000-0000-0000-000000000003' $$,
  'other rooms are untouched');

-- Deleting rooms doesn't reset the creation limit (5 an hour). Alice made
-- one room above (as postgres, so not counted); she creates 5 and deletes them.
select tests.act_as('00000000-0000-0000-0000-00000000000a');
insert into public.rooms (type, name) select 'public', 'burst-' || g from generate_series(1, 5) g;
delete from public.rooms where name like 'burst-%';
select throws_ok($$ insert into public.rooms (type, name) values ('public', 'burst-6') $$,
  'PT429', null, 'deleting rooms does not reset the room creation limit');

select * from finish();
rollback;
