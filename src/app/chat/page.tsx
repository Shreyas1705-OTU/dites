import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { buttonVariants } from "@/components/ui/button";
import { authErrorMessage } from "@/lib/auth/messages";
import { GENERAL_ROOM_ID } from "@/lib/chat/data";

// /chat itself has nothing to show: open Global chat, unless a sign-in or
// account-link error needs explaining first.
export default function ChatIndex({ searchParams }: PageProps<"/chat">) {
  return (
    <Suspense>
      <ChatIndexContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ChatIndexContent({ searchParams }: Pick<PageProps<"/chat">, "searchParams">) {
  const params = await searchParams;
  const error = authErrorMessage(typeof params.auth_error === "string" ? params.auth_error : null);
  if (!error) redirect(`/chat/${GENERAL_ROOM_ID}`);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <p role="alert" className="max-w-md text-muted-foreground">
        {error}
      </p>
      <Link href={`/chat/${GENERAL_ROOM_ID}`} className={buttonVariants()}>
        Go to Global chat
      </Link>
    </main>
  );
}
