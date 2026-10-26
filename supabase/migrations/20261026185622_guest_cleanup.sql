-- Guests (anonymous users) and everything they made are deleted 24 hours
-- after they signed up, by an hourly pg_cron job. This keeps the free-tier
-- database small and member lists free of long-gone visitors. A guest who
-- linked GitHub or Google is no longer anonymous, so they are kept.
--
-- Deleting the auth user cascades to their profile, which cascades to their
-- messages, memberships, blocks, reports and departures. DMs with a guest
-- are deleted first, so the other person's sidebar drops them live (the
-- membership-removed broadcast fires for each member of the deleted room).
-- Storage objects (images, Phase 3) will need their own cleanup here.

create extension if not exists pg_cron with schema pg_catalog;

create function private.cleanup_guests(p_max_age interval default interval '24 hours', p_batch int default 500)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  -- Batched, so one run never holds locks for long; the next run continues.
  select array_agg(id) into v_ids
  from (
    select u.id from auth.users u
    where u.is_anonymous and u.created_at < now() - p_max_age
    order by u.created_at
    limit p_batch
  ) expired;

  if v_ids is null then
    return 0;
  end if;

  delete from public.rooms r
  where r.type = 'dm'
    and exists (select 1 from public.room_members m where m.room_id = r.id and m.user_id = any (v_ids));

  delete from auth.users where id = any (v_ids);
  return cardinality(v_ids);
end;
$$;

revoke execute on function private.cleanup_guests(interval, int) from public, anon, authenticated;

-- Hourly, at 17 minutes past (off the hour, when cron jobs everywhere pile up).
select cron.schedule('dites-cleanup-guests', '17 * * * *', $$select private.cleanup_guests()$$);
