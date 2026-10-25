"use client";

import { createContext, use, useEffect, useState } from "react";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

// Desktop: the sidebar is a fixed column. Mobile: the same sidebar opens as
// a drawer from the room header's menu button.

const NavContext = createContext<{ openNav: () => void }>({ openNav: () => {} });

export function useChatNav() {
  return use(NavContext);
}

export function ChatShell({ sidebar, children }: { sidebar: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  // Close the drawer once a link inside it is followed.
  function closeOnNavigate(event: React.MouseEvent) {
    if ((event.target as HTMLElement).closest("a[href]")) setOpen(false);
  }

  // Leaving mobile width with the drawer open would leave an invisible overlay.
  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)");
    const onChange = () => query.matches && setOpen(false);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return (
    <NavContext value={{ openNav: () => setOpen(true) }}>
      <div className="flex h-dvh overflow-hidden">
        <aside className="hidden w-[264px] shrink-0 flex-col border-r bg-sidebar md:flex">{sidebar}</aside>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" className="w-[min(85vw,300px)] gap-0 bg-sidebar p-0" onClick={closeOnNavigate}>
            <SheetTitle className="sr-only">Rooms and direct messages</SheetTitle>
            {sidebar}
          </SheetContent>
        </Sheet>
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </NavContext>
  );
}
