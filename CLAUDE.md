# Dites

> Place this file at the root of the repo (`~/dites`) as `CLAUDE.md`, so Claude Code reads it automatically.

Dites is a public, realtime texting platform built on **Supabase** (auth, Postgres with row-level security, realtime, storage) and **Next.js on Vercel**. Anyone can open the link, try it as a guest in one click, or sign in with GitHub or Google and chat in rooms and DMs with image sharing.

On top of the chat, Dites shows its own engineering: an **X-ray mode** that visualizes each message's journey through the system, a **live status page**, a **public security page** with nightly attack-test results, **offline-first** messaging, **end-to-end encrypted DMs**, and a **case study** explaining how it all works.

This is a **portfolio display project**. What matters, in order:

1. **It always works.** The live link loads and functions any day someone clicks it.
2. **It is secure.** Safe even when an attacker has the public key and calls Supabase directly.
3. **It looks and feels great.** Polished, fast, mobile-friendly. A recruiter enjoys the first 30 seconds.
4. **It stays free.** Supabase free tier + Vercel Hobby. No paid services, nothing that needs a credit card.
5. **It shows real architecture.** RLS, realtime, storage, signed URLs, and encryption used correctly and explainable in an interview.

---

## Working style

- The developer is experienced (FastAPI + React, Kafka + Kibana pipelines). Do not run a tutorial. Build efficiently.
- When using a concept for the first time (an RLS policy, a Realtime channel, a signed URL, anonymous auth, ECDH key agreement), add a one or two sentence explanation of what it does and why, so the developer can explain it in interviews.
- UI is designed during development, screen by screen. UI UX Pro Max sets the design system once; `frontend-design` executes each screen within it. No separate mockup phase.
- Use plan mode at the start of each phase. Show the plan, then build.
- Commit after each working step with a clear message. Tag the end of each phase.
- Be honest about trade-offs and free-tier limits. If something risks "always up", "secure", or "free", say so before doing it.
- Check current Supabase, Next.js, and library docs before using an API. Do not rely on memory for package names or function signatures.
- The repo lives at `~/dites` (GitHub repo name: `dites`). Always run Claude Code from the repo root.
- Keep `PROGRESS.md` updated at the end of each session: current phase, what is done, what is next, open issues.

## Rules for every feature

Every feature, in every phase, must:

1. Have RLS policies on any new table, with `WITH CHECK` on inserts and updates.
2. Add new cases to the attack test suite in `tests/security/` (see Phase 5).
3. Fit the free tier (see Free tier budget). State its expected cost in storage, egress, or realtime messages.
4. Respect encrypted DMs once Phase 8 ships: the server never sees DM plaintext.
5. Work on mobile, in light and dark mode, and with the keyboard.
6. Pass the Security Advisor with no new warnings.

---

## Phase 0: Check skills (do this first)

Most skills are installed once, globally, using `SKILLS_SETUP.md`. UI UX Pro Max is the one exception, installed into this repo. At the start of this project:

