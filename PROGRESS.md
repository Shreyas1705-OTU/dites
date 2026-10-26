# Progress

## Current phase
**Phase 2 done, tagged `v0.2-chat` (2026-10-26).** Next: Phase 3, rich chat (plan it first).

## Done
- **Phase 0 and 1** (tag `v0.1-foundation`): scaffold, schema, RLS, `get_or_create_dm`,
  rate limits, keep-alive (`/api/health`, UptimeRobot every 5 min, daily GitHub Actions ping),
  Vercel deploy at https://dites.vercel.app
- **Phase 2** (tag `v0.2-chat`), all live and checked on production:
  - Design system: Ink & Paper with a Lapis accent, Garamond + Geist, light/dark/system
  - Sign-in: guest (Turnstile), GitHub, Google; guest upgrade via `linkIdentity`; profile
    settings; `@supabase/ssr` cookie sessions verified with `getClaims()`; open-redirect guard;
    `/auth/reset` for sessions whose account was deleted
  - Rooms: Global chat (auto-join, can't be left), public and private rooms, unique
    channel-style names, Members panel, owner add/remove, delete room, leave room with
    consequences (5-day rejoin wait with a countdown; removed users can't rejoin), DMs via
    first-letter people search (registered users only)
  - Messages: composer, optimistic sends with client UUIDs, idempotent retries, rate limits,
    plain-text rendering, keyset-paginated history
  - Realtime: trigger-sent Broadcast on private `room:<id>` and `user:<id>` channels,
    `realtime.messages` policy, catch-up on reconnect, 5-minute idle disconnect
  - Guest cleanup: hourly `pg_cron` job deletes guests and their data after 24 hours
  - UI: hideable desktop sidebar (Ctrl/Cmd+B), phone drawer, confirmation popups
  - Audits: axe (WCAG 2.2 AA) clean in light and dark; Vercel Web Interface Guidelines fixes;
    Lighthouse mobile on production: performance 94-98, accessibility/best practices/SEO 100,
    CLS 0.06-0.07
- Tests (all passing): 136 pgTAP, 25 Vitest (21 unit + 4 realtime attack tests), 71 Playwright
  (desktop + mobile, incl. 24 accessibility checks)
- Security Advisor: every finding fixed or explained in `docs/security.md`

## Next
1. **Plan Phase 3 (rich chat)** in plan mode: images (compression, EXIF stripping, private
   bucket, signed URLs; deleting a room or guest must also delete its images), typing
   indicators, presence, unread counts, edit and delete messages, block and report (report
   goes to the admin queue, see Decisions).
2. Phase 4 polish: animations (agreed plan: message arrival, hover, typing cursor; landing
   headline typing in, live #general preview), demo rooms and bot, landing page; also the LCP
   item below.

## Open issues
- Lighthouse mobile LCP is 2.1-2.9 s (simulated slow 4G; the real render is ~130 ms). Launch
  checklist wants under 2 s on a phone: look at font payload (4 files, ~142 KB) and JS in Phase 4.
- Ctrl/Cmd+K quick switcher not built (Phase 13, batch B).
- When checking test output in scripts, match the summary line (`^  N passed`), not the word
  "failed": a test is named "a failed send shows Retry…".
- Local dev: port 3000 is taken by Open WebUI, so `npm run dev` lands on another port.
  Playwright runs its own build on :3100. Local OAuth would need :3000 (not needed; OAuth is
  tested on production).
- Run e2e and the realtime attack tests with the local secret key (admin-backed fixtures):
  `SUPABASE_SECRET_KEY=$(npx supabase status -o json | jq -r .SECRET_KEY) npx playwright test`
  (same variable for `npm test`)
- Owner actions in the Members panel and room creation have no automated e2e (needs a real
  OAuth user); database rules are covered by pgTAP.
- Cold `/api/health` latency 300-900 ms; if warm stays >200 ms, align the Vercel function
  region with the Supabase region
- pgTAP cannot run against the cloud via `supabase test db --linked` (CLI login role cannot
  create the `tests` schema). Needed by Phase 6/7 (CI role or db URL)
- gitleaks not installed (needed for pre-commit secret scan)
- `npm install` reports install scripts pending approval (`npm approve-scripts`); review them

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
