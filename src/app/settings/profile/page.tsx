import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/current-user";

import { ProfileForm } from "./profile-form";

export default function ProfileSettingsPage({ searchParams }: PageProps<"/settings/profile">) {
  return (
    <main id="main-content" className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      {/* A real link styled as a button, so assistive tech announces navigation */}
      <Link href="/chat" className={buttonVariants({ variant: "ghost", className: "self-start" })}>
        <ArrowLeft aria-hidden="true" />
        Back to chat
      </Link>
      <Suspense fallback={<div className="h-72 rounded-[14px] bg-muted" aria-hidden="true" />}>
        <ProfileSettings searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function ProfileSettings({ searchParams }: Pick<PageProps<"/settings/profile">, "searchParams">) {
  const user = await getCurrentUser();
  // Signed in (the proxy checked) but no profile: clear the stale session.
  if (!user) redirect("/auth/reset");
  const { welcome } = await searchParams;

  return (
    <section className="flex flex-col gap-6 rounded-[14px] border bg-card p-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-3xl font-medium">{welcome ? "Welcome to Dites" : "Your profile"}</h1>
        <p className="text-sm text-muted-foreground">
          {welcome
            ? "We picked a username from your account. Change it now or any time later."
            : "This is how other people see you in rooms and direct messages."}
        </p>
      </div>
      <ProfileForm username={user.username} displayName={user.displayName} />
    </section>
  );
}
