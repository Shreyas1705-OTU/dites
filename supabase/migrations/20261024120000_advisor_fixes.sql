-- Security Advisor follow-ups.

-- ---------------------------------------------------------------------------
-- public.rls_auto_enable() backs Supabase's "auto-enable RLS" event trigger
-- (ensure_rls). It exists only on projects that opted in, so this is
-- conditional. Event trigger functions are invoked by Postgres without an
-- EXECUTE check, so revoking it from API roles keeps the trigger working
-- while removing it from the RPC surface.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- room_members: one permissive policy per action. Several permissive
-- policies are OR'ed anyway but each is evaluated separately per row; a
-- single policy with explicit branches is cheaper and easier to read.
-- ---------------------------------------------------------------------------
drop policy room_members_insert_join_public on public.room_members;
drop policy room_members_insert_by_owner on public.room_members;

create policy room_members_insert on public.room_members
  for insert to authenticated
  with check (
    role = 'member'
    and not (select private.is_banned())
    and (
      -- join a public room yourself
      (user_id = (select auth.uid()) and private.room_type(room_id) = 'public')
      -- an owner adds someone else to their private room
      or (
        user_id <> (select auth.uid())
        and private.room_type(room_id) = 'private'
        and private.is_room_owner(room_id)
      )
    )
  );

drop policy room_members_delete_leave on public.room_members;
drop policy room_members_delete_by_owner on public.room_members;

create policy room_members_delete on public.room_members
  for delete to authenticated
  using (
    -- leave a public or private room (owners stay; DMs cannot be left)
    (
      user_id = (select auth.uid())
      and role = 'member'
      and private.room_type(room_id) <> 'dm'
    )
    -- an owner removes someone else from their private room
    or (
      user_id <> (select auth.uid())
      and private.room_type(room_id) = 'private'
      and private.is_room_owner(room_id)
    )
  );
