"use client";

import { usePathname } from "next/navigation";
import { createContext, Suspense, use, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

// Desktop: the sidebar is a column you can hide (button in the room header,
// or Ctrl/Cmd+B); the choice is remembered in this browser. Mobile: the same
// sidebar opens as a drawer from the header's menu button.

type NavContextValue = {
  openNav: () => void;
  sidebarHidden: boolean;
  toggleSidebar: () => void;
};

const NavContext = createContext<NavContextValue>({
  openNav: () => {},
  sidebarHidden: false,
  toggleSidebar: () => {},
});

export function useChatNav() {
  return use(NavContext);
}

export const SIDEBAR_ID = "chat-sidebar";

// A display preference, so localStorage is fine (never anything sensitive).
// Storage can be unavailable (private mode, blocked site data): fall back to
// "shown" and keep working.
const STORAGE_KEY = "dites.sidebarHidden";
const listeners = new Set<() => void>();

function readHidden() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeHidden(hidden: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, hidden ? "1" : "0");
  } catch {
    // Not remembered, but the toggle still works for this page view.
  }
  memoryHidden = hidden;
  listeners.forEach((listener) => listener());
}

let memoryHidden: boolean | null = null;

function subscribeHidden(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function useSidebarHidden() {
  return useSyncExternalStore(
    subscribeHidden,
    () => memoryHidden ?? readHidden(),
    () => false,
  );
}

// Closes the mobile drawer whenever the route changes, including navigations
// started from dialogs (new DM, join room), not just link clicks. Lives in
// its own Suspense boundary because usePathname() is request-time data.
function CloseOnNavigate({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    onNavigate();
  }, [pathname, onNavigate]);
  return null;
}

export function ChatShell({ sidebar, children }: { sidebar: React.ReactNode; children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const sidebarHidden = useSidebarHidden();
  const toggleSidebar = () => writeHidden(!sidebarHidden);

  // Leaving mobile width with the drawer open would leave an invisible overlay.
  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)");
    const onChange = () => query.matches && setDrawerOpen(false);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // Ctrl/Cmd+B hides or shows the sidebar on desktop.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "b") {
        if (!window.matchMedia("(min-width: 768px)").matches) return;
        event.preventDefault();
        writeHidden(!(memoryHidden ?? readHidden()));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <NavContext value={{ openNav: () => setDrawerOpen(true), sidebarHidden, toggleSidebar }}>
      <Suspense>
        <CloseOnNavigate onNavigate={closeDrawer} />
      </Suspense>
      <div className="flex h-dvh overflow-hidden">
        <aside
          id={SIDEBAR_ID}
          aria-hidden={sidebarHidden || undefined}
          inert={sidebarHidden || undefined}
          className={`hidden shrink-0 flex-col overflow-hidden bg-sidebar transition-[width] duration-200 ease-out md:flex ${
            sidebarHidden ? "w-0" : "w-[264px] border-r"
          }`}
        >
          {/* Fixed inner width so content doesn't reflow while the column slides. */}
          <div className="flex h-full w-[264px] flex-col">{sidebar}</div>
        </aside>
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetContent side="left" className="w-[min(85vw,300px)] gap-0 bg-sidebar p-0">
            <SheetTitle className="sr-only">Rooms and direct messages</SheetTitle>
            {sidebar}
          </SheetContent>
        </Sheet>
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </NavContext>
  );
}
