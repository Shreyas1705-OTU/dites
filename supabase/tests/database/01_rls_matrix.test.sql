-- RLS test matrix: user type x room type x action, asserting allowed vs denied.
-- Runs as real roles (authenticated / anon) with forged JWT claims, the same
-- way PostgREST does, so policies and column grants are exercised for real.
begin;
create extension if not exists pgtap with schema extensions;

-- ---------------------------------------------------------------------------
-- Helpers (rolled back with the transaction)
-- ---------------------------------------------------------------------------
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

create function tests.act_as_anon()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
end;
$$;

grant execute on all functions in schema tests to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Fixtures
--   alice  registered, owner of #pub and #priv, in DM with bob
--   bob    registered, member of #priv and the DM
--   carol  registered outsider
--   dan    registered, member of #pub, banned
--   gina   guest (anonymous), member of #pub
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data, is_anonymous, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@test.dev', '{"user_name":"alice"}', false, 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@test.dev',   '{"user_name":"bob"}',   false, 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@test.dev', '{"user_name":"carol"}', false, 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000d', 'dan@test.dev',   '{"user_name":"dan"}',   false, 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000e', null, '{}', true, 'authenticated', 'authenticated');

insert into public.rooms (id, type, name, created_by) values
  ('10000000-0000-0000-0000-000000000001', 'public',  'pub',  '00000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-000000000002', 'private', 'priv', '00000000-0000-0000-0000-00000000000a');
insert into public.rooms (id, type, created_by) values
  ('10000000-0000-0000-0000-000000000003', 'dm', '00000000-0000-0000-0000-00000000000a');
insert into private.dm_pairs (user_a, user_b, room_id) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000003');

insert into public.room_members (room_id, user_id) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000d'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000e'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000b');

insert into public.messages (id, room_id, user_id, body) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'public hello'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'private hello'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000a', 'dm hello');

insert into private.bans (user_id, reason) values ('00000000-0000-0000-0000-00000000000d', 'test');

select plan(50);

-- ===========================================================================
-- anon: no table access at all
-- ===========================================================================
select tests.act_as_anon();
select throws_ok($$ select * from public.profiles $$, '42501', null, 'anon: cannot read profiles');
select throws_ok($$ select * from public.messages $$, '42501', null, 'anon: cannot read messages');
select throws_ok($$ select * from public.rooms $$,    '42501', null, 'anon: cannot read rooms');

-- ===========================================================================
-- Reading
-- ===========================================================================
select tests.act_as('00000000-0000-0000-0000-00000000000c'); -- carol, outsider
-- Scoped to this file's fixtures plus #general, so rooms left in a local
-- database by other test runs don't affect the result.
select results_eq($$ select name from public.rooms
  where id in ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002',
               '10000000-0000-0000-0000-000000000003', '00000000-0000-4000-8000-000000000001')
  order by name $$, array['general', 'pub'],
  'outsider: sees public rooms only (#general and pub), not private rooms or DMs');
-- Message reads are scoped to this file's fixture rooms: every user is also
-- auto-joined to Global chat, which may hold messages from other test runs.
select is_empty($$ select 1 from public.messages where room_id in ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003') $$,
  'outsider: reads no messages (not a member of any room)');
select is_empty($$ select 1 from public.room_members
  where room_id in ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003') $$,
  'outsider: cannot see private room or DM membership');
select isnt_empty($$ select 1 from public.profiles $$, 'registered: can read profiles');

select tests.act_as('00000000-0000-0000-0000-00000000000b'); -- bob
select results_eq($$ select body from public.messages where room_id in ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003') order by body $$,
  array['dm hello', 'private hello'],
  'member: reads messages in own private room and DM only');

select tests.act_as('00000000-0000-0000-0000-00000000000e', true); -- gina, guest
select results_eq($$ select body from public.messages where room_id in ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003') $$, array['public hello'],
  'guest: reads only rooms they belong to');

-- ===========================================================================
-- Private schema and write-only tables
-- ===========================================================================
select tests.act_as('00000000-0000-0000-0000-00000000000a');
select throws_ok($$ select * from private.admins $$,   '42501', null, 'cannot read private.admins');
select throws_ok($$ select * from private.bans $$,     '42501', null, 'cannot read private.bans');
select throws_ok($$ select * from private.dm_pairs $$, '42501', null, 'cannot read private.dm_pairs');
select throws_ok($$ select * from public.reports $$,   '42501', null, 'cannot read reports');
select throws_ok($$ insert into private.admins values ('00000000-0000-0000-0000-00000000000a') $$,
  '42501', null, 'cannot make self admin');

