-- Room names: unique, channel-style, and never reserved. Enforced by the
-- database, so calling the API directly can't get around them.
begin;
create extension if not exists pgtap with schema extensions;

create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.act_as(p_uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', p_uid, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
grant execute on all functions in schema tests to anon, authenticated;

insert into auth.users (id, email, raw_user_meta_data, is_anonymous, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@test.dev', '{"user_name":"alice"}', false, 'authenticated', 'authenticated');

select plan(7);
select tests.act_as('00000000-0000-0000-0000-00000000000a');

select lives_ok($$ insert into public.rooms (type, name) values ('public', 'book-club') $$,
  'a channel-style name is accepted');
select throws_ok($$ insert into public.rooms (type, name) values ('public', 'general') $$,
  '23505', null, 'a second #general is rejected');
select throws_ok($$ insert into public.rooms (type, name) values ('private', 'book-club') $$,
  '23505', null, 'names are unique across public and private rooms');
select throws_ok($$ insert into public.rooms (type, name) values ('public', 'admin') $$,
  '23514', null, 'reserved names are rejected');
select throws_ok($$ insert into public.rooms (type, name) values ('public', 'General Chat') $$,
  '23514', null, 'uppercase and spaces are rejected');
select throws_ok($$ insert into public.rooms (type, name) values ('public', '-edge-') $$,
  '23514', null, 'leading or trailing hyphens are rejected');

reset role;
select lives_ok($$ insert into public.rooms (type) values ('dm'), ('dm') $$,
  'DMs have no name and are unaffected');

select * from finish();
rollback;
