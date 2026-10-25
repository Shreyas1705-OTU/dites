import { expect, test } from "@playwright/test";

import { adminHeaders, currentUsername, LOCAL_API, openNav, SECRET_KEY, signInAsGuest } from "./helpers";

test("signed-out visitors are sent from /chat to the sign-in screen", async ({ page }) => {
  await page.goto("/chat");
  await expect(page).toHaveURL(/\/\?next=%2Fchat$/);
  await expect(page.getByRole("heading", { name: "Join the conversation" })).toBeVisible();
});

test("a guest signs in, edits their profile and signs out", async ({ page }) => {
  await signInAsGuest(page);
  const nav = await openNav(page);
  await expect(nav.getByText(/@guest_[0-9a-f]{5} · Guest/)).toBeVisible();
  await expect(nav.getByRole("heading", { name: "You're chatting as a guest" })).toBeVisible();

  await nav.getByRole("link", { name: "Profile settings" }).click();
  await expect(page).toHaveURL(/\/settings\/profile$/);

  // Signed-in users skip the sign-in screen.
  await page.goto("/");
  await expect(page).toHaveURL(/\/chat\//);
  await page.goto("/settings/profile");

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
  const navAfter = await openNav(page);
  await expect(navAfter.getByText("E2E Tester")).toBeVisible();
  await expect(navAfter.getByText(`@${username} · Guest`)).toBeVisible();

  await navAfter.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/");
  await page.goto("/chat");
  await expect(page).toHaveURL(/\/\?next=/);
});

test("the callback shows a friendly message for a failed sign-in", async ({ page }) => {
  await page.goto("/auth/callback?error_code=access_denied");
  // Next.js keeps its own empty role="alert" route announcer, so match by text.
  await expect(page.getByRole("alert").filter({ hasText: /Sign-in was cancelled/ })).toBeVisible();
});

test("a session whose account was deleted is cleared instead of looping", async ({ page }) => {
  test.skip(!SECRET_KEY, "SUPABASE_SECRET_KEY not set");

  await signInAsGuest(page);
  const username = await currentUsername(page);

  const profiles = await (
    await fetch(`${LOCAL_API}/rest/v1/profiles?select=id&username=eq.${username}`, { headers: adminHeaders() })
  ).json();
  const res = await fetch(`${LOCAL_API}/auth/v1/admin/users/${profiles[0].id}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
  expect(res.ok).toBe(true);

  // The access token is still valid, but the account is gone.
  await page.goto("/chat");
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "Join the conversation" })).toBeVisible();
});
