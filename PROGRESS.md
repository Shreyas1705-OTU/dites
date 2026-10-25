# Progress

## Current phase
Phase 2: Auth and core chat, steps 0 to 3 done (plan: `~/.claude/plans/zany-snacking-glade.md`).
Phase 1 tagged `v0.1-foundation`. Last session ended 2026-10-25.

## Done
- **Phase 0 and 1** (see tag `v0.1-foundation`): scaffold, schema, RLS, `get_or_create_dm`,
  rate limits, keep-alive (`/api/health`, UptimeRobot every 5 min, daily GitHub Actions ping),
  Vercel deploy at https://dites.vercel.app
- **Phase 2 step 0, design system:** Ink & Paper with a Lapis accent; tokens in `globals.css`,
  self-hosted fonts, light/dark/system toggle (next-themes)
- **Step 1, sessions:** `@supabase/ssr` cookie sessions, `src/proxy.ts` refreshes with
  `getClaims()`, `/auth/callback` (PKCE, `safeNextPath` open-redirect guard), server sign-out,
  `/auth/reset` clears sessions whose account was deleted
- **Step 2, sign-in:** guest (Turnstile captcha), GitHub, Google; guest upgrade via
  `linkIdentity`; profile settings. Verified on production: guest, GitHub and Google sign-in work
- **Step 3, rooms:** `#general` (fixed id, auto-join), sidebar with rooms and DMs (drawer on
  mobile), browse/join public rooms, create rooms (registered users), DMs via username search,
  history with keyset pagination, unique channel-style room names, private-room invites
  (Members panel, owners add/remove registered users), first-letter people search
- Production dashboards configured: GitHub + Google OAuth, Turnstile captcha, anonymous
  sign-ins, manual linking, email off, exact redirect URLs, Realtime public access off
- Tests (all passing locally): 92 pgTAP, 19 Vitest, 20 Playwright (desktop + mobile)

## Next
1. **Deploy step 3 extras** (not yet live): `npx supabase db push --linked`
   (`20261025011243_private_room_members.sql`), then `supabase db advisors --linked`, then
   `git push`. Always database first, then code. Also waiting in the push: the room everyone
   starts in shown as "Global chat" (globe icon), and the larger, centred "Dites" name on the
   sign-in page.
2. **Manual check on production** with GitHub/Google: create a public and a private room, add the
   Google account through Members, confirm it sees the room after refresh, remove it. Also look
   at the sidebar, phone drawer, Browse rooms and New message in light and dark.
3. **Step 4, sending:** composer (Enter / Shift+Enter), client UUIDs, optimistic pending/failed
   states with retry, friendly 429 message.
4. **Step 5, realtime:** trigger-sent Broadcast on private channels + `realtime.messages`
   policies; re-check the `auth_allow_anonymous_sign_ins` advisor finding on that table.
5. Steps 6 and 7: remaining tests, audits (Pro Max checklist, Vercel guidelines, Lighthouse),
   tag `v0.2-chat`.

## Open issues
- Local dev: port 3000 is taken by Open WebUI, so `npm run dev` lands on another port.
  Playwright runs its own build on :3100. Local OAuth would need :3000 (not needed; OAuth is
  tested on production).
- Run e2e with the local secret key for the admin-backed tests:
  `SUPABASE_SECRET_KEY=$(npx supabase status -o json | jq -r .SECRET_KEY) npx playwright test`
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
