-- The room-creation rate limit used to count rooms that still exist, so once
-- owners could delete rooms, "create 5, delete them, create 5 more" got
-- around it. It now counts creations, logged here; deleting a room doesn't
-- remove its log row. Rows older than the one-hour window are pruned on the
-- next creation, so the table stays tiny.
create table private.room_creations (
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table private.room_creations enable row level security;
create index room_creations_user_created_idx on private.room_creations (user_id, created_at);

create or replace function private.rate_limit_rooms()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if new.type = 'dm' or v_uid is null then
    return new;
  end if;

  delete from private.room_creations where user_id = v_uid and created_at <= now() - interval '1 hour';
  if (select count(*) from private.room_creations where user_id = v_uid) >= 5 then
    perform private.raise_rate_limited('5 rooms per hour');
  end if;
  insert into private.room_creations (user_id) values (v_uid);
  return new;
end;
$$;
