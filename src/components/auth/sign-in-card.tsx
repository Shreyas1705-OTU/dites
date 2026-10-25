"use client";

import { Loader2, UserRound } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { GitHubIcon, GoogleIcon } from "@/components/auth/provider-icons";
import { Turnstile } from "@/components/auth/turnstile";
import { Button } from "@/components/ui/button";
import { authErrorMessage } from "@/lib/auth/messages";
import { safeNextPath } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/supabase/client";

type Pending = "guest" | "github" | "google" | null;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "";

function guestErrorMessage(code: string | undefined): string {
  if (code === "captcha_failed") return "We couldn't confirm you're a person. Try again.";
  if (code === "over_request_rate_limit") {
    return "Too many guest sign-ins from this network. Try again in an hour, or continue with GitHub or Google.";
  }
  return "Couldn't start a guest session. Check your connection and try again.";
}

export function SignInCard() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));

  const [token, setToken] = useState<string | null>(null);
  const [captchaBroken, setCaptchaBroken] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(() => authErrorMessage(params.get("auth_error")));

  async function signInAsGuest() {
    if (!token) return;
    setPending("guest");
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInAnonymously({ options: { captchaToken: token } });
    // Turnstile tokens are single-use: always get a fresh one.
    setResetKey((k) => k + 1);
    if (error) {
      setPending(null);
      setError(guestErrorMessage(error.code));
      return;
    }
    router.replace(next);
    router.refresh();
  }

  async function signInWith(provider: "github" | "google") {
    setPending(provider);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${SITE_URL}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    // On success the browser is already navigating to the provider.
    if (error) {
      setPending(null);
      setError("Couldn't reach the sign-in provider. Please try again.");
    }
  }

  const busy = pending !== null;
  const guestLabel = captchaBroken ? "Guest sign-in unavailable" : token ? "Try as guest" : "Checking your browser…";

  return (
    <div className="flex w-full flex-col gap-5 rounded-[14px] border bg-card p-6 sm:p-8">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-3xl font-medium">Join the conversation</h2>
        <p className="text-sm text-muted-foreground">
          No passwords. Jump in as a guest, or sign in to keep your name and history.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <Button size="lg" onClick={signInAsGuest} disabled={busy || !token} aria-busy={pending === "guest"}>
          {pending === "guest" || (!token && !captchaBroken) ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <UserRound aria-hidden="true" />
          )}
          {pending === "guest" ? "Starting your session…" : guestLabel}
        </Button>
        <Turnstile
          onToken={setToken}
          onError={() => setCaptchaBroken(true)}
          resetKey={resetKey}
        />
        {captchaBroken && (
          <p className="text-sm text-muted-foreground">
            The captcha didn&apos;t load. A content blocker may be stopping it; you can still continue with GitHub
            or Google.
          </p>
        )}

        <div className="flex items-center gap-3 py-1 text-xs tracking-[0.06em] text-muted-foreground uppercase">
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>

        <Button variant="outline" size="lg" onClick={() => signInWith("github")} disabled={busy}>
          {pending === "github" ? <Loader2 className="animate-spin" aria-hidden="true" /> : <GitHubIcon />}
          Continue with GitHub
        </Button>
        <Button variant="outline" size="lg" onClick={() => signInWith("google")} disabled={busy}>
          {pending === "google" ? <Loader2 className="animate-spin" aria-hidden="true" /> : <GoogleIcon />}
          Continue with Google
        </Button>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Guests can link GitHub or Google later to keep their account. Dites never asks for or stores a password.
      </p>
    </div>
  );
}
