"use client";

import { useEffect, useRef } from "react";

// Cloudflare Turnstile, the captcha Supabase Auth checks on guest sign-in.
// The widget proves "probably a person" and hands us a single-use token;
// Supabase verifies it with Cloudflare before creating an anonymous user.
// Managed mode with `interaction-only` stays invisible for most visitors.

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile missing")));
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("turnstile failed to load"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

type Props = {
  onToken: (token: string | null) => void;
  onError?: () => void;
  // Change this number to get a fresh token (tokens are single-use).
  resetKey: number;
};

export function Turnstile({ onToken, onError, resetKey }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  // Keep the latest callbacks without re-rendering the widget.
  const handlers = useRef({ onToken, onError });
  useEffect(() => {
    handlers.current = { onToken, onError };
  });

  useEffect(() => {
    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        if (cancelled || !container.current) return;
        widgetId.current = api.render(container.current, {
          sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
          appearance: "interaction-only",
          theme: "auto",
          size: "flexible",
          callback: (token: string) => handlers.current.onToken(token),
          "expired-callback": () => handlers.current.onToken(null),
          "error-callback": () => {
            handlers.current.onToken(null);
            handlers.current.onError?.();
          },
        });
      })
      .catch(() => handlers.current.onError?.());

    return () => {
      cancelled = true;
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
    };
  }, []);

  useEffect(() => {
    if (resetKey > 0 && widgetId.current) {
      handlers.current.onToken(null);
      window.turnstile?.reset(widgetId.current);
    }
  }, [resetKey]);

  return <div ref={container} className="empty:hidden" />;
}
