import { redirect } from "next/navigation";
import { Suspense } from "react";

import { ChatShell } from "@/components/chat/chat-shell";
import { Sidebar, SidebarSkeleton } from "@/components/chat/sidebar";
import { getCurrentUser } from "@/lib/auth/current-user";

export default function ChatLayout({ children }: LayoutProps<"/chat">) {
  return (
    <ChatShell
      sidebar={
        <Suspense fallback={<SidebarSkeleton />}>
          <SidebarLoader />
        </Suspense>
      }
    >
      {children}
    </ChatShell>
  );
}

async function SidebarLoader() {
  const user = await getCurrentUser();
  // Signed in (the proxy checked) but no profile: clear the stale session.
  if (!user) redirect("/auth/reset");
  return <Sidebar user={user} />;
}
