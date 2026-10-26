"use client";

import { Loader2 } from "lucide-react";
import { useState, useSyncExternalStore, useTransition } from "react";

import { joinRoom } from "@/app/chat/actions";
import { Button } from "@/components/ui/button";
import type { Departure } from "@/lib/chat/data";

const DAY_MS = 24 * 60 * 60 * 1000;

// A clock that ticks hourly, so countdowns move on without a reload. The
// server snapshot is null: the countdown depends on the viewer's "now", so
// it renders after hydration.
let hourlyNow = Date.now();
function subscribeHourly(onChange: () => void) {
  // Catch up first: the module-level clock may be hours old in a long-lived tab.
  hourlyNow = Date.now();
  onChange();
  const timer = setInterval(() => {
    hourlyNow = Date.now();
    onChange();
  }, 60 * 60 * 1000);
  return () => clearInterval(timer);
}
function useHourlyNow() {
  return useSyncExternalStore(subscribeHourly, () => hourlyNow, () => null);
}

// "Rejoin in 4 days", counting down a day at a time (rounded up, so a room
// you left 4.2 days ago says "in 1 day").
export function rejoinLabel(rejoinAt: string, now: number) {
  const days = Math.max(1, Math.ceil((Date.parse(rejoinAt) - now) / DAY_MS));
  return `Rejoin in ${days} ${days === 1 ? "day" : "days"}`;
}

export function RejoinCountdown({ rejoinAt }: { rejoinAt: string }) {
  const now = useHourlyNow();
  return <span className="tabular-nums">{now === null ? "\u00a0" : rejoinLabel(rejoinAt, now)}</span>;
}

type Props = {
  roomId: string;
  // How the room reads: "Global chat" or "#book-club".
  title: string;
  description: string | null;
  // Set when you can't join it yourself (removed, or left recently).
  departure: Departure | null;
};

// Public rooms are visible to everyone signed in, but their messages are
// readable only by members (RLS), so non-members see this instead.
export function JoinRoom({ roomId, title, description, departure }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex flex-col gap-1.5">
        <p className="font-heading text-3xl">{title}</p>
        {description && <p className="max-w-sm text-muted-foreground">{description}</p>}
      </div>

      {departure?.kind === "removed" ? (
        <p className="max-w-sm text-sm text-muted-foreground">
          The owner removed you from this room, so you can&apos;t rejoin it.
        </p>
      ) : departure?.kind === "left" ? (
        <div className="flex flex-col items-center gap-2">
          <Button disabled aria-describedby={`rejoin-${roomId}`}>
            <RejoinCountdown rejoinAt={departure.rejoinAt} />
          </Button>
          <p id={`rejoin-${roomId}`} className="max-w-sm text-sm text-muted-foreground">
            You left this room. Rooms you leave can be rejoined after 5 days.
          </p>
        </div>
      ) : (
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await joinRoom(roomId);
              if (result?.error) setError(result.error);
            })
          }
        >
          {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
          Join {title}
        </Button>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
