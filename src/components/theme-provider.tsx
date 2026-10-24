"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

// Light/dark follows the system setting unless the user picks one. next-themes
// sets the `dark` class on <html> from a tiny inline script before first paint,
// so there is no flash of the wrong theme. The choice lives in localStorage;
// it is a display preference, not a credential.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}
