"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { createClient } from "@/lib/supabase/client";

// Listens on this user's own private channel (user:<id>), where the database
// announces membership changes: a new DM, being added to a private room, or
// being removed from one. A refresh re-renders the server-side sidebar, and
// a room you were removed from turns into "Room not found".
export function MembershipListener({ userId }: { userId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    void (async () => {
      await supabase.realtime.setAuth();
      if (cancelled) return;
      channel = supabase
        .channel(`user:${userId}`, { config: { private: true } })
        .on("broadcast", { event: "membership.added" }, () => router.refresh())
        .on("broadcast", { event: "membership.removed" }, () => router.refresh())
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [router, userId]);

  return null;
}
