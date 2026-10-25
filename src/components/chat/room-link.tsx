"use client";

import { Globe, Hash, Lock } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { GENERAL_ROOM_ID, type RoomSummary } from "@/lib/chat/data";

export function RoomLink({ room }: { room: RoomSummary }) {
  const active = usePathname() === `/chat/${room.id}`;
  const Icon = room.id === GENERAL_ROOM_ID ? Globe : room.type === "private" ? Lock : Hash;

  return (
    <Link
      href={`/chat/${room.id}`}
      aria-current={active ? "page" : undefined}
      className="flex h-9 min-w-0 items-center gap-2 rounded-lg px-2 text-sm text-sidebar-foreground transition-colors duration-150 hover:bg-sidebar-accent aria-[current=page]:bg-sidebar-accent aria-[current=page]:font-medium"
    >
      {room.type === "dm" ? (
        <span
          aria-hidden="true"
          className="flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[0.6875rem] font-semibold text-secondary-foreground uppercase"
        >
          {room.label.slice(0, 1)}
        </span>
      ) : (
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
      <span className="truncate">{room.label}</span>
      {room.type === "private" && <span className="sr-only">(private)</span>}
    </Link>
  );
}