-- ===========================================================================
-- Inserting messages
-- ===========================================================================
select tests.act_as('00000000-0000-0000-0000-00000000000b');
select lives_ok($$ insert into public.messages (room_id, body) values ('10000000-0000-0000-0000-000000000002', 'hi') $$,
  'member: posts in private room');
select lives_ok($$ insert into public.messages (room_id, body) values ('10000000-0000-0000-0000-000000000003', 'hi') $$,
  'DM member: posts in DM');
select throws_ok($$ insert into public.messages (room_id, user_id, body) values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'spoof') $$,
  '42501', null, 'cannot insert a message with someone else''s user_id');

select tests.act_as('00000000-0000-0000-0000-00000000000c');
select throws_ok($$ insert into public.messages (room_id, body) values ('10000000-0000-0000-0000-000000000002', 'x') $$,
  '42501', null, 'outsider: cannot post in private room');
select throws_ok($$ insert into public.messages (room_id, body) values ('10000000-0000-0000-0000-000000000003', 'x') $$,
  '42501', null, 'outsider: cannot post in DM');
select throws_ok($$ insert into public.messages (room_id, body) values ('10000000-0000-0000-0000-000000000001', 'x') $$,
  '42501', null, 'non-member: cannot post in public room before joining');

select tests.act_as('00000000-0000-0000-0000-00000000000e', true);
select lives_ok($$ insert into public.messages (room_id, body) values ('10000000-0000-0000-0000-000000000001', 'guest hi') $$,
  'guest: posts in public room');
select throws_ok($$ insert into public.messages (room_id, body) values ('10000000-0000-0000-0000-000000000002', 'x') $$,
  '42501', null, 'guest: cannot post in private room');

select tests.act_as('00000000-0000-0000-0000-00000000000d');
select throws_ok($$ insert into public.messages (room_id, body) values ('10000000-0000-0000-0000-000000000001', 'x') $$,
  '42501', null, 'banned: cannot post');

-- ===========================================================================
-- Updating and deleting messages
-- ===========================================================================
select tests.act_as('00000000-0000-0000-0000-00000000000b');
update public.messages set body = 'hacked' where id = '20000000-0000-0000-0000-000000000002';
update public.messages set deleted_at = now() where id = '20000000-0000-0000-0000-000000000002';
reset role;
select is((select body from public.messages where id = '20000000-0000-0000-0000-000000000002'), 'private hello',
  'cannot edit or soft-delete another user''s message');

select tests.act_as('00000000-0000-0000-0000-00000000000a');
select throws_ok($$ update public.messages set room_id = '10000000-0000-0000-0000-000000000001' where id = '20000000-0000-0000-0000-000000000002' $$,
  '42501', null, 'cannot change own message room_id');
select throws_ok($$ update public.messages set user_id = '00000000-0000-0000-0000-00000000000b' where id = '20000000-0000-0000-0000-000000000002' $$,
  '42501', null, 'cannot change own message user_id');
select throws_ok($$ update public.messages set created_at = now() - interval '1 year' $$,
  '42501', null, 'cannot backdate own message');
select throws_ok($$ delete from public.messages where id = '20000000-0000-0000-0000-000000000002' $$,
  '42501', null, 'cannot hard-delete messages');
select lives_ok($$ update public.messages set body = 'edited' where id = '20000000-0000-0000-0000-000000000002' $$,
  'author: edits own message');

-- ===========================================================================
-- Profiles: protected columns
-- ===========================================================================
select tests.act_as('00000000-0000-0000-0000-00000000000e', true);
select throws_ok($$ update public.profiles set is_guest = false $$,
  '42501', null, 'guest: cannot set own is_guest to false');
select throws_ok($$ insert into public.profiles (id, username) values (gen_random_uuid(), 'sneaky') $$,
  '42501', null, 'cannot insert profiles directly');

select tests.act_as('00000000-0000-0000-0000-00000000000c');
update public.profiles set display_name = 'pwned' where id = '00000000-0000-0000-0000-00000000000a';
select lives_ok($$ update public.profiles set display_name = 'Carol C' where id = '00000000-0000-0000-0000-00000000000c' $$,
  'registered: updates own profile');
