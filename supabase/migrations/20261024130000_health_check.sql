-- Keep-alive probe for /api/health. anon has no table access, so the route
-- calls this instead: a real round trip through the Data API into Postgres
-- that reads nothing. SECURITY INVOKER, so it runs with the caller's
-- (anon's) privileges and cannot be used to reach anything else.
create function public.health_check()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select true;
$$;

revoke execute on function public.health_check() from public;
grant execute on function public.health_check() to anon, authenticated;
