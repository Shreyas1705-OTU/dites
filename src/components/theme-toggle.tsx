"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

const ORDER = ["system", "light", "dark"] as const;
type Theme = (typeof ORDER)[number];

const LABEL: Record<Theme, string> = { system: "System", light: "Light", dark: "Dark" };
const ICON = { system: Monitor, light: Sun, dark: Moon } satisfies Record<Theme, unknown>;

const subscribe = () => () => {};

// The server cannot know the stored theme, so render a neutral button until
// hydrated instead of guessing and causing a mismatch.
function useHydrated() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const hydrated = useHydrated();

  const current: Theme = hydrated && ORDER.includes(theme as Theme) ? (theme as Theme) : "system";
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
  const Icon = ICON[current];

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(next)}
      aria-label={`Theme: ${LABEL[current]}. Switch to ${LABEL[next]}`}
      title={`Theme: ${LABEL[current]}`}
    >
      <Icon aria-hidden="true" />
    </Button>
  );
}
