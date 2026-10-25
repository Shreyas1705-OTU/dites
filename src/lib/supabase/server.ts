import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";

import type { Database } from "./database.types";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env";

// Server client for Server Components, Server Actions and Route Handlers.
// Create one per request; never share it between requests.
//
// To know who the user is, call supabase.auth.getClaims() (verifies the JWT
// signature) or getUser() (asks the Auth server). Never trust getSession() on
// the server: it decodes the cookie without verifying it.
export async function createClient() {
  // Session checks compare token expiry with the current time, so they must
  // run per request. connection() tells Cache Components not to prerender
  // past this point (otherwise Next flags the Date.now() inside auth-js).
  await connection();
  const cookieStore = await cookies();

  return createServerClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot set cookies. The proxy refreshes the
          // session on every request, so this is safe to ignore.
        }
      },
    },
  });
}
