import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against the local Supabase stack (npx supabase start)
// and a production build of the app on its own port, so they never collide
// with a dev server. Guest sign-in uses Cloudflare's test Turnstile keys.
const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `${BASE_URL}/api/health`,
    // NEXT_PUBLIC_* values are baked in at build time, so the test build gets
    // its own site URL for redirects.
    env: { NEXT_PUBLIC_SITE_URL: BASE_URL },
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
