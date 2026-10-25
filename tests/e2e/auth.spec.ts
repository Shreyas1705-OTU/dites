import { expect, test } from "@playwright/test";

test("signed-out visitors are sent from /chat to the sign-in screen", async ({ page }) => {
  await page.goto("/chat");
  await expect(page).toHaveURL(/\/\?next=%2Fchat$/);
  await expect(page.getByRole("heading", { name: "Join the conversation" })).toBeVisible();
});

test("a guest signs in, edits their profile and signs out", async ({ page }) => {
  await page.goto("/");

  // The guest button unlocks once Turnstile hands back a token.
  const guest = page.getByRole("button", { name: "Try as guest" });
  await expect(guest).toBeEnabled({ timeout: 15_000 });
  await guest.click();

  await expect(page).toHaveURL(/\/chat$/);
  await expect(page.getByText(/@guest_[0-9a-f]{5} · Guest/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "You're chatting as a guest" })).toBeVisible();

  // Signed-in users skip the sign-in screen.
  await page.goto("/");
  await expect(page).toHaveURL(/\/chat$/);

  await page.getByRole("link", { name: "Profile settings" }).click();
  const username = `e2e_${Math.random().toString(16).slice(2, 10)}`;
  await page.getByLabel("Display name").fill("E2E Tester");
  await page.getByLabel("Username").fill(username);
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();

  // Reserved names are rejected by the database CHECK constraint.
  await page.getByLabel("Username").fill("admin");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("@admin is reserved. Try another.")).toBeVisible();

  await page.getByRole("link", { name: "Back to chat" }).click();
  await expect(page.getByRole("heading", { name: "E2E Tester" })).toBeVisible();
  await expect(page.getByText(`@${username} · Guest`)).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/");
  await page.goto("/chat");
  await expect(page).toHaveURL(/\/\?next=/);
});

test("the callback shows a friendly message for a failed sign-in", async ({ page }) => {
  await page.goto("/auth/callback?error_code=access_denied");
  // Next.js keeps its own empty role="alert" route announcer, so match by text.
  await expect(page.getByRole("alert").filter({ hasText: /Sign-in was cancelled/ })).toBeVisible();
});
