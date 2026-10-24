# Dites

**Live: https://dites.vercel.app**

A public, realtime texting platform built on Supabase (Auth, Postgres with
row-level security, Realtime, Storage) and Next.js on Vercel. Work in progress;
see [`PROGRESS.md`](PROGRESS.md).

## Development

```bash
npm install
npx supabase start            # local Postgres, Auth, Realtime, Storage (Docker)
npx supabase migration up --local
npm run dev
```

`.env.local` needs `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Only the publishable key ever reaches
the browser.

### Database tests

```bash
npx supabase test db --local  # pgTAP: RLS matrix, functions, triggers, rate limits
```

## Free tier: keeping it awake

Free Supabase projects pause after 7 days without activity. Two independent
pingers call [`/api/health`](https://dites.vercel.app/api/health), which makes a
real round trip into Postgres through the Data API (`public.health_check()`)
and returns `200 {"status":"ok"}` or `503`:

| Pinger | Interval | Notes |
| --- | --- | --- |
| UptimeRobot (free) | every 5 minutes | Primary. Also alerts if the site goes down. |
| GitHub Actions, [`keep-alive.yml`](.github/workflows/keep-alive.yml) | daily | Backup. Reads the `HEALTH_URL` repository variable. GitHub disables scheduled workflows after 60 days without repository activity, so this alone is not enough. |

The route uses no session and no secrets, and the response is never cached, so
every ping reaches the database.
