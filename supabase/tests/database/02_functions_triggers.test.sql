-- Functions and triggers: signup profiles, room ownership, message edit and
-- delete normalisation, get_or_create_dm and rate limits.
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

create function tests.act_as_anon()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
end;
$$;

grant execute on all functions in schema tests to anon, authenticated;

select plan(28);

-- ===========================================================================
-- Signup creates a profile
-- ===========================================================================
insert into auth.users (id, email, raw_user_meta_data, is_anonymous, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@test.dev', '{"user_name":"Alice-Dev","full_name":"Alice A"}', false, 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@test.dev',   '{"user_name":"bob"}', false, 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@test.dev', '{"user_name":"carol"}', false, 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000d', 'x@test.dev',     '{"user_name":"admin"}', false, 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000f', 'y@test.dev',     '{"user_name":"bob"}', false, 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000e', null, '{}', true, 'authenticated', 'authenticated');

select results_eq(
  $$ select username, display_name, is_guest from public.profiles where id = '00000000-0000-0000-0000-00000000000a' $$,
  $$ values ('alicedev'::text, 'Alice A'::text, false) $$,
  'signup: profile from OAuth metadata, username sanitised');
select matches((select username from public.profiles where id = '00000000-0000-0000-0000-00000000000d'),
  '^admin_[0-9a-f]{5}$', 'signup: reserved username gets a suffix');
select matches((select username from public.profiles where id = '00000000-0000-0000-0000-00000000000f'),
  '^bob_[0-9a-f]{5}$', 'signup: taken username gets a suffix');
select results_eq(
  $$ select username ~ '^guest_[0-9a-f]{5}$', is_guest from public.profiles where id = '00000000-0000-0000-0000-00000000000e' $$,
  $$ values (true, true) $$,
  'signup: guest gets a guest_ username and is_guest');

update auth.users set is_anonymous = false where id = '00000000-0000-0000-0000-00000000000e';
select is((select is_guest from public.profiles where id = '00000000-0000-0000-0000-00000000000e'), false,
  'linking OAuth clears is_guest');
update auth.users set is_anonymous = true where id = '00000000-0000-0000-0000-00000000000e';

-- ===========================================================================
-- Room ownership
-- ===========================================================================
-- Clients cannot choose a room id, so the fixture room is created as postgres
-- with created_by set; the trigger behaves the same either way.
insert into public.rooms (id, type, name, created_by) values
  ('10000000-0000-0000-0000-000000000001', 'private', 'priv', '00000000-0000-0000-0000-00000000000a');
select tests.act_as('00000000-0000-0000-0000-00000000000a');
select results_eq(
  $$ select user_id, role from public.room_members where room_id = '10000000-0000-0000-0000-000000000001' $$,
  $$ values ('00000000-0000-0000-0000-00000000000a'::uuid, 'owner'::text) $$,
  'creator becomes room owner');

-- ===========================================================================
-- Message edits and soft deletes
-- ===========================================================================
insert into public.messages (id, room_id, body) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'first');
update public.messages set body = 'second' where id = '20000000-0000-0000-0000-000000000001';
select isnt((select edited_at from public.messages where id = '20000000-0000-0000-0000-000000000001'), null,
  'edit sets edited_at');
update public.messages set deleted_at = '2000-01-01' where id = '20000000-0000-0000-0000-000000000001';
select results_eq(
  $$ select body, deleted_at = now() from public.messages where id = '20000000-0000-0000-0000-000000000001' $$,
  $$ values (null::text, true) $$,
  'soft delete clears body and uses server time');
select lives_ok($$ update public.messages set body = 'resurrect' where id = '20000000-0000-0000-0000-000000000001' $$,
  'updating a deleted message is a no-op, not an error');
reset role;
select is((select body from public.messages where id = '20000000-0000-0000-0000-000000000001'), null,
  'deleted message stays deleted');

-- ===========================================================================
-- get_or_create_dm
-- ===========================================================================
select tests.act_as('00000000-0000-0000-0000-00000000000a');
create temp table dm as select public.get_or_create_dm('00000000-0000-0000-0000-00000000000b') as room_id;
grant select on dm to authenticated;

select is(public.get_or_create_dm('00000000-0000-0000-0000-00000000000b'), (select room_id from dm),
  'DM: second call returns the same room');
