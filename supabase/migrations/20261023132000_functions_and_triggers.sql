-- Server-side behaviour for the core schema: profile creation on sign-up,
-- room ownership, message edit/delete normalisation, get_or_create_dm and
-- rate limits. Every SECURITY DEFINER function pins search_path to '' and
-- uses fully qualified names.

-- ---------------------------------------------------------------------------
-- Profiles are created by the database when an auth user is created, so a
-- client can never insert a profile (or choose its is_guest value) itself.
-- user_metadata only seeds a suggested username; it is never used to
-- authorize anything.
-- ---------------------------------------------------------------------------
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base text;
  v_candidate text;
  v_display text;
  v_attempt int := 0;
begin
  if new.is_anonymous then
    v_base := 'guest';
  else
    v_base := coalesce(
      new.raw_user_meta_data ->> 'user_name',          -- GitHub
      new.raw_user_meta_data ->> 'preferred_username',
      split_part(new.email, '@', 1),
      'user'
    );
    v_display := coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    );
  end if;

  v_base := left(regexp_replace(lower(v_base), '[^a-z0-9_]', '', 'g'), 14);
  if char_length(v_base) < 3 then
    v_base := 'user';
  end if;
  -- Guests always get a suffix; registered users only on a collision.
  v_candidate := case when new.is_anonymous
    then v_base || '_' || substr(md5(random()::text), 1, 5)
    else v_base end;

  loop
    begin
      insert into public.profiles (id, username, display_name, is_guest)
      values (
        new.id,
        v_candidate,
        coalesce(nullif(left(btrim(v_display), 50), ''), v_candidate),
        new.is_anonymous
      );
      exit;
    exception when unique_violation or check_violation then
      -- taken or reserved: retry with a random suffix
      v_attempt := v_attempt + 1;
      if v_attempt > 10 then
        raise;
      end if;
      v_candidate := v_base || '_' || substr(md5(random()::text), 1, 5);
    end;
  end loop;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- A guest who links GitHub or Google stops being anonymous; mirror that.
create function private.handle_user_upgraded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set is_guest = new.is_anonymous where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_upgraded
  after update of is_anonymous on auth.users
  for each row
  when (old.is_anonymous is distinct from new.is_anonymous)
  execute function private.handle_user_upgraded();

-- ---------------------------------------------------------------------------
-- The creator of a public or private room becomes its owner. Clients cannot
-- insert role = 'owner' themselves (role is not granted).
-- ---------------------------------------------------------------------------
create function private.add_room_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type <> 'dm' and new.created_by is not null then
    insert into public.room_members (room_id, user_id, role)
    values (new.id, new.created_by, 'owner');
  end if;
  return new;
end;
$$;

create trigger rooms_add_owner
  after insert on public.rooms
  for each row execute function private.add_room_owner();

-- ---------------------------------------------------------------------------
-- Edits and soft deletes: the database sets the timestamps, and a deleted
-- message has its content cleared so it cannot be read back.
-- ---------------------------------------------------------------------------
create function private.normalize_message_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.deleted_at is not null then
    new.deleted_at := coalesce(old.deleted_at, now());
    new.body := null;
    new.image_path := null;
  elsif new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  return new;
end;
$$;

create trigger messages_normalize_update
  before update on public.messages
  for each row execute function private.normalize_message_update();

-- ---------------------------------------------------------------------------
-- Rate limits. Raised with SQLSTATE PT429 so PostgREST answers HTTP 429.
-- Inserts without a user (service role, cron jobs) are not limited.
-- ---------------------------------------------------------------------------
create function private.raise_rate_limited(p_what text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Rate limit exceeded: %', p_what
    using errcode = 'PT429', hint = 'rate_limited';
end;
$$;

create function private.rate_limit_messages()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and (
    select count(*) from public.messages
    where user_id = (select auth.uid()) and created_at > now() - interval '1 minute'
  ) >= 20 then
    perform private.raise_rate_limited('20 messages per minute');
  end if;
  return new;
end;
$$;

create trigger messages_rate_limit
  before insert on public.messages
  for each row execute function private.rate_limit_messages();

create function private.rate_limit_rooms()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type <> 'dm' and (select auth.uid()) is not null and (
    select count(*) from public.rooms
    where created_by = (select auth.uid()) and type <> 'dm'
      and created_at > now() - interval '1 hour'
  ) >= 5 then
    perform private.raise_rate_limited('5 rooms per hour');
  end if;
  return new;
end;
$$;

create trigger rooms_rate_limit
  before insert on public.rooms
  for each row execute function private.rate_limit_rooms();

create function private.rate_limit_reports()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and (
    select count(*) from public.reports
    where reporter_id = (select auth.uid()) and created_at > now() - interval '1 hour'
  ) >= 10 then
    perform private.raise_rate_limited('10 reports per hour');
  end if;
  return new;
end;
$$;

create trigger reports_rate_limit
  before insert on public.reports
  for each row execute function private.rate_limit_reports();

-- ---------------------------------------------------------------------------
-- get_or_create_dm: the only way to open a DM. Returns the existing room for
-- the pair or creates it with both members. The advisory lock serialises
-- concurrent calls for the same pair; private.dm_pairs' primary key is the
-- final guarantee of one DM per pair.
-- ---------------------------------------------------------------------------
create function public.get_or_create_dm(other_user uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_a uuid;
  v_b uuid;
  v_room uuid;
begin
  if v_me is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if other_user is null or other_user = v_me then
    raise exception 'Invalid DM recipient' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = other_user) then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  if private.is_banned() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.blocks where blocker_id = other_user and blocked_id = v_me
  ) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  v_a := least(v_me, other_user);
  v_b := greatest(v_me, other_user);
  perform pg_advisory_xact_lock(hashtextextended(v_a::text || v_b::text, 0));

  select room_id into v_room from private.dm_pairs where user_a = v_a and user_b = v_b;
  if v_room is not null then
    return v_room;
  end if;

  if (
    select count(*) from public.rooms
    where created_by = v_me and type = 'dm' and created_at > now() - interval '1 hour'
  ) >= 10 then
    perform private.raise_rate_limited('10 new DMs per hour');
  end if;

  insert into public.rooms (type, created_by) values ('dm', v_me) returning id into v_room;
  insert into private.dm_pairs (user_a, user_b, room_id) values (v_a, v_b, v_room);
  insert into public.room_members (room_id, user_id, role)
  values (v_room, v_me, 'member'), (v_room, other_user, 'member');

  return v_room;
end;
$$;

-- ---------------------------------------------------------------------------
-- Execute privileges: trigger functions are never callable directly;
-- get_or_create_dm is for signed-in users only.
-- ---------------------------------------------------------------------------
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'private.handle_new_user()', 'private.handle_user_upgraded()',
    'private.add_room_owner()', 'private.normalize_message_update()',
    'private.raise_rate_limited(text)', 'private.rate_limit_messages()',
    'private.rate_limit_rooms()', 'private.rate_limit_reports()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
  end loop;
end;
$$;

revoke execute on function public.get_or_create_dm(uuid) from public, anon;
grant execute on function public.get_or_create_dm(uuid) to authenticated;
