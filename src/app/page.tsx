import { Suspense } from "react";

import { SignInCard } from "@/components/auth/sign-in-card";
import { ThemeToggle } from "@/components/theme-toggle";

// Sign-in screen (the full landing page arrives in Phase 4). Signed-in
// visitors never see it: the proxy sends them straight to /chat.
export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      {/* Three columns keep the name centred on the page, not between edge and toggle. */}
      <header className="grid grid-cols-[1fr_auto_1fr] items-center px-4 py-4 sm:px-6">
        <span aria-hidden="true" />
        <span className="font-heading text-4xl font-semibold tracking-tight">Dites</span>
        <div className="justify-self-end">
          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-10 px-4 pt-6 pb-16 sm:px-6 md:grid-cols-[1.1fr_1fr] md:gap-16">
        <section className="flex flex-col gap-5">
          <p className="font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">
            dites · /dit/ · French, &ldquo;say it&rdquo;
          </p>
          <h1 className="text-5xl leading-[1.02] font-medium tracking-tight sm:text-6xl">
            Say it, share it, <em className="font-normal">dites it.</em>
          </h1>
          <p className="max-w-[46ch] text-lg text-muted-foreground">
            Easy, real-time and secure messaging, right in your browser.
          </p>
        </section>

        <Suspense fallback={<SignInCardSkeleton />}>
          <SignInCard />
        </Suspense>
      </div>
    </main>
  );
}

// Same footprint as the card, so nothing shifts when it hydrates.
function SignInCardSkeleton() {
  return (
    <div aria-hidden="true" className="flex w-full flex-col gap-5 rounded-[14px] border bg-card p-6 sm:p-8">
      <div className="h-9 w-3/4 rounded-md bg-muted" />
      <div className="h-4 w-full rounded bg-muted" />
      <div className="flex flex-col gap-3">
        <div className="h-11 rounded-lg bg-muted" />
        <div className="h-5" />
        <div className="h-11 rounded-lg bg-muted" />
        <div className="h-11 rounded-lg bg-muted" />
      </div>
    </div>
  );
}
