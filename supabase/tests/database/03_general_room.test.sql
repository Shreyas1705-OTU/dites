-- #general: exists, everyone joins it on signup, and nobody owns or renames it.
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

select plan(7);

select results_eq(
  $$ select type, name, created_by from public.rooms where id = '00000000-0000-4000-8000-000000000001' $$,
  $$ values ('public'::text, 'general'::text, null::uuid) $$,
  '#general exists as an ownerless public room');

insert into auth.users (id, email, raw_user_meta_data, is_anonymous, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@test.dev', '{"user_name":"alice"}', false, 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000e', null, '{}', true, 'authenticated', 'authenticated');

select results_eq(
  $$ select role from public.room_members
     where room_id = '00000000-0000-4000-8000-000000000001' and user_id = '00000000-0000-0000-0000-00000000000a' $$,
  array['member'], 'a new registered user joins #general as a member');
select isnt_empty(
  $$ select 1 from public.room_members
     where room_id = '00000000-0000-4000-8000-000000000001' and user_id = '00000000-0000-0000-0000-00000000000e' $$,
  'a new guest joins #general');

select tests.act_as('00000000-0000-0000-0000-00000000000e', true);
select lives_ok(
  $$ insert into public.messages (room_id, body) values ('00000000-0000-4000-8000-000000000001', 'hi from a guest') $$,
  'a guest can post in #general right after signup');

select tests.act_as('00000000-0000-0000-0000-00000000000a');
select results_eq($$ select body from public.messages where user_id = '00000000-0000-0000-0000-00000000000e' $$, array['hi from a guest'],
  'members read each other''s messages in #general');
update public.rooms set name = 'hijacked' where id = '00000000-0000-4000-8000-000000000001';
reset role;
select is((select name from public.rooms where id = '00000000-0000-4000-8000-000000000001'), 'general',
  'nobody can rename #general (it has no owner)');

select tests.act_as('00000000-0000-0000-0000-00000000000a');
delete from public.room_members where room_id = '00000000-0000-4000-8000-000000000001';
reset role;
select results_eq(
  $$ select user_id from public.room_members
     where room_id = '00000000-0000-4000-8000-000000000001'
       and user_id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000e') $$,
  $$ values ('00000000-0000-0000-0000-00000000000e'::uuid) $$,
  'a member can leave #general, and only their own row goes');

select * from finish();
rollback;
