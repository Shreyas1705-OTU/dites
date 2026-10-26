"use client";

import { Crown, DoorOpen, Loader2, Trash2, UserPlus, Users, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { addMember, deleteRoom, leaveRoom, removeMember, searchUsers, type UserMatch } from "@/app/chat/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/confirm-dialog";

export type RoomMember = {
  id: string;
  username: string;
  displayName: string;
  role: "owner" | "member";
};

type Props = {
  roomId: string;
  title: string;
  isPrivate: boolean;
  isOwner: boolean;
  currentUserId: string;
  members: RoomMember[];
  total: number;
  // The room's handle ("book-club"), typed to confirm deletion.
  handle: string;
  canLeave: boolean;
  canDelete: boolean;
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

export function MembersDialog({
  roomId,
  title,
  isPrivate,
  isOwner,
  currentUserId,
  members,
  total,
  handle,
  canLeave,
  canDelete,
}: Props) {
  // Owners add people only to private rooms; they can remove from any room they own.
  const canManage = isPrivate && isOwner;
  const canRemove = isOwner;
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
          <DialogTitle className="font-heading text-2xl font-medium">Members of {title}</DialogTitle>
          <DialogDescription>
            {canManage
              ? "Add people with a GitHub or Google account. Only you, the owner, can add or remove members."
              : isOwner
                ? "Anyone signed in can join. You can remove people; they won't be able to rejoin."
                : isPrivate
                  ? "Only the owner can add or remove members."
                  : "Anyone signed in can join this room."}
          </DialogDescription>
        </DialogHeader>

        {canManage && (
          <div className="flex flex-col gap-2">
            <Input
              name="add-member"
              aria-label="Add people by name or username"
              placeholder="Add people by name or @username…"
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

        <ul
          tabIndex={0}
          className="-mx-2 flex max-h-[45vh] flex-col overflow-y-auto overscroll-contain rounded-lg outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
          aria-label="Members"
        >
          {members.map((member) => (
            <li key={member.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
              <Avatar name={member.displayName} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">
                  {member.displayName}
                  {member.id === currentUserId && <span className="font-normal text-muted-foreground"> (you)</span>}
                </span>
                <span translate="no" className="truncate text-xs text-muted-foreground">@{member.username}</span>
              </span>
              {member.role === "owner" && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Crown className="size-3.5" aria-hidden="true" />
                  Owner
                </span>
              )}
              {canRemove && member.role !== "owner" && (
                <ConfirmDialog
                  trigger={
                    <Button size="icon-sm" variant="ghost" aria-label={`Remove ${member.displayName}`} title="Remove from room">
                      <X aria-hidden="true" />
                    </Button>
                  }
                  title={`Remove ${member.displayName}?`}
                  description={`They'll be removed from ${title} right away and won't be able to rejoin it.${
                    isPrivate ? " You can add them back later." : ""
                  }`}
                  confirmLabel="Remove"
                  destructive
                  onConfirm={() => removeMember(roomId, member.id)}
                />
              )}
            </li>
          ))}
          {total > members.length && (
            <li className="px-2 py-2 text-sm text-muted-foreground">and {total - members.length} more</li>
          )}
        </ul>
        {(canLeave || canDelete) && (
          <RoomDangerZone
            roomId={roomId}
            title={title}
            handle={handle}
            isPrivate={isPrivate}
            canLeave={canLeave}
            canDelete={canDelete}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// Leaving and deleting sit at the bottom of the panel; both confirm in a popup
// that says what will happen.
function RoomDangerZone({
  roomId,
  title,
  handle,
  isPrivate,
  canLeave,
  canDelete,
}: {
  roomId: string;
  title: string;
  handle: string;
  isPrivate: boolean;
  canLeave: boolean;
  canDelete: boolean;
}) {
  const [typed, setTyped] = useState("");
  const matches = typed.trim().toLowerCase().replace(/^#/, "") === handle;

  return (
    <div className="flex flex-wrap gap-2 border-t pt-4">
      {canLeave && (
        <ConfirmDialog
          trigger={
            <Button variant="outline" size="sm">
              <DoorOpen aria-hidden="true" />
              Leave room
            </Button>
          }
          title={`Leave ${title}?`}
          description={
            isPrivate
              ? "You'll stop seeing its messages. Only the owner can add you back."
              : "You'll stop seeing its messages, and you won't be able to rejoin for 5 days."
          }
          confirmLabel="Leave room"
          onConfirm={() => leaveRoom(roomId)}
        />
      )}
      {canDelete && (
        <ConfirmDialog
          trigger={
            <Button
              variant="outline"
              size="sm"
              className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 aria-hidden="true" />
              Delete room
            </Button>
          }
          title={`Delete ${title}?`}
          description="This deletes the room and all of its messages for everyone. It can't be undone."
          confirmLabel="Delete forever"
          destructive
          confirmDisabled={!matches}
          onOpenChange={(open) => !open && setTyped("")}
          onConfirm={() => deleteRoom(roomId, typed)}
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`confirm-${roomId}`} className="text-sm text-muted-foreground">
              Type <span className="font-mono font-medium text-foreground">{handle}</span> to confirm
            </label>
            <Input
              id={`confirm-${roomId}`}
              name="confirm-room-name"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          </div>
        </ConfirmDialog>
      )}
    </div>
  );
}
