import { NextResponse, type NextRequest } from "next/server";

import { safeNextPath } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/supabase/server";

// OAuth return URL for GitHub/Google sign-in and for guests linking an
// account. With PKCE, the provider sends back a one-time `code`; exchanging it
// here, on the server, requires the code verifier that @supabase/ssr stored in
// a cookie when the flow started, so a stolen code alone is useless.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  // Redirect to our own configured origin. Never build it from the
  // x-forwarded-host header, which a client can set.
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // A brand-new account gets one stop at profile setup to confirm the
      // username we generated. Guests linking an account are not new.
      const user = data.user;
      const isNew = Date.now() - Date.parse(user.created_at) < 2 * 60 * 1000 && !user.is_anonymous;
      const target = isNew ? `/settings/profile?welcome=1` : next;
      return NextResponse.redirect(new URL(target, origin));
    }
    console.error("auth callback: code exchange failed", error.code);
  }

  // Provider errors (e.g. identity_already_exists when linking) arrive as
  // query params; pass only the known code through, never free text.
  const providerError = searchParams.get("error_code");
  const reason = providerError && /^[a-z_]{1,64}$/.test(providerError) ? providerError : "sign_in_failed";
  return NextResponse.redirect(new URL(`/?auth_error=${reason}`, origin));
}
