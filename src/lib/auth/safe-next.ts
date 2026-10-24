// Open-redirect guard for `next` parameters (sign-in callback, login links).
// Only same-site relative paths are allowed: "/chat/abc?x=1" passes;
// "https://evil.com", "//evil.com" and "/\evil.com" (which browsers treat as
// "//evil.com") fall back to the default.

const PLACEHOLDER_ORIGIN = "https://dites.invalid";

function isSafe(path: string): boolean {
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//")) return false;
  if (path.includes("\\")) return false;
  // Control characters and whitespace are stripped or mangled by URL parsers.
  if (/[\u0000-\u001F\u007F\s]/.test(path)) return false;
  // Final check: resolving against a placeholder must stay on that origin.
  return new URL(path, PLACEHOLDER_ORIGIN).origin === PLACEHOLDER_ORIGIN;
}

export function safeNextPath(raw: string | null | undefined, fallback = "/chat"): string {
  if (!raw) return fallback;

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return fallback;
  }

  // Both the raw and decoded forms must be safe, so an encoded "%2F%2Fevil.com"
  // cannot become "//evil.com" after a later decode.
  if (!isSafe(raw) || !isSafe(decoded)) return fallback;

  const url = new URL(raw, PLACEHOLDER_ORIGIN);
  return url.pathname + url.search + url.hash;
}
