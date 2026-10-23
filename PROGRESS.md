# Progress

## Current phase
Phase 0: Check skills

## Done
- Repo initialized, `CLAUDE.md` spec added

## Next
- Phase 0: install UI UX Pro Max (project-only)
- Phase 1: Foundation (Next.js scaffold, Supabase schema + RLS, keep-alive)

## Open issues
- Supabase cloud project not created yet
- Vercel project not linked yet
- gitleaks not installed (needed for pre-commit secret scan)

## Known UI issues (address at first screen)
- MASTER.md loads fonts via Google Fonts `@import` (must use `next/font` for CSP)
- No dark palette in MASTER.md
- Primary button spec is white on emerald (3.77:1, fails AA)
- Input border `#E4ECFC` is 1.19:1 (needs 3:1)
- Hover `translateY` contradicts its own no-layout-shift rule
- Landing page pattern (video demo) differs from spec (live `#general` preview)
- Font choice open: Geist (already wired) vs Poppins/Open Sans
