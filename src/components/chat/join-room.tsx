"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";

import { joinRoom } from "@/app/chat/actions";
import { Button } from "@/components/ui/button";

// Public rooms are visible to everyone signed in, but their messages are
// readable only by members (RLS), so non-members see this instead.
export function JoinRoom({ roomId, name, description }: { roomId: string; name: string; description: string | null }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex flex-col gap-1.5">
        <p className="font-heading text-3xl">#{name}</p>
        {description && <p className="max-w-sm text-muted-foreground">{description}</p>}
      </div>
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
        Join #{name}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
