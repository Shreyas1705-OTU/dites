import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

// Recovery for a session whose account no longer exists (deleted user, or a
// profile that was removed). The access token stays valid until it expires,
// so the proxy still treats the visitor as signed in; without this, / and
// /chat would redirect to each other. Only clears the session when there
// really is no profile, so a link to this URL cannot sign anyone out.
export async function GET() {
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const user = await getCurrentUser();
  if (user) {
    return NextResponse.redirect(new URL("/chat", origin));
  }

  const supabase = await createClient();
  // Local scope: the server-side session is already gone with the user.
  await supabase.auth.signOut({ scope: "local" });
  return NextResponse.redirect(new URL("/", origin));
}
