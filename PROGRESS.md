# Progress

## Current phase
Phase 1: Foundation (nearly done; waiting on Vercel + uptime monitor)

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
- Daily GitHub Actions keep-alive workflow (`.github/workflows/keep-alive.yml`)

## Next
- Import the repo into Vercel (Hobby), set `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, deploy
- Set GitHub repo variable `HEALTH_URL` to `https://<domain>/api/health`, run the workflow once
- Create a free uptime monitor (e.g. UptimeRobot) on `/api/health`, 5-minute interval
- Document both keep-alive mechanisms in the README
- Tag `v0.1-foundation`, then plan Phase 2 (auth and core chat)

## Open issues
- pgTAP tests cannot run against the cloud via `supabase test db --linked`: the CLI's
  temporary login role cannot create the `tests` schema. Needed by Phase 6/7 (CI role or db URL)
- gitleaks not installed (needed for pre-commit secret scan)
- `npm install` reports install scripts pending approval (`npm approve-scripts`); review before Phase 2

## Known UI issues (address at first screen)
- MASTER.md loads fonts via Google Fonts `@import` (must use `next/font` for CSP)
- No dark palette in MASTER.md
- Primary button spec is white on emerald (3.77:1, fails AA)
- Input border `#E4ECFC` is 1.19:1 (needs 3:1)
- Hover `translateY` contradicts its own no-layout-shift rule
- Landing page pattern (video demo) differs from spec (live `#general` preview)
- Font choice open: Geist (already wired) vs Poppins/Open Sans
