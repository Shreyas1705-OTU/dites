import type { Metadata, Viewport } from "next";
import { EB_Garamond, Geist, Geist_Mono } from "next/font/google";

import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

// next/font downloads these at build time and serves them from our own domain,
// so the Content-Security-Policy never has to allow Google Fonts.
const garamond = EB_Garamond({
  variable: "--font-eb-garamond",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dites",
  description: "A public, realtime chat. Try it as a guest in one click.",
};

export const viewport: Viewport = {
  // On phones the keyboard shrinks the layout, so the composer stays above it.
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F6F5F1" },
    { media: "(prefers-color-scheme: dark)", color: "#14161C" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // next-themes changes the class on <html> before hydration
    <html
      lang="en"
      suppressHydrationWarning
      className={`${garamond.variable} ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
