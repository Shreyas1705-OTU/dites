-- Realtime delivery with Broadcast from the database.
--
-- When a row changes, a trigger calls realtime.send(), which writes the event
-- to realtime.messages; Supabase Realtime then pushes it to every client
-- subscribed to that topic. Topics:
--   room:<room_id>  message inserts and updates, for members of the room
--   user:<user_id>  your memberships changing (added to a DM or private room,
--                   removed from one), for that user only
--
-- Why not Postgres Changes: it evaluates RLS for every subscriber on every
-- message, so cost grows with room size. Here authorization happens once,
-- when a client joins a channel: Realtime checks the SELECT policy on
-- realtime.messages below (with realtime.topic() set to the channel), and
-- only members get in. After that, delivery is a plain fan-out.

-- ---------------------------------------------------------------------------
-- Who may listen to a topic. SECURITY DEFINER so the membership lookup does
-- not depend on the caller's RLS; auth.uid() still comes from the caller's JWT.
-- ---------------------------------------------------------------------------
create function private.can_listen(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or p_topic is null then
    return false;
  end if;
  if p_topic = 'user:' || v_uid::text then
    return true;
  end if;
  -- Validate the shape before casting, so a junk topic is a plain "no".
  if p_topic ~ '^room:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return exists (
      select 1 from public.room_members
      where room_id = substr(p_topic, 6)::uuid and user_id = v_uid
    );
  end if;
  return false;
end;
$$;

revoke execute on function private.can_listen(text) from public, anon;
grant execute on function private.can_listen(text) to authenticated;

-- Receiving only. There is deliberately no INSERT policy: clients cannot
-- broadcast on these channels (typing indicators arrive in Phase 3).
create policy realtime_members_receive on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and private.can_listen((select realtime.topic()))
  );

-- ---------------------------------------------------------------------------
-- Message events. The payload carries the author's name so clients don't
-- need a second lookup; it contains nothing a member can't already read.
-- ---------------------------------------------------------------------------
create function private.broadcast_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author record;
begin
  select username, display_name into v_author from public.profiles where id = new.user_id;

  perform realtime.send(
    jsonb_build_object(
      'id', new.id,
      'room_id', new.room_id,
      'user_id', new.user_id,
      'body', new.body,
      'image_path', new.image_path,
      'created_at', new.created_at,
      'edited_at', new.edited_at,
      'deleted_at', new.deleted_at,
      'author', jsonb_build_object('username', v_author.username, 'display_name', v_author.display_name)
    ),
    case tg_op when 'INSERT' then 'message.insert' else 'message.update' end,
    'room:' || new.room_id::text,
    true
  );
  return null;
end;
$$;

create trigger messages_broadcast
  after insert or update on public.messages
  for each row execute function private.broadcast_message();

-- ---------------------------------------------------------------------------
-- Membership events, so sidebars update live (new DM, added to or removed
-- from a private room).
-- ---------------------------------------------------------------------------
create function private.broadcast_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform realtime.send(
      jsonb_build_object('room_id', new.room_id),
      'membership.added', 'user:' || new.user_id::text, true);
  else
    perform realtime.send(
      jsonb_build_object('room_id', old.room_id),
      'membership.removed', 'user:' || old.user_id::text, true);
  end if;
  return null;
end;
$$;

create trigger room_members_broadcast
  after insert or delete on public.room_members
  for each row execute function private.broadcast_membership();

revoke execute on function private.broadcast_message() from public, anon, authenticated;
revoke execute on function private.broadcast_membership() from public, anon, authenticated;
