import { describe, expect, it } from "vitest";

import { safeNextPath } from "./safe-next";

describe("safeNextPath", () => {
  it.each([
    ["/chat", "/chat"],
    ["/chat/123e4567-e89b-12d3-a456-426614174000", "/chat/123e4567-e89b-12d3-a456-426614174000"],
    ["/settings/profile?welcome=1", "/settings/profile?welcome=1"],
    ["/chat#latest", "/chat#latest"],
  ])("allows same-site path %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  // Attack test #12 (open redirect through the auth callback).
  it.each([
    "https://evil.com",
    "http://evil.com/chat",
    "//evil.com",
    "///evil.com",
    "/\\evil.com",
    "\\\\evil.com",
    "%2F%2Fevil.com",
    "/%2F/evil.com",
    "/%5Cevil.com",
    "javascript:alert(1)",
    "/\tevil.com",
    " /chat",
    "evil.com",
    "%E0%A4%A",
  ])("rejects %s", (input) => {
    expect(safeNextPath(input)).toBe("/chat");
  });

  it("falls back when missing", () => {
    expect(safeNextPath(null)).toBe("/chat");
    expect(safeNextPath("")).toBe("/chat");
    expect(safeNextPath(undefined, "/")).toBe("/");
  });
});
