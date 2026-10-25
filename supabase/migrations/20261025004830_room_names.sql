-- Room names are channel-style handles: unique, lowercase words joined by
-- hyphens, and never a reserved name. The app normalises input the same
-- way, but these constraints hold even for someone calling the API directly
-- (so nobody can create a second "general", or "admin" with odd spacing).

alter table public.rooms
  add constraint rooms_name_format check (
    type = 'dm'
    or (char_length(name) between 2 and 30 and name ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
  ),
  add constraint rooms_name_not_reserved check (
    type = 'dm'
    or name <> all (array[
      'admin', 'administrator', 'dites', 'root', 'system', 'support',
      'moderator', 'mod', 'mods', 'staff', 'official', 'security', 'help',
      'announcements', 'null', 'undefined'
    ])
  );

-- One room per name (DMs have no name).
create unique index rooms_name_unique on public.rooms (name) where type <> 'dm';