1. List the installed global skills and confirm `frontend-design`, the Vercel web interface guidelines audit, and the shadcn/ui skill are present.
2. If any are missing, stop and tell the developer to run `SKILLS_SETUP.md` first. Do not install other skills from inside this project.
3. **Install UI UX Pro Max for this project only** (https://github.com/nextlevelbuilder/ui-ux-pro-max-skill):
   - Check that Python 3 is installed (`python3 --version`); its search scripts need it. If missing, tell the developer to install it. Do not install it yourself.
   - From the repo root, preview first: `npx ui-ux-pro-max-cli init --ai claude --dry-run`. Show what it will write.
   - After approval, install: `npx ui-ux-pro-max-cli init --ai claude`. This writes to `.claude/skills/ui-ux-pro-max/` in this repo.
   - Commit `.claude/skills/ui-ux-pro-max/` so the setup travels with the repo.
   - Record it in `docs/skills.md` with the uninstall command (`npx ui-ux-pro-max-cli uninstall --ai claude`).
   - It is not installed globally and is not uploaded to the Claude app.
4. If `SETUP_LOG.md` notes a Supabase MCP server, offer to set it up for this project only, using the command recorded there.

---

## Stack

| Layer | Choice |
| --- | --- |
| Frontend | Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui |
| Design system | UI UX Pro Max (project skill) + `frontend-design` (global skill) |
| Hosting | Vercel Hobby (free) |
| Backend | Supabase free tier: Auth, Postgres + RLS, Realtime, Storage, Edge Functions, `pg_cron` |
| Realtime delivery | Broadcast sent by database triggers on private channels with their own authorization rules (not Postgres Changes) |
| Client | `@supabase/supabase-js` and `@supabase/ssr` |
| Captcha | Supabase's built-in captcha support with Cloudflare Turnstile (free), required on guest sign-in |
| Local storage | IndexedDB (for example via Dexie) for offline cache, outbox, and encryption keys |
| Encryption | Web Crypto API (built into browsers). No custom cryptographic primitives |
| Images | Client-side compression and EXIF stripping before upload |
| Push | Web Push with VAPID keys, sent from a Supabase Edge Function |
| Testing | Playwright (end-to-end), Vitest (unit), SQL tests for RLS |
| CI | GitHub Actions |
| Uptime | Free uptime monitor (for example UptimeRobot) + GitHub Actions cron |

No custom backend server. Server-side logic runs in Supabase (SQL, RLS, triggers, `pg_cron`, Edge Functions) or in Next.js route handlers on Vercel.

## Free tier budget

Supabase free includes 500 MB database, 1 GB storage, 5 GB egress, 50,000 monthly active users, 200 concurrent realtime connections, and 2 million realtime messages per month. Free projects pause after 7 days of inactivity.

- **Keep it awake (critical).** `/api/health` runs a tiny query and returns status. A free uptime monitor pings it every few minutes (primary). A daily GitHub Actions cron also calls it (backup; GitHub disables scheduled workflows after 60 days without repo activity). Document both in the README.
- **Realtime delivery.** New messages, edits, and deletes are sent by database triggers as Broadcast events on private channels (one per room, plus one per user for unread and DM updates). Channel access is enforced by authorization policies on Realtime's own messages table, mirroring room membership. This avoids Postgres Changes, which runs an RLS check per subscriber per message and slows down as rooms grow. Check the current Supabase docs for the exact trigger functions and channel authorization setup before building.
- **Realtime connections.** One realtime connection per browser tab. Subscribe to the open room plus one lightweight per-user channel for unread updates. Disconnect after a few minutes hidden; reconnect on focus.
- **Realtime messages.** Typing indicators throttled (at most one event per 3 seconds). Read receipts and X-ray acknowledgements only where specified below.
- **Storage.** Images compressed to about 1600px and under 500 KB. Files capped (see Phase 13). Guest uploads deleted with guest accounts.
- **Database.** Message body max 2,000 characters. Metrics tables keep 30 days, pruned by `pg_cron`.
- **Email.** No email-based auth at all. Sign in is GitHub, Google, or guest.

---

## Data model (v1.0)

- `profiles`: id (references `auth.users`), username (unique, 3 to 20 chars, `CHECK` constraint), display_name, avatar_path, is_guest, created_at
- `rooms`: id, type (`public` | `private` | `dm`), name, description, created_by, created_at
- `room_members`: room_id, user_id, role (`owner` | `member`), joined_at, last_read_at
- `messages`: id (UUID generated by the client, for idempotent retries), room_id, user_id, body, image_path, created_at, edited_at, deleted_at
- `blocks`: blocker_id, blocked_id
- `reports`: id, reporter_id, message_id, reason, created_at, resolved
- `bans`: user_id, reason, created_at (private schema)
- `admins`: user_id (private schema)

A DM is a room with `type = 'dm'` and exactly two members. One DM per pair, enforced in the database. DMs are created only through `get_or_create_dm(other_user)`.

Later phases add their own tables; each is listed in its phase.

## Row-level security rules

RLS is enabled on every table. No table is readable without a policy.

- **Profiles:** readable by any logged-in user; writable only by the owner.
- **Public rooms:** readable and joinable by any logged-in user.
- **Private rooms:** readable only by members; only owners add or remove members.
- **DMs:** only the two members can read or write. Cannot open or message a DM with someone who blocked you.
- **Messages:** read only in rooms you belong to; insert only as yourself; edit and soft-delete only your own.
- **Guests (anonymous users):** can read and post in public rooms and DMs, cannot create rooms. Use the `is_anonymous` JWT claim.
- **Banned users:** cannot insert anything.
- **Storage:** a file is readable only by members of its room. Upload path is `room_id/user_id/<uuid>.<ext>`. Served with short-lived signed URLs.
- **Rate limits** (database triggers): messages 20 per minute, room creation 5 per hour, DM creation 10 per hour, reports 10 per hour.

Maintain a test matrix covering each user type x room type x action, asserting allowed vs denied.

---

## Auth and security

Assume attackers will open devtools, take the public anon key, and call Supabase directly. **The UI is never a security boundary. RLS, storage policies, and server-side checks are.**

### Sign-in
- **GitHub and Google OAuth only**, plus **guest** (Supabase anonymous sign-in). No passwords anywhere.
- OAuth uses PKCE (default with `@supabase/ssr`); the callback exchanges the code server-side.
- **Captcha (Turnstile) is required on guest (anonymous) sign-in**, enforced through Supabase Auth settings. Check the current docs for which other methods captcha covers and enable it on any that apply. Supabase captcha does not appear to cover OAuth; if confirmed, rely on GitHub's and Google's own bot protection for those sign-ins.
- Guests upgrade by linking an OAuth identity, keeping their messages. Guests never set an email or password.
- Optional: TOTP two-factor for registered users.

### Sessions
- `@supabase/ssr` with httpOnly, Secure, SameSite=Lax cookies. Never store tokens in `localStorage`.
- Middleware refreshes the session on every request.
- **On the server, trust only `supabase.auth.getUser()` (or the current docs' verified-claims method), never `getSession()`.**
- Refresh token rotation and reuse detection on. Default or shorter access token expiry.
- Sign out revokes the session server-side.

### Redirects
- Redirect allow-list: production domain and `http://localhost:3000` only. No wildcards.
- The callback's `next` parameter must be a relative path starting with `/` and not `//`.

### Keys and secrets
- Only the anon (publishable) key reaches the browser.
- The service role key lives only in Vercel server environment variables and GitHub Actions secrets, used only in server route handlers and CI.
- `.env.local` gitignored. GitHub secret scanning, Dependabot, and a pre-commit secret scan (for example gitleaks).

### Database authorization
- **Every insert and update policy has `WITH CHECK`.**
- **Lock protected columns** (`is_guest`, `role`, `created_at`, a message's `room_id` and `user_id`) with column-level privileges or triggers.
- **Never authorize with `user_metadata`.** Admin status lives in `private.admins`.
- **`SECURITY DEFINER` functions:** `search_path = ''`, fully qualified names, check `auth.uid()`, validate arguments, `REVOKE EXECUTE ... FROM public, anon`, grant to `authenticated` only.
- **Views** use `security_invoker = true`.
- Internal tables live in a non-exposed `private` schema.
- `profiles` never contains email addresses or OAuth tokens.
- Run the **Supabase Security Advisor** after every migration and fix every warning.

### Storage
- Buckets are **private**, with allowed MIME types and size limits set on the bucket so Supabase enforces them.
- Upload only to your own path in rooms you belong to; read only as a room member.
- Signed URLs expire in 1 hour or less. EXIF stripped before upload.

### Content and browser security
- Message text renders as plain text, or through a sanitizing markdown renderer with a strict allow-list (Phase 13). **Never `dangerouslySetInnerHTML` with user content.**
- Links use `rel="noopener noreferrer nofollow"` and `target="_blank"`.
- Usernames validated by a database `CHECK` constraint; block reserved names like `admin` and `dites`.
- Security headers: Content-Security-Policy (scripts from self and Turnstile only, connections to your Supabase project only), `frame-ancestors 'none'`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera, geolocation off; microphone off unless voice features are added), `X-Content-Type-Options: nosniff`.

---

## UI and UX standards

**Design system (UI UX Pro Max).** Before building the first screen, generate and persist the design system:

```
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "realtime chat messaging app, developer portfolio, modern and friendly" --design-system --persist -p "Dites"
```

This creates `design-system/dites/MASTER.md` (colors, typography, spacing, components, effects, anti-patterns, pre-delivery checklist). It is the single source of truth for visual design. Show the developer the result and adjust it together before building. Create page overrides only when a page truly needs to differ (for example `--page "landing"` or `--page "xray"`), saved in `design-system/dites/pages/`.

**How the two design skills work together, so they never conflict:**
- **UI UX Pro Max decides:** style, palette, typography, spacing, UX rules, anti-patterns. Before building any page, read `MASTER.md` and that page's override file if one exists.
- **`frontend-design` executes:** turns those decisions into polished, distinctive components and layouts, staying inside `MASTER.md`.
- If they disagree, `MASTER.md` wins for visual decisions. **This file wins over both** for hard requirements: light and dark mode, accessibility, security headers, and performance.
- **Fonts:** load fonts with `next/font` so they are self-hosted. Never link Google Fonts from the browser, which would break the strict Content-Security-Policy.
- **Icons:** use one SVG icon library consistently (Lucide, which ships with shadcn/ui). No emoji as icons.
- Before finishing any UI phase, run both the Pro Max pre-delivery checklist and the Vercel web interface guidelines audit.

- **Feels instant:** optimistic sends with a pending state, skeleton loaders, no layout shift, auto-scroll that does not jump while reading history
- **Mobile first:** one-handed use; sidebar becomes a drawer; input stays above the keyboard
- **Desktop:** three columns (rooms and DMs, chat, X-ray panel when on)
- **Light and dark mode** following the system setting, with a toggle
- **Good empty states** for no rooms, DMs, messages, or search results
- **Keyboard:** Enter sends, Shift+Enter new line, Escape closes, Ctrl/Cmd+K quick switcher
- **Accessible:** labels, focus states, contrast, reduced motion respected
- **Clear errors:** friendly messages for rate limits, offline, and failed uploads, with retry
- Run the Vercel web interface guidelines audit and Lighthouse at the end of every phase that changes UI

---

## Timeline

About 3 to 4 hours a day. Day counts include a 1.5x buffer over a best-case estimate, because each phase also carries tests, security checks, and UI polish.

| Days | Phase | Tag |
| --- | --- | --- |
| 1 to 2 | 1. Foundation | `v0.1-foundation` |
| 3 to 5 | 2. Auth and core chat | `v0.2-chat` |
| 6 to 7 | 3. Rich chat | `v0.3-rich` |
| 8 | 4. Polish and demo | `v0.4-polish` |
| 9 to 10 | 5. Security hardening and attack test | `v0.5-secure` |
| 11 | 6. Launch | **`v1.0`** |
| 12 | 7. Public security page | `v1.1-security-page` |
| 13 to 17 | 8. End-to-end encrypted DMs | `v1.2-e2ee` |
| 18 to 20 | 9. X-ray mode | `v1.3-xray` |
| 21 to 23 | 10. Offline-first and PWA | `v1.4-offline` |
| 24 | 11. Live status page | `v1.5-status` |
| 25 | 12. Case study | **`v2.0`** |
| 26 onward | 13. Free features, in batches | `v2.x` |

**Why this order:** launch first with the simplest system so the live link exists early. The security page next, to lock in the attack tests as a baseline. Encryption right after, while few DMs exist and before any feature that reads DM content (search, previews, push, offline cache), so those are built correctly once. X-ray after encryption so it can show the database holding only ciphertext. Offline-first after encryption so key storage and the local cache are designed together. Case study last so it describes the finished system.

---

## Phase 1: Foundation (Days 1 to 2)

- Next.js app with Tailwind and shadcn/ui, Supabase project, environment variables, Vercel project linked to the repo
- UI UX Pro Max design system generated, reviewed with the developer, and saved as `design-system/dites/MASTER.md`
- Schema migrations (Supabase CLI), RLS policies, `get_or_create_dm`, rate limit triggers, private schema
- Security baseline: protected columns locked, `SECURITY DEFINER` functions hardened, Security Advisor clean
- RLS test matrix passing
- **Keep-alive from day one:** `/api/health` route (runs a tiny query), deployed to Vercel, with the free uptime monitor pinging it every few minutes and the GitHub Actions daily cron as backup. Supabase must never see 7 idle days, even during development
- `PROGRESS.md` created

## Phase 2: Auth and core chat (Days 3 to 5)

- Guest login with required captcha, GitHub and Google OAuth (PKCE), guest-to-account linking, profile setup
- `@supabase/ssr` cookies and middleware; server code uses `getUser()` only; callback rejects external `next` URLs
- Rooms, joining, DMs, message sending, history with cursor pagination
- Realtime via trigger-sent Broadcast on private channels, with channel authorization matching room membership; tests prove a non-member cannot join a room's channel or receive its events
- DMs are plaintext until Phase 8 and will be wiped at the encryption migration (see Phase 8)
- **Check:** a guest and a signed-in user chat in a room and a DM in real time

## Phase 3: Rich chat (Days 6 to 7)

- Image sharing with compression, EXIF stripping, and signed URLs
- Typing indicators (throttled), presence, unread counts, edit and delete, block and report

## Phase 4: Polish and demo (Day 8)

- Full UI and UX pass, desktop and phone
- Seed script: 4 public rooms (`#general`, `#toronto`, `#tech-talk`, `#random`) with realistic history from demo users
- A demo bot in `#general` that replies with friendly canned responses (database trigger or `pg_cron`, rate limited, no external services)
- Landing page: one-line pitch, live preview of `#general`, **Try as guest** and **Sign in with GitHub or Google**
- First-visit hint: "Open Dites in another tab to see messages arrive in real time"

## Phase 5: Security hardening and attack test (Days 9 to 10)

- Security headers and CSP, bans, all rate limits, admin report queue, account deletion route (verifies with `getUser()`, deletes data and auth user with the service role)
- Redirect allow-list, secret scanning, Dependabot
- **Attack test suite** in `tests/security/`. Using only the anon key and a normal user's token, each must fail:
  1. Read messages in a private room or DM you are not in
  2. Update or delete another user's message
  3. Insert a message with someone else's `user_id`
  4. Change your own message's `room_id` or `user_id`
  5. Set your own `is_guest` to false or give yourself admin
  6. Edit `user_metadata` and gain any extra access
  7. Read the `admins`, `bans`, or `reports` tables
  8. Call `get_or_create_dm` as `anon`, or with a user who blocked you
  9. Upload to another user's path, a disallowed file type, or an oversized file
  10. Fetch a file from a room you are not in, or reuse an expired signed URL
  11. Send 50 messages in a minute
  12. Use the auth callback with `next=https://evil.com` or `next=//evil.com`
  13. Inject `<script>` or an `onerror` image tag in a message, username, or room name and see it execute
  14. Call any server route without a session, or with a forged cookie
  15. Subscribe to a private room's or another user's realtime channel and receive its events
- Results and explanations in `docs/security.md`

## Phase 6: Launch (Day 11)

- Confirm the keep-alive set up in Phase 1 is healthy; guest cleanup job (`pg_cron`, guests and their data deleted after 24 hours)
- Re-run attack tests and Security Advisor against production
- Privacy page: what is stored, how to delete your account
- Playwright end-to-end suite passing against production
- README: live link at the top, 30-second demo GIF, architecture diagram, free-tier design decisions
- **Launch checklist:**
  - [ ] Live link loads in under 2 seconds on a phone
  - [ ] Try as guest works in one click
  - [ ] Two tabs show realtime messages, typing, and presence
  - [ ] Images upload, display, and are blocked for non-members
  - [ ] All attack tests fail as expected against production
  - [ ] Security Advisor shows no warnings
  - [ ] Security headers verified (for example with securityheaders.com)
  - [ ] Uptime monitor green for at least 48 hours
  - [ ] Guest cleanup job ran successfully
  - [ ] No secrets in the repo

## Phase 7: Public security page (Day 12)

- GitHub Actions runs the attack suite **nightly against production**, using dedicated test accounts that are excluded from metrics and cleaned up after each run
- Results stored in `private.security_runs` (run time, test id, passed, duration), written by CI with the service role key from GitHub secrets
- A `SECURITY DEFINER` function exposes only the latest summary to the public
- `/security` page: "15 of 15 attacks blocked, last checked 3 hours ago", each test with a plain-language explanation of what it proves, plus the security design (RLS, no passwords, CSP, rate limits)
- If any test fails: the page shows it honestly, and CI opens a GitHub issue

## Phase 8: End-to-end encrypted DMs (Days 13 to 17)

**Goal:** DM text and DM images are encrypted in the browser. The database and Supabase only ever store ciphertext.

Design (use Web Crypto only; no custom primitives):
- **One key pair per user, not per device.** ECDH (P-256, or X25519 if supported in all target browsers).
- **Key setup (signed-in users):** generate the key pair, then immediately wrap the private key with a key derived from a **mandatory** recovery passphrase (PBKDF2 with a high iteration count, or Argon2 via a vetted library) and store the wrapped key in `key_backups` (user_id, wrapped_key, salt, kdf_params, key_version). Then keep only a **non-extractable** copy in IndexedDB. The private key exists in extractable form only for that single wrap step, in memory.
- **New device:** the user enters their passphrase; the backup is unwrapped directly as a non-extractable key into IndexedDB.
- **Forgotten passphrase:** the user can reset their keys, which makes all old DMs unreadable. Say this clearly in the UI before they confirm.
- **Schema:** `user_keys` (user_id, public_key, key_version, created_at), one active key per user. Old versions are kept so the UI can show "this message was encrypted with a previous key". RLS: anyone logged in can read public keys; only the owner can insert a new version; nobody can update or delete an existing row.
- For each DM, derive a shared key with ECDH + HKDF. Encrypt each message with AES-GCM and a random 12-byte IV.
- `messages` gains `ciphertext`, `iv`, `enc_version`. For DMs, `body` is always null; a database `CHECK` enforces it.
- DM images are encrypted in the browser before upload; the encrypted blob goes to storage.
- **Safety numbers:** each DM shows a fingerprint of both public keys that two users can compare to detect key substitution.
- **Guests:** get a device-only key with no backup and no passphrase. History is lost when the guest account expires or the browser is cleared.
- **Existing plaintext DMs:** the migration deletes all DM messages and DM images sent before encryption (DM rooms and memberships stay). Users see a one-time in-app notice: "DMs were reset when end-to-end encryption launched." After the migration, the `CHECK` constraint blocks any new plaintext DM.
- **Feature consequences, documented in `docs/encryption.md`:** DM search happens only in the browser, link previews are off in DMs, push notifications for DMs say only "New message", and metadata (who talks to whom, and when) is still visible to the server. There is no forward secrecy with static keys; say so honestly.
- **New attack tests:** reading a DM row directly returns only ciphertext; tampered ciphertext fails to decrypt (AES-GCM auth tag); inserting a DM with a plaintext `body` is rejected; another user's public key cannot be overwritten.
- **Never:** send DM plaintext to the server, log it, or store private keys unwrapped anywhere but non-extractable IndexedDB.

## Phase 9: X-ray mode (Days 18 to 20)

A toggle that visualizes the architecture from the "Let's design Supabase" video, live and with real data.

- **Panel:** right column on desktop, bottom sheet on mobile. Off by default.
- **Message journey:** for each message you send, show the steps with real timings: client send, Postgres insert acknowledged, matched policy, trigger-sent Broadcast on the room's private channel, and delivered to N recipients. Recipients with X-ray on send a lightweight acknowledgement over Broadcast, only while X-ray is on, to protect the realtime budget.
- **Matched policy is derived, not reported.** Postgres does not say which policy allowed a row, so the panel computes it from a lookup keyed on room type and action and labels it "matched policy (derived from the rules)". Never present it as reported by the database.
- **RLS demo:** a "Try reading a private room as an outsider" button runs a real query as the current user and shows it returning nothing, with the rule that blocked it (also labeled as derived from the rules).
- **Encryption view (DMs):** side by side, the raw database row (ciphertext) and the decrypted text on screen.
- **Storage view:** shows the signed URL, its expiry countdown, and that it fails after expiry.
- **Connection view:** realtime channel state, reconnects, and offline outbox count (after Phase 10).
- Never expose secrets, other users' data, or anything RLS would hide. X-ray only displays what the current user is already allowed to see.

## Phase 10: Offline-first and PWA (Days 21 to 23)

- IndexedDB cache of rooms, recent messages, and profiles; the app opens instantly from cache, then syncs
- **Outbox:** messages sent offline are queued with client-generated UUIDs and sent on reconnect; the UUID makes retries idempotent (no duplicates)
- Catch-up on reconnect: fetch messages after the last seen cursor per room
- Clear UI states: offline banner, pending and failed message indicators, retry
- Encrypted DM content is cached only as ciphertext or with keys that stay non-extractable; decrypt on display
- **PWA:** manifest, icons, service worker for the app shell, installable on phones and desktop
- Clear the local cache on sign out
- Tests: Playwright with network throttling and offline mode

## Phase 11: Live status page (Day 24)

- `/api/health` records a heartbeat (at most one per 5 minutes) in `private.health_pings`
- Clients report a sampled delivery latency (send to first realtime receipt, about 1 in 10 messages) via a rate-limited function into `private.latency_samples`; no message content, no user ids stored
- `/status` page: uptime percentage since launch and last 30 days, p50 and p95 delivery latency, messages today, people online now (presence count), last incident
- Data older than 30 days pruned by `pg_cron`, except a daily summary row
- **Only real measured numbers.** Never seed or fake metrics.

## Phase 12: Case study (Day 25)

- `/how-it-works` page: the problem, the architecture (diagram), how RLS and realtime work, the security model and attack tests, encryption design and its honest limits, free-tier decisions, what was learned
- Draft it from `docs/`; the developer edits it into their own voice
- Also draft a LinkedIn post linking the live site
- Use only real numbers from `/status` and the security runs
- **Tag `v2.0`**

## Phase 13: Free features (Day 26 onward, in batches)

Build in batches of 3 or 4, each batch tagged `v2.1`, `v2.2`, and so on. Each feature follows the Rules for every feature. Features that touch DM content must respect encryption.

**Batch A: messaging essentials**
- **Reactions:** `reactions` (message_id, user_id, emoji), unique per user per emoji, emoji picker
- **Replies:** quote a message (`reply_to_id`); jump to the original on click
- **Mentions:** `@username` with autocomplete, highlights, and a mention badge
- **Pinned messages:** room owners pin up to 10 messages per room

**Batch B: search and organization**
- **Message search:** Postgres full-text search for rooms (RLS applies automatically); DM search runs in the browser over the local decrypted cache
- **Threads:** `thread_root_id` with a side thread view
- **Quick switcher:** Ctrl/Cmd+K to jump to any room or DM
- **Drafts:** unsent text saved per room in local storage

**Batch C: rich content**
- **Message formatting:** bold, italic, code, and links via a sanitizing markdown renderer with a strict allow-list; covered by XSS attack tests
- **Link previews (rooms only):** fetched by a Next.js route that guards against SSRF (http/https only, block private and local IP ranges after DNS resolution, 3-second timeout, size cap, no redirects to private ranges); cached in a table. Off in encrypted DMs
- **GIFs:** search via a free GIF API (verify current free terms before choosing); served from the provider, not stored
- **Polls:** `polls`, `poll_options`, `poll_votes`, one vote per user, results live

**Batch D: people and presence**
- **Profiles:** bio, avatar, join date, shared rooms
- **Themes:** user-chosen accent color, saved to profile
- **Read receipts:** "Seen by" in DMs and rooms under 20 members only, to protect the realtime budget
- **Room moderation:** owners can remove members, delete messages in their room, and create expiring invite links for private rooms (signed, single-use or time-limited)

**Batch E: notifications and files**
- **Web Push notifications:** opt-in, `push_subscriptions` table, sent by a Supabase Edge Function on new messages for offline users; mentions and DMs only by default; DM pushes say only "New message"; per-room mute
- **File sharing:** PDF and plain text only, 2 MB cap, bucket-enforced MIME types and size, served with `Content-Disposition: attachment`; encrypted in DMs
- **Notification settings:** mute rooms, mute DMs, quiet hours

**Not in scope (not free or not safe on the free tier):** voice and video calls, unlimited file sizes, AI features with paid APIs, email notifications, native app store apps. Do not build these without asking.

---

## Never do

- Never use the service role key in the browser or in client code
- Never disable RLS on any table, even temporarily in production
- Never authorize anything using `user_metadata`
- Never trust `getSession()` on the server
- Never render user content as raw HTML
- Never send, log, or store DM plaintext on the server once Phase 8 ships
- Never store private encryption keys unwrapped outside non-extractable IndexedDB
- Never show fake or seeded numbers on `/status`, `/security`, or `/how-it-works`
- Never add email and password sign-in, paid services, or anything requiring a credit card
- Never add features outside this file without asking first
