"use client";

import { Hash, Loader2, Plus, Search, SquarePen } from "lucide-react";
import { useActionState, useEffect, useState, useTransition } from "react";

import { createRoom, joinRoom, searchUsers, startDm, type UserMatch } from "@/app/chat/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { normalizeRoomName } from "@/lib/chat/room-name";

function ErrorText({ children }: { children?: string }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Browse public rooms
// ---------------------------------------------------------------------------
type PublicRoom = { id: string; name: string; description: string | null };

export function BrowseRoomsDialog({ rooms, joinedIds }: { rooms: PublicRoom[]; joinedIds: string[] }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [, startTransition] = useTransition();
  const joined = new Set(joinedIds);

  function join(id: string) {
    setPendingId(id);
    setError(undefined);
    startTransition(async () => {
      const result = await joinRoom(id);
      if (result?.error) setError(result.error);
      setPendingId(null);
    });
  }

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="ghost" className="w-full justify-start px-2 text-muted-foreground" />}>
        <Search aria-hidden="true" />
        Browse rooms
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl font-medium">Public rooms</DialogTitle>
          <DialogDescription>Anyone signed in can read and join these.</DialogDescription>
        </DialogHeader>
        <ErrorText>{error}</ErrorText>
        <ul className="-mx-2 flex max-h-[50vh] flex-col overflow-y-auto">
          {rooms.map((room) => (
            <li key={room.id} className="flex items-center gap-3 rounded-lg px-2 py-2.5">
              <Hash className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{room.name}</span>
                {room.description && (
                  <span className="truncate text-sm text-muted-foreground">{room.description}</span>
                )}
              </div>
              {joined.has(room.id) ? (
                <span className="text-sm text-muted-foreground">Joined</span>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => join(room.id)} disabled={pendingId !== null}>
                  {pendingId === room.id && <Loader2 className="animate-spin" aria-hidden="true" />}
                  Join
                </Button>
              )}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Create a room (registered users only; the database refuses guests anyway)
// ---------------------------------------------------------------------------
export function CreateRoomDialog() {
  const [state, action, pending] = useActionState(createRoom, undefined);
  const [name, setName] = useState("");
  const preview = normalizeRoomName(name);

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Create a room" title="Create a room" />}>
        <Plus aria-hidden="true" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl font-medium">Create a room</DialogTitle>
          <DialogDescription>You&apos;ll be its owner. You can create up to 5 rooms an hour.</DialogDescription>
        </DialogHeader>
        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="room-name" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="room-name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              placeholder="book-club"
              autoComplete="off"
              aria-describedby="room-name-hint"
            />
            <p id="room-name-hint" className="text-sm text-muted-foreground">
              {preview ? `Shows as #${preview}` : "Lowercase letters, numbers and hyphens."}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="room-description" className="text-sm font-medium">
              Description <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Input id="room-description" name="description" maxLength={200} autoComplete="off" />
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-medium">Who can join</legend>
            <label className="flex cursor-pointer items-start gap-2.5 text-sm">
              <input type="radio" name="type" value="public" defaultChecked className="mt-0.5 size-4 accent-primary" />
              <span>
                <span className="font-medium">Public</span>
                <span className="block text-muted-foreground">Anyone signed in can find and join it.</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2.5 text-sm">
              <input type="radio" name="type" value="private" className="mt-0.5 size-4 accent-primary" />
              <span>
                <span className="font-medium">Private</span>
                <span className="block text-muted-foreground">Only people you add can see it.</span>
              </span>
            </label>
          </fieldset>
          <ErrorText>{state?.error}</ErrorText>
          <Button type="submit" disabled={pending} className="self-end">
            {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
            Create room
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Start a direct message by username
// ---------------------------------------------------------------------------
export function NewDmDialog() {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<UserMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [, startTransition] = useTransition();

  // Debounced search; stale responses are ignored.
  useEffect(() => {
    if (query.trim().length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      const result = await searchUsers(query);
      if (!cancelled) {
        setMatches(result);
        setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const shown = query.trim().length < 2 ? [] : matches;

  function open(user: UserMatch) {
    setPendingId(user.id);
    setError(undefined);
    startTransition(async () => {
      const result = await startDm(user.id);
      if (result?.error) setError(result.error);
      setPendingId(null);
    });
  }

  return (
    <Dialog>
      <DialogTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label="New direct message" title="New direct message" />}
      >
        <SquarePen aria-hidden="true" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl font-medium">New message</DialogTitle>
          <DialogDescription>Find someone by their username.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
            @
          </span>
          <Input
            aria-label="Username"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="username"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className="pl-7"
          />
        </div>
        <ErrorText>{error}</ErrorText>
        <ul className="-mx-2 flex min-h-12 flex-col" aria-live="polite" aria-busy={searching}>
          {shown.map((user) => (
            <li key={user.id}>
              <button
                type="button"
                onClick={() => open(user)}
                disabled={pendingId !== null}
                className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors duration-150 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold uppercase"
                >
                  {user.displayName.slice(0, 1)}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{user.displayName}</span>
                  <span className="truncate text-sm text-muted-foreground">@{user.username}</span>
                </span>
                {pendingId === user.id && <Loader2 className="ml-auto size-4 animate-spin" aria-hidden="true" />}
              </button>
            </li>
          ))}
          {query.trim().length >= 2 && !searching && shown.length === 0 && (
            <li className="px-2 py-3 text-sm text-muted-foreground">No one with a username starting “{query.trim()}”.</li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
