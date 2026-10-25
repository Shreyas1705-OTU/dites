"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";

import { GitHubIcon, GoogleIcon } from "@/components/auth/provider-icons";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "";

// Guests keep their user id (and so their messages) by linking an OAuth
// identity to the anonymous user. Supabase then clears is_anonymous, and a
// database trigger flips profiles.is_guest to false.
export function UpgradeBanner() {
  const [pending, setPending] = useState<"github" | "google" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function link(provider: "github" | "google") {
    setPending(provider);
    setError(null);
    const { error } = await createClient().auth.linkIdentity({
      provider,
      options: { redirectTo: `${SITE_URL}/auth/callback?next=/chat` },
    });
    if (error) {
      setPending(null);
      setError("Couldn't start linking. Please try again.");
    }
  }

  return (
    <section
      aria-labelledby="upgrade-title"
      className="flex flex-col gap-3 rounded-[14px] border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex flex-col gap-1">
        <h2 id="upgrade-title" className="font-sans text-sm font-semibold">
          You&apos;re chatting as a guest
        </h2>
        <p className="text-sm text-muted-foreground">
          Link GitHub or Google to keep your name and messages.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => link("github")} disabled={pending !== null}>
          {pending === "github" ? <Loader2 className="animate-spin" aria-hidden="true" /> : <GitHubIcon />}
          Keep with GitHub
        </Button>
        <Button variant="outline" onClick={() => link("google")} disabled={pending !== null}>
          {pending === "google" ? <Loader2 className="animate-spin" aria-hidden="true" /> : <GoogleIcon />}
          Keep with Google
        </Button>
      </div>
    </section>
  );
}
