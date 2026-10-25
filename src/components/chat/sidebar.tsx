import { LogOut, Settings } from "lucide-react";
import Link from "next/link";

import { signOut } from "@/app/auth/actions";
import { UpgradeBanner } from "@/components/auth/upgrade-banner";
import { BrowseRoomsDialog, CreateRoomDialog, NewDmDialog } from "@/components/chat/room-dialogs";
import { RoomLink } from "@/components/chat/room-link";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button, buttonVariants } from "@/components/ui/button";
import type { CurrentUser } from "@/lib/auth/current-user";
import { fetchMyRooms, fetchPublicRooms } from "@/lib/chat/data";
import { createClient } from "@/lib/supabase/server";

export async function Sidebar({ user }: { user: CurrentUser }) {
  const supabase = await createClient();
  const [rooms, publicRooms] = await Promise.all([fetchMyRooms(supabase, user.id), fetchPublicRooms(supabase)]);
  const channels = rooms.filter((r) => r.type !== "dm");
  const dms = rooms.filter((r) => r.type === "dm");

  return (
    <nav aria-label="Rooms and direct messages" className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-center px-4">
        <Link href="/chat" className="font-heading text-2xl font-semibold tracking-tight">
          Dites
        </Link>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-2 pb-4">
        <section aria-label="Rooms" className="flex flex-col gap-0.5">
          <div className="flex h-8 items-center justify-between pr-1 pl-2">
            <h2 aria-hidden="true" className="font-sans text-xs font-medium tracking-[0.06em] text-muted-foreground uppercase">
              Rooms
            </h2>
            {!user.isGuest && <CreateRoomDialog />}
          </div>
          {channels.length > 0 ? (
            channels.map((room) => <RoomLink key={room.id} room={room} />)
          ) : (
            <p className="px-2 py-1 text-sm text-muted-foreground">You haven&apos;t joined any rooms.</p>
          )}
          <BrowseRoomsDialog rooms={publicRooms} joinedIds={channels.map((r) => r.id)} />
        </section>

        <section aria-label="Direct messages" className="flex flex-col gap-0.5">
          <div className="flex h-8 items-center justify-between pr-1 pl-2">
            <h2 aria-hidden="true" className="font-sans text-xs font-medium tracking-[0.06em] text-muted-foreground uppercase">
              Direct messages
            </h2>
            <NewDmDialog />
          </div>
          {dms.length > 0 ? (
            dms.map((room) => <RoomLink key={room.id} room={room} />)
          ) : (
            <p className="px-2 py-1 text-sm text-muted-foreground">No conversations yet.</p>
          )}
        </section>
      </div>

      <div className="flex shrink-0 flex-col gap-3 border-t p-3">
        {user.isGuest && <UpgradeBanner compact />}
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground uppercase"
          >
            {user.displayName.slice(0, 1)}
          </span>
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-sm font-medium">{user.displayName}</span>
            <span className="truncate text-xs text-muted-foreground">
              @{user.username}
              {user.isGuest && " · Guest"}
            </span>
          </div>
          <ThemeToggle />
          <Link
            href="/settings/profile"
            className={buttonVariants({ variant: "ghost", size: "icon" })}
            aria-label="Profile settings"
          >
            <Settings aria-hidden="true" />
          </Link>
          <form action={signOut}>
            <Button variant="ghost" size="icon" type="submit" aria-label="Sign out">
              <LogOut aria-hidden="true" />
            </Button>
          </form>
        </div>
      </div>
    </nav>
  );
}

export function SidebarSkeleton() {
  return (
    <div aria-hidden="true" className="flex h-full flex-col gap-3 p-4">
      <div className="h-7 w-24 rounded bg-muted" />
      <div className="mt-4 h-4 w-16 rounded bg-muted" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-8 rounded-lg bg-muted" />
      ))}
    </div>
  );
}
