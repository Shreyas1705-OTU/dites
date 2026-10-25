"use client";

import { Crown, Loader2, UserPlus, Users, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { addMember, removeMember, searchUsers, type UserMatch } from "@/app/chat/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export type RoomMember = {
  id: string;
  username: string;
  displayName: string;
  role: "owner" | "member";
};

type Props = {
  roomId: string;
  roomName: string;
  isPrivate: boolean;
  isOwner: boolean;
  currentUserId: string;
  members: RoomMember[];
  total: number;
};

function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold uppercase"
    >
      {name.slice(0, 1)}
    </span>
  );
}

export function MembersDialog({ roomId, roomName, isPrivate, isOwner, currentUserId, members, total }: Props) {
  const canManage = isPrivate && isOwner;
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<UserMatch[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [, startTransition] = useTransition();
  const memberIds = new Set(members.map((m) => m.id));

  useEffect(() => {
    if (!canManage || query.trim().length < 1) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await searchUsers(query);
      if (!cancelled) setMatches(result);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, canManage]);

  function run(id: string, action: () => Promise<{ error: string } | undefined>) {
    setPendingId(id);
    setError(undefined);
    startTransition(async () => {
      const result = await action();
      if (result?.error) setError(result.error);
      setPendingId(null);
    });
  }

  const suggestions = query.trim().length < 1 ? [] : matches;

  return (
    <Dialog>
      <DialogTrigger
        render={<Button variant="ghost" size="sm" className="shrink-0 text-muted-foreground" aria-label={`Members (${total})`} />}
      >
        <Users aria-hidden="true" />
        <span className="tabular-nums">{total}</span>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl font-medium">Members of #{roomName}</DialogTitle>
          <DialogDescription>
            {canManage
              ? "Add people with a GitHub or Google account. Only you, the owner, can add or remove members."
              : isPrivate
                ? "Only the owner can add or remove members."
                : "Anyone signed in can join this room."}
          </DialogDescription>
        </DialogHeader>

        {canManage && (
          <div className="flex flex-col gap-2">
            <Input
              aria-label="Add people by name or username"
              placeholder="Add people by name or @username"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
            {suggestions.length > 0 && (
              <ul className="-mx-2 flex flex-col" aria-label="Suggestions">
                {suggestions.map((user) => {
                  const already = memberIds.has(user.id);
                  return (
                    <li key={user.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
                      <Avatar name={user.displayName} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium">{user.displayName}</span>
                        <span className="truncate text-xs text-muted-foreground">@{user.username}</span>
                      </span>
                      {already ? (
                        <span className="text-sm text-muted-foreground">Member</span>
                      ) : user.isGuest ? (
                        <span className="text-sm text-muted-foreground">Guests can&apos;t join</span>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={pendingId !== null}
                          onClick={() => run(user.id, () => addMember(roomId, user.id))}
                          aria-label={`Add ${user.displayName}`}
                        >
                          {pendingId === user.id ? <Loader2 className="animate-spin" aria-hidden="true" /> : <UserPlus aria-hidden="true" />}
                          Add
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <ul className="-mx-2 flex max-h-[45vh] flex-col overflow-y-auto" aria-label="Members">
          {members.map((member) => (
            <li key={member.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
              <Avatar name={member.displayName} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">
                  {member.displayName}
                  {member.id === currentUserId && <span className="font-normal text-muted-foreground"> (you)</span>}
                </span>
                <span className="truncate text-xs text-muted-foreground">@{member.username}</span>
              </span>
              {member.role === "owner" && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Crown className="size-3.5" aria-hidden="true" />
                  Owner
                </span>
              )}
              {canManage && member.role !== "owner" && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  disabled={pendingId !== null}
                  onClick={() => run(member.id, () => removeMember(roomId, member.id))}
                  aria-label={`Remove ${member.displayName}`}
                  title="Remove from room"
                >
                  {pendingId === member.id ? <Loader2 className="animate-spin" aria-hidden="true" /> : <X aria-hidden="true" />}
                </Button>
              )}
            </li>
          ))}
          {total > members.length && (
            <li className="px-2 py-2 text-sm text-muted-foreground">and {total - members.length} more</li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
