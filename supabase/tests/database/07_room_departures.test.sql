-- Leaving and removal rules.
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
  ('00000000-0000-0000-0000-00000000000b', 'bob@test.dev',   '{"user_name":"bob"}',   false, 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@test.dev', '{"user_name":"carol"}', false, 'authenticated', 'authenticated');

-- Alice owns a public room and a private room; Bob and Carol are in both.
insert into public.rooms (id, type, name, created_by) values
  ('10000000-0000-0000-0000-000000000001', 'public',  'open-club',   '00000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-000000000002', 'private', 'closed-club', '00000000-0000-0000-0000-00000000000a');
insert into public.room_members (room_id, user_id) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b');

select plan(14);

-- Global chat
select tests.act_as('00000000-0000-0000-0000-00000000000b');
select is_empty($$ delete from public.room_members
  where room_id = '00000000-0000-4000-8000-000000000001' and user_id = '00000000-0000-0000-0000-00000000000b' returning 1 $$,
  'nobody can leave Global chat');

-- Leaving a public room: 5 days before you can rejoin
select isnt_empty($$ delete from public.room_members
  where room_id = '10000000-0000-0000-0000-000000000001' and user_id = '00000000-0000-0000-0000-00000000000b' returning 1 $$,
  'a member leaves a public room');
select results_eq($$ select kind from public.room_departures where room_id = '10000000-0000-0000-0000-000000000001' $$,
  array['left'], 'the leave is recorded, and the user can read their own record');
select throws_ok($$ insert into public.room_members (room_id, user_id) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b') $$,
  '42501', null, 'rejoining a public room within 5 days is refused');
reset role;
update public.room_departures set departed_at = now() - interval '5 days 1 minute'
  where room_id = '10000000-0000-0000-0000-000000000001' and user_id = '00000000-0000-0000-0000-00000000000b';
select tests.act_as('00000000-0000-0000-0000-00000000000b');
select lives_ok($$ insert into public.room_members (room_id, user_id) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b') $$,
  'after 5 days, rejoining is allowed');
select is_empty($$ select 1 from public.room_departures where room_id = '10000000-0000-0000-0000-000000000001' $$,
  'rejoining clears the departure record');

-- Removed by the owner of a public room: no rejoining, ever
select tests.act_as('00000000-0000-0000-0000-00000000000a');
select isnt_empty($$ delete from public.room_members
  where room_id = '10000000-0000-0000-0000-000000000001' and user_id = '00000000-0000-0000-0000-00000000000c' returning 1 $$,
  'an owner removes someone from their public room');
reset role;
update public.room_departures set departed_at = now() - interval '30 days'
  where room_id = '10000000-0000-0000-0000-000000000001' and user_id = '00000000-0000-0000-0000-00000000000c';
select tests.act_as('00000000-0000-0000-0000-00000000000c');
select throws_ok($$ insert into public.room_members (room_id, user_id) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c') $$,
  '42501', null, 'someone removed by the owner cannot rejoin, even weeks later');
select is_empty($$ select 1 from public.room_departures where user_id = '00000000-0000-0000-0000-00000000000b' $$,
  'users cannot read other people''s departures');

-- A non-owner can't remove anyone
select tests.act_as('00000000-0000-0000-0000-00000000000b');
select is_empty($$ delete from public.room_members
  where room_id = '10000000-0000-0000-0000-000000000001' and user_id = '00000000-0000-0000-0000-00000000000a' returning 1 $$,
  'a member cannot remove others');

-- Private room: leave, can't come back alone, owner can re-add
select isnt_empty($$ delete from public.room_members
  where room_id = '10000000-0000-0000-0000-000000000002' and user_id = '00000000-0000-0000-0000-00000000000b' returning 1 $$,
  'a member leaves a private room');
select throws_ok($$ insert into public.room_members (room_id, user_id) values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b') $$,
  '42501', null, 'they cannot rejoin a private room themselves');
select tests.act_as('00000000-0000-0000-0000-00000000000a');
select lives_ok($$ insert into public.room_members (room_id, user_id) values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b') $$,
  'the owner can add them back');

-- Deleting a room with members still works (departures aren't recorded for it)
select lives_ok($$ delete from public.rooms where id = '10000000-0000-0000-0000-000000000002' $$,
  'deleting a room with members still works');

select * from finish();
rollback;
