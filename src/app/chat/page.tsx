import { LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { signOut } from "@/app/auth/actions";
import { UpgradeBanner } from "@/components/auth/upgrade-banner";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button, buttonVariants } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/current-user";
import { authErrorMessage } from "@/lib/auth/messages";

// Placeholder home for signed-in users until rooms and messages arrive.
export default function ChatPage({ searchParams }: PageProps<"/chat">) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <Suspense fallback={<div className="h-40 rounded-[14px] bg-muted" aria-hidden="true" />}>
        <SignedInHome searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function SignedInHome({ searchParams }: Pick<PageProps<"/chat">, "searchParams">) {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const params = await searchParams;
  const error = authErrorMessage(typeof params.auth_error === "string" ? params.auth_error : null);

  return (
    <>
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <h1 className="truncate text-3xl font-medium">{user.displayName}</h1>
          <p className="text-sm text-muted-foreground">
            @{user.username}
            {user.isGuest && " · Guest"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Link href="/settings/profile" className={buttonVariants({ variant: "ghost", size: "icon" })} aria-label="Profile settings">
            <Settings aria-hidden="true" />
          </Link>
          <form action={signOut}>
            <Button variant="ghost" size="icon" type="submit" aria-label="Sign out">
              <LogOut aria-hidden="true" />
            </Button>
          </form>
        </div>
      </header>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
          {error}
        </p>
      )}
      {user.isGuest && <UpgradeBanner />}

      <section className="flex flex-col items-start gap-2 rounded-[14px] border border-dashed p-6">
        <h2 className="text-2xl font-medium">Rooms are on the way</h2>
        <p className="text-sm text-muted-foreground">
          You&apos;re signed in. #general and direct messages arrive in the next update.
        </p>
      </section>
    </>
  );
}
