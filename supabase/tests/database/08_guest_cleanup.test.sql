-- Guest cleanup: guests older than 24 hours go, with everything they made.
begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (id, email, raw_user_meta_data, is_anonymous, aud, role, created_at) values
  -- old guest: should be deleted
  ('00000000-0000-0000-0000-0000000000e1', null, '{}', true, 'authenticated', 'authenticated', now() - interval '25 hours'),
  -- new guest: should stay
  ('00000000-0000-0000-0000-0000000000e2', null, '{}', true, 'authenticated', 'authenticated', now() - interval '2 hours'),
  -- old registered user: should stay
  ('00000000-0000-0000-0000-0000000000a1', 'old@test.dev', '{"user_name":"old_timer"}', false, 'authenticated', 'authenticated', now() - interval '30 days');

-- The old guest posts in Global chat and has a DM with the registered user.
insert into public.messages (room_id, user_id, body) values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-0000000000e1', 'hello, briefly');
insert into public.rooms (id, type, created_by) values
  ('10000000-0000-0000-0000-0000000000d1', 'dm', '00000000-0000-0000-0000-0000000000e1');
insert into public.room_members (room_id, user_id) values
  ('10000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000e1'),
  ('10000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1');
insert into public.messages (room_id, user_id, body) values
  ('10000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', 'hi guest');

select cmp_ok(private.cleanup_guests(), '>=', 1, 'the cleanup reports deleting at least the old guest');

select is_empty($$ select 1 from auth.users where id = '00000000-0000-0000-0000-0000000000e1' $$,
  'a guest older than 24 hours is deleted');
select is_empty($$ select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000000e1' $$,
  'their profile goes with them');
select is_empty($$ select 1 from public.messages where user_id = '00000000-0000-0000-0000-0000000000e1' $$,
  'their messages go with them');
select is_empty($$ select 1 from public.rooms where id = '10000000-0000-0000-0000-0000000000d1' $$,
  'their DMs are deleted, including the other person''s messages in them');
select isnt_empty(
  $$ select 1 from realtime.messages
     where topic = 'user:00000000-0000-0000-0000-0000000000a1' and event = 'membership.removed' $$,
  'the other person is told live that the DM is gone');

select isnt_empty($$ select 1 from auth.users where id = '00000000-0000-0000-0000-0000000000e2' $$,
  'a guest younger than 24 hours stays');
select isnt_empty($$ select 1 from auth.users where id = '00000000-0000-0000-0000-0000000000a1' $$,
  'registered users are never deleted, however old');

select isnt_empty($$ select 1 from cron.job where jobname = 'dites-cleanup-guests' and schedule = '17 * * * *' $$,
  'the cleanup is scheduled hourly');

select * from finish();
rollback;