reset role;
select is((select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000a'), 'alice',
  'cannot update another user''s profile');

-- ===========================================================================
-- Rooms
-- ===========================================================================
select tests.act_as('00000000-0000-0000-0000-00000000000e', true);
select throws_ok($$ insert into public.rooms (type, name) values ('public', 'guestroom') $$,
  '42501', null, 'guest: cannot create rooms');

select tests.act_as('00000000-0000-0000-0000-00000000000d');
select throws_ok($$ insert into public.rooms (type, name) values ('public', 'bannedroom') $$,
  '42501', null, 'banned: cannot create rooms');

select tests.act_as('00000000-0000-0000-0000-00000000000c');
select throws_ok($$ insert into public.rooms (type) values ('dm') $$,
  '42501', null, 'cannot create a DM room directly');
select lives_ok($$ insert into public.rooms (type, name) values ('private', 'carols') $$,
  'registered: creates a private room');
update public.rooms set name = 'renamed' where id = '10000000-0000-0000-0000-000000000001';

select tests.act_as('00000000-0000-0000-0000-00000000000b');
update public.rooms set name = 'renamed' where id = '10000000-0000-0000-0000-000000000002';
reset role;
select results_eq($$ select name from public.rooms where id in ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002') order by name $$,
  array['priv', 'pub'], 'non-owners cannot rename rooms');

-- ===========================================================================
-- Membership
-- ===========================================================================
select tests.act_as('00000000-0000-0000-0000-00000000000c');
select lives_ok($$ insert into public.room_members (room_id, user_id) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c') $$,
  'registered: joins a public room');
select throws_ok($$ insert into public.room_members (room_id, user_id) values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000c') $$,
  '42501', null, 'cannot join a private room uninvited');
select throws_ok($$ insert into public.room_members (room_id, user_id) values ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000c') $$,
  '42501', null, 'cannot join someone else''s DM');
select throws_ok($$ insert into public.room_members (room_id, user_id, role) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 'owner') $$,
  '42501', null, 'cannot grant self owner role');

select tests.act_as('00000000-0000-0000-0000-00000000000b');
select throws_ok($$ insert into public.room_members (room_id, user_id) values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000c') $$,
  '42501', null, 'private member (not owner): cannot add members');
delete from public.room_members where room_id = '10000000-0000-0000-0000-000000000003';

select tests.act_as('00000000-0000-0000-0000-00000000000a');
select lives_ok($$ insert into public.room_members (room_id, user_id) values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000c') $$,
  'owner: adds a member to a private room');
select throws_ok($$ insert into public.room_members (room_id, user_id) values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000e') $$,
  '42501', null, 'owner: cannot add a guest to a private room');
delete from public.room_members
  where room_id = '10000000-0000-0000-0000-000000000002' and user_id = '00000000-0000-0000-0000-00000000000c';
delete from public.room_members
  where room_id = '10000000-0000-0000-0000-000000000002' and user_id = '00000000-0000-0000-0000-00000000000a';
reset role;
select results_eq($$ select user_id from public.room_members where room_id = '10000000-0000-0000-0000-000000000002' order by user_id $$,
  $$ values ('00000000-0000-0000-0000-00000000000a'::uuid), ('00000000-0000-0000-0000-00000000000b'::uuid) $$,
  'owner: removes a member, but cannot leave (orphan) their own room');
select is((select count(*)::int from public.room_members where room_id = '10000000-0000-0000-0000-000000000003'), 2,
  'cannot leave or remove members from a DM');

-- ===========================================================================
-- Blocks and DMs
-- ===========================================================================
select tests.act_as('00000000-0000-0000-0000-00000000000b');
select lives_ok($$ insert into public.blocks (blocked_id) values ('00000000-0000-0000-0000-00000000000a') $$,
  'user: blocks another user');

select tests.act_as('00000000-0000-0000-0000-00000000000a');
select is_empty($$ select 1 from public.blocks $$, 'cannot see who blocked you');
select throws_ok($$ insert into public.messages (room_id, body) values ('10000000-0000-0000-0000-000000000003', 'hello?') $$,
  '42501', null, 'cannot message a DM partner who blocked you');

select * from finish();
rollback;
