# Security

The full attack test write-up lands in Phase 5. This file starts with the
Security Advisor record.

## Security Advisor: accepted findings

Run with `npx supabase db advisors --linked --type all`. Every finding is
either fixed or listed here with the reason it is intended.

| Finding | Level | Why it is accepted |
| --- | --- | --- |
| `authenticated_security_definer_function_executable` on `public.get_or_create_dm(uuid)` | WARN | Intended. It is the only way to open a DM, so signed-in users must be able to call it. It is `SECURITY DEFINER` because it writes `private.dm_pairs` and both membership rows, which callers cannot do directly. It pins `search_path = ''`, checks `auth.uid()`, validates the recipient, refuses banned users and blocked pairs, rate limits to 10 new DMs per hour, and `anon` cannot execute it. Covered by `supabase/tests/database/02_functions_triggers.test.sql`. |
| `rls_enabled_no_policy` on `private.admins`, `private.bans`, `private.dm_pairs` | INFO | Intended. RLS with no policy denies every row to API roles; these tables are only read inside `SECURITY DEFINER` helpers and by the service role. The `private` schema is also not exposed through the Data API. |
| `unused_index` | INFO | The database is empty; revisit once there is real traffic. |

## Fixed findings

- `public.rls_auto_enable()` (Supabase's auto-enable-RLS event trigger function, created by the platform, not by our migrations) was executable by `anon` and `authenticated`. `EXECUTE` revoked in `20261024120000_advisor_fixes.sql`; the event trigger still fires.
- `multiple_permissive_policies` on `room_members` INSERT and DELETE: merged into one policy per action in the same migration.
