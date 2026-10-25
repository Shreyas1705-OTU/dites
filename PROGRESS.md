# Progress

## Current phase
Phase 2: Auth and core chat (planning). Phase 1 tagged `v0.1-foundation`

## Done
- Phase 0: skills checked, UI UX Pro Max installed project-only (`docs/skills.md`)
- Next.js 16 + TypeScript + Tailwind v4 + shadcn/ui (Base UI, Lucide) scaffold
- Supabase project created and linked (`kemgelxaeqlkufpjeasu`); local stack via CLI
- Design system generated: `design-system/dites/MASTER.md` (not yet reviewed; see Known UI issues)
- Migrations (applied locally and in the cloud):
  - `20261023130000_core_schema`: tables, private schema, `dm_pairs`, `bans`, `admins`
  - `20261023131000_rls_policies`: RLS policies, column-level grants, hardened helpers
  - `20261023132000_functions_and_triggers`: signup profiles, owner membership,
    edit/delete normalisation, `get_or_create_dm`, rate limits (PT429 = HTTP 429)
  - `20261024120000_advisor_fixes`: revoke `rls_auto_enable()`, merged `room_members` policies
  - `20261024130000_health_check`: `public.health_check()` for keep-alive
- pgTAP tests: 77 passing locally (`npx supabase test db --local`)
- Security Advisor (cloud): only the intended `get_or_create_dm` warning; recorded in `docs/security.md`
- `/api/health` route (200 ok / 503, `no-store`), verified against the cloud database
- Daily GitHub Actions keep-alive workflow (`.github/workflows/keep-alive.yml`); `HEALTH_URL` set, manual run passed
- Deployed to Vercel Hobby: https://dites.vercel.app (`/api/health` returns ok)
- README started: live link, dev setup, keep-alive design
- UptimeRobot monitor on `/api/health` every 5 minutes (primary keep-alive)

## Next
- Plan Phase 2 (auth and core chat) in plan mode, then build

## Open issues
- Cold `/api/health` latency 300-900 ms; if warm stays >200 ms, align the Vercel function region with the Supabase region
- pgTAP tests cannot run against the cloud via `supabase test db --linked`: the CLI's
  temporary login role cannot create the `tests` schema. Needed by Phase 6/7 (CI role or db URL)
- gitleaks not installed (needed for pre-commit secret scan)
- `npm install` reports install scripts pending approval (`npm approve-scripts`); review before Phase 2

## Decisions
- **Reports (decided 2026-10-25):** reports go to an admin queue and an admin acts on each one:
  ban a registered user (`private.bans`), or delete a guest account with its messages (server
  route with the secret key). Reports never trigger automatic bans. Report button in Phase 3,
  admin queue and actions in Phase 5.
- **People search:** type-ahead from the first letter on display name or username; lists
  registered users only. A guest appears only when their exact `guest_xxxxx` name is typed.
- **Private rooms:** owners add and remove members by username; only registered users can be
  added (guests are limited to public rooms and DMs, enforced by RLS). Invite links: Phase 13.

## Design system
- Ink & Paper with a Lapis accent, EB Garamond (display) + Geist (text) + Geist Mono.
  Final spec with measured contrast ratios: `design-system/dites/MASTER.md`. All earlier
  generated-file issues (Google Fonts import, no dark palette, failing contrast, hover
  transforms, video landing pattern) are resolved there.
