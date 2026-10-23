# Skills

## Global (installed via SKILLS_SETUP.md, not in this repo)
- `frontend-design`: executes each screen within the design system
- `web-design-guidelines`: Vercel web interface guidelines audit
- `shadcn`: shadcn/ui component management

## Project-only: UI UX Pro Max
- Source: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill (`ui-ux-pro-max-cli` v2.15.0)
- Path: `.claude/skills/ui-ux-pro-max/` (committed, travels with the repo)
- Not installed globally, not uploaded to the Claude app.
- Requires Python 3 for `scripts/search.py`. Scripts read bundled local data only (no network calls).

**Install note:** `uipro init --ai claude` (v2.15.0) has no `--dry-run` and installs a 7-skill bundle
(`ui-ux-pro-max`, `ui-styling`, `design-system`, `design`, `brand`, `banner-design`, `slides`).
Only `ui-ux-pro-max` is kept here. The others overlap with the global `shadcn` and
`frontend-design` skills or are out of scope (logos, banners, slides).

**Uninstall:** delete the folder.
```
rm -rf .claude/skills/ui-ux-pro-max
```
(`npx ui-ux-pro-max-cli uninstall --ai claude` would also remove the other bundle skills, which are not installed here.)
