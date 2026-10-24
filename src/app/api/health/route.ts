import { createClient } from "@supabase/supabase-js";
import { connection } from "next/server";

// Pinged by the uptime monitor and a daily GitHub Actions cron. Each call is a
// real round trip into Postgres, which keeps the free Supabase project from
// pausing after 7 idle days. No session and no secrets: it uses the
// publishable key and an RPC that anon is allowed to call.

const TIMEOUT_MS = 5000;

export async function GET() {
  // Opt out of prerendering: this must hit the database on every request.
  await connection();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const headers = { "Cache-Control": "no-store" };

  if (!url || !key) {
    return Response.json({ status: "error", db: "unconfigured" }, { status: 503, headers });
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const started = performance.now();
  const { data, error } = await supabase
    .rpc("health_check")
    .abortSignal(AbortSignal.timeout(TIMEOUT_MS));
  const latencyMs = Math.round(performance.now() - started);

  if (error || data !== true) {
    // Log server-side only; never echo database errors to the caller.
    console.error("health check failed", error?.message);
    return Response.json({ status: "error", db: "unreachable", latencyMs }, { status: 503, headers });
  }

  return Response.json({ status: "ok", db: "ok", latencyMs }, { headers });
}
