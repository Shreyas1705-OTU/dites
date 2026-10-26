"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { createClient } from "@/lib/supabase/client";

// Same idle rule as the room channel: once both are removed, Realtime closes
// the tab's WebSocket, which is what saves the free-tier connection budget.
const HIDDEN_DISCONNECT_MS = 5 * 60 * 1000;

// Listens on this user's own private channel (user:<id>), where the database
// announces membership changes: a new DM, being added to a private room, or
// being removed from one. A refresh re-renders the server-side sidebar, and
// a room you were removed from turns into "Room not found".
export function MembershipListener({ userId }: { userId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let hiddenTimer: ReturnType<typeof setTimeout> | undefined;
    let connecting = false;
    let cancelled = false;
    let missedWhileAway = false;

    const connect = async () => {
      if (channel || connecting || cancelled) return;
      connecting = true;
      await supabase.realtime.setAuth();
      connecting = false;
      if (cancelled || channel) return;
      channel = supabase
        .channel(`user:${userId}`, { config: { private: true } })
        .on("broadcast", { event: "membership.added" }, () => router.refresh())
        .on("broadcast", { event: "membership.removed" }, () => router.refresh())
        .subscribe((status) => {
          // After a disconnect, changes may have happened while we weren't listening.
          if (status === "SUBSCRIBED" && missedWhileAway) {
            missedWhileAway = false;
            router.refresh();
          }
        });
    };

    const disconnect = () => {
      if (!channel) return;
      void supabase.removeChannel(channel);
      channel = null;
      missedWhileAway = true;
    };

    const onVisibility = () => {
      clearTimeout(hiddenTimer);
      if (document.visibilityState === "hidden") {
        hiddenTimer = setTimeout(disconnect, HIDDEN_DISCONNECT_MS);
      } else {
        void connect();
      }
    };

    void connect();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      clearTimeout(hiddenTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [router, userId]);

  return null;
}