select results_eq(
  $$ select type from public.rooms where id = (select room_id from dm) $$, array['dm'],
  'DM: room has type dm');
select results_eq(
  $$ select user_id from public.room_members where room_id = (select room_id from dm) order by user_id $$,
  $$ values ('00000000-0000-0000-0000-00000000000a'::uuid), ('00000000-0000-0000-0000-00000000000b'::uuid) $$,
  'DM: exactly the two users are members');
select throws_ok($$ select public.get_or_create_dm('00000000-0000-0000-0000-00000000000a') $$,
  '22023', null, 'DM: cannot DM yourself');
select throws_ok($$ select public.get_or_create_dm(null) $$,
  '22023', null, 'DM: null recipient rejected');
select throws_ok($$ select public.get_or_create_dm(gen_random_uuid()) $$,
  'P0002', null, 'DM: unknown user rejected');

select tests.act_as('00000000-0000-0000-0000-00000000000b');
select is(public.get_or_create_dm('00000000-0000-0000-0000-00000000000a'), (select room_id from dm),
  'DM: the other user gets the same room (one DM per pair)');

select tests.act_as('00000000-0000-0000-0000-00000000000c');
insert into public.blocks (blocked_id) values ('00000000-0000-0000-0000-00000000000a');
select tests.act_as('00000000-0000-0000-0000-00000000000a');
select throws_ok($$ select public.get_or_create_dm('00000000-0000-0000-0000-00000000000c') $$,
  '42501', null, 'DM: cannot open a DM with someone who blocked you');

select tests.act_as_anon();
select throws_ok($$ select public.get_or_create_dm('00000000-0000-0000-0000-00000000000b') $$,
  '42501', null, 'DM: anon cannot call get_or_create_dm');

reset role;
insert into private.bans (user_id) values ('00000000-0000-0000-0000-00000000000d');
select tests.act_as('00000000-0000-0000-0000-00000000000d');
select throws_ok($$ select public.get_or_create_dm('00000000-0000-0000-0000-00000000000b') $$,
  '42501', null, 'DM: banned user cannot open DMs');
reset role;
delete from private.bans;

-- ===========================================================================
-- Rate limits (all rows share the transaction's now(), so they count)
-- ===========================================================================
-- Messages: 20 per minute. Alice already sent 1 above.
select tests.act_as('00000000-0000-0000-0000-00000000000a');
select lives_ok($$ insert into public.messages (room_id, body)
  select '10000000-0000-0000-0000-000000000001', 'm' || g from generate_series(1, 19) g $$,
  'messages: 20 in a minute allowed');
select throws_ok($$ insert into public.messages (room_id, body) values ('10000000-0000-0000-0000-000000000001', 'one too many') $$,
  'PT429', null, 'messages: 21st in a minute is rate limited');

-- Rooms: 5 per hour. Alice created 1 above.
select lives_ok($$ insert into public.rooms (type, name) select 'public', 'r' || g from generate_series(1, 4) g $$,
  'rooms: 5 in an hour allowed');
select throws_ok($$ insert into public.rooms (type, name) values ('public', 'r6') $$,
  'PT429', null, 'rooms: 6th in an hour is rate limited');

-- DMs: 10 new per hour. Bob opened 0 (alice created the alice-bob DM).
reset role;
insert into auth.users (id, is_anonymous, aud, role)
  select ('30000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, true, 'authenticated', 'authenticated'
  from generate_series(1, 11) g;
select tests.act_as('00000000-0000-0000-0000-00000000000b');
select lives_ok($$ select public.get_or_create_dm(('30000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid)
  from generate_series(1, 10) g $$,
  'DMs: 10 new in an hour allowed');
select throws_ok($$ select public.get_or_create_dm('30000000-0000-0000-0000-000000000011') $$,
  'PT429', null, 'DMs: 11th new DM in an hour is rate limited');

-- Reports: 10 per hour. Alice reports messages in her own room.
select tests.act_as('00000000-0000-0000-0000-00000000000a');
select lives_ok($$ insert into public.reports (message_id, reason)
  select id, 'spam' from public.messages where deleted_at is null limit 10 $$,
  'reports: 10 in an hour allowed');
select throws_ok($$ insert into public.reports (message_id, reason)
  select id, 'spam' from public.messages where deleted_at is null limit 1 $$,
  'PT429', null, 'reports: 11th in an hour is rate limited');

select * from finish();
rollback;
