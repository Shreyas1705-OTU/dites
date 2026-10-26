-- Realtime channel authorization. Realtime joins a private channel by
-- setting realtime.topic to the channel name and checking the SELECT policy
-- on realtime.messages as the joining user; these tests do the same.
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

-- Number of events this user could receive on a channel.
create function tests.visible_events(p_topic text)
returns bigint language plpgsql as $$
declare
  n bigint;
begin
  perform set_config('realtime.topic', p_topic, true);
  select count(*) into n from realtime.messages where topic = p_topic;
  return n;
end;
$$;

grant execute on all functions in schema tests to anon, authenticated;

insert into auth.users (id, email, raw_user_meta_data, is_anonymous, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@test.dev', '{"user_name":"alice"}', false, 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@test.dev',   '{"user_name":"bob"}',   false, 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@test.dev', '{"user_name":"carol"}', false, 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000e', null, '{}', true, 'authenticated', 'authenticated');

-- Alice owns a private room with Bob in it; Carol and the guest are outsiders.
insert into public.rooms (id, type, name, created_by) values
  ('10000000-0000-0000-0000-000000000002', 'private', 'secret-plans', '00000000-0000-0000-0000-00000000000a');
insert into public.room_members (room_id, user_id) values
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b');

select tests.act_as('00000000-0000-0000-0000-00000000000b');
insert into public.messages (room_id, body) values ('10000000-0000-0000-0000-000000000002', 'the plan');
reset role;

select plan(11);

select is(
  (select count(*)::int from realtime.messages
    where topic = 'room:10000000-0000-0000-0000-000000000002' and event = 'message.insert'
      and payload ->> 'body' = 'the plan' and payload -> 'author' ->> 'username' = 'bob'),
  1, 'a new message is broadcast on its room topic, with the author''s name');
select isnt_empty(
  $$ select 1 from realtime.messages
     where topic = 'user:00000000-0000-0000-0000-00000000000b' and event = 'membership.added' $$,
  'being added to a room is broadcast on that user''s own topic');

select tests.act_as('00000000-0000-0000-0000-00000000000b');
select cmp_ok(tests.visible_events('room:10000000-0000-0000-0000-000000000002'), '>', 0::bigint,
  'member: can receive the room''s events');
select cmp_ok(tests.visible_events('user:00000000-0000-0000-0000-00000000000b'), '>', 0::bigint,
  'user: can receive their own user channel');
select is(tests.visible_events('user:00000000-0000-0000-0000-00000000000a'), 0::bigint,
  'user: cannot receive someone else''s user channel');
select is(tests.visible_events('room:not-a-uuid'), 0::bigint,
  'a malformed topic is refused, not an error');

select tests.act_as('00000000-0000-0000-0000-00000000000c');
select is(tests.visible_events('room:10000000-0000-0000-0000-000000000002'), 0::bigint,
  'outsider: cannot receive a private room''s events');

select tests.act_as('00000000-0000-0000-0000-00000000000e', true);
select is(tests.visible_events('room:10000000-0000-0000-0000-000000000002'), 0::bigint,
  'guest outsider: cannot receive a private room''s events');

select tests.act_as_anon();
select is(tests.visible_events('room:10000000-0000-0000-0000-000000000002'), 0::bigint,
  'anon: cannot receive any room''s events');

-- Removing Bob tells Bob, and his access ends with the membership.
select tests.act_as('00000000-0000-0000-0000-00000000000a');
delete from public.room_members
  where room_id = '10000000-0000-0000-0000-000000000002' and user_id = '00000000-0000-0000-0000-00000000000b';
reset role;
select isnt_empty(
  $$ select 1 from realtime.messages
     where topic = 'user:00000000-0000-0000-0000-00000000000b' and event = 'membership.removed' $$,
  'being removed is broadcast on that user''s own topic');
select tests.act_as('00000000-0000-0000-0000-00000000000b');
select is(tests.visible_events('room:10000000-0000-0000-0000-000000000002'), 0::bigint,
  'removed member: can no longer join the room''s channel');

select * from finish();
rollback;
