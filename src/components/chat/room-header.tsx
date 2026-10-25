"use client";

import { Globe, Hash, Lock, Menu } from "lucide-react";

import { useChatNav } from "@/components/chat/chat-shell";
import { Button } from "@/components/ui/button";
import type { RoomType } from "@/lib/chat/data";

type Props = {
  type: RoomType;
  title: string;
  subtitle?: string | null;
  actions?: React.ReactNode;
  isGlobal?: boolean;
};

export function RoomHeader({ type, title, subtitle, actions, isGlobal = false }: Props) {
  const { openNav } = useChatNav();
  const Icon = isGlobal ? Globe : type === "private" ? Lock : Hash;

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-2 sm:px-4">
      <Button variant="ghost" size="icon" className="md:hidden" onClick={openNav} aria-label="Open rooms and messages">
        <Menu aria-hidden="true" />
      </Button>
      {type !== "dm" && <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        <h1 className="truncate font-heading text-xl leading-none font-semibold">{title}</h1>
        {subtitle && <p className="hidden truncate text-sm text-muted-foreground sm:block">{subtitle}</p>}
      </div>
      {actions}
    </header>
  );
}
