import { expect, test } from "@playwright/test";

import {
  adminHeaders,
  currentUsername,
  GENERAL_ROOM_ID,
  LOCAL_API,
  openNav,
  SECRET_KEY,
  signInAsGuest,
} from "./helpers";

test("a new guest lands in #general and cannot create rooms", async ({ page }) => {
  await signInAsGuest(page);
  await expect(page.getByRole("heading", { level: 1, name: "general" })).toBeVisible();

  const nav = await openNav(page);
  await expect(nav.getByRole("link", { name: "general" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("button", { name: "Create a room" })).toHaveCount(0);

  await nav.getByRole("button", { name: "Browse rooms" }).click();
  const dialog = page.getByRole("dialog", { name: "Public rooms" });
  await expect(dialog.getByText("general", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Joined")).toBeVisible();
});

test("a room you can't see looks exactly like one that doesn't exist", async ({ page }) => {
  await signInAsGuest(page);
  await page.goto("/chat/11111111-2222-4333-8444-555555555555");
  await expect(page.getByText("Room not found")).toBeVisible();
  await page.goto("/chat/not-a-uuid");
  await expect(page.getByText("Room not found")).toBeVisible();
});

test("two guests open a direct message with each other", async ({ browser }) => {
  const alice = await (await browser.newContext()).newPage();
  const bob = await (await browser.newContext()).newPage();
  await signInAsGuest(alice);
  await signInAsGuest(bob);
  const bobName = await currentUsername(bob);
  const aliceName = await currentUsername(alice);

  const nav = await openNav(alice);
  await nav.getByRole("button", { name: "New direct message" }).click();
  const dialog = alice.getByRole("dialog", { name: "New message" });
  await dialog.getByLabel("Username").fill(bobName);
  await dialog.getByRole("button", { name: new RegExp(bobName) }).click();

  await expect(alice).toHaveURL(/\/chat\/[0-9a-f-]{36}$/);
  await expect(alice.getByRole("heading", { level: 1, name: bobName })).toBeVisible();
  await expect(alice.getByText(`This is the start of your conversation with ${bobName}.`)).toBeVisible();
  const dmUrl = alice.url();

  // Bob sees the conversation (live updates arrive with realtime; reload for now).
  await bob.reload();
  const bobNav = await openNav(bob);
  await bobNav.getByRole("link", { name: aliceName }).click();
  await expect(bob).toHaveURL(dmUrl);

  // Opening it again from Alice's side returns the same DM, not a new one.
  const aliceNav = await openNav(alice);
  await aliceNav.getByRole("button", { name: "New direct message" }).click();
  await alice.getByRole("dialog", { name: "New message" }).getByLabel("Username").fill(bobName);
  await alice.getByRole("dialog", { name: "New message" }).getByRole("button", { name: new RegExp(bobName) }).click();
  await expect(alice).toHaveURL(dmUrl);
});

test("history loads older pages when scrolling up", async ({ page }) => {
  test.skip(!SECRET_KEY, "SUPABASE_SECRET_KEY not set");
  await signInAsGuest(page);
  const username = await currentUsername(page);
  const [profile] = await (
    await fetch(`${LOCAL_API}/rest/v1/profiles?select=id&username=eq.${username}`, { headers: adminHeaders() })
  ).json();

  // A fresh room with 75 messages, one minute apart.
  const [room] = await (
    await fetch(`${LOCAL_API}/rest/v1/rooms`, {
      method: "POST",
      headers: { ...adminHeaders(), Prefer: "return=representation" },
      body: JSON.stringify({ type: "public", name: `history-${Date.now()}` }),
    })
  ).json();
  await fetch(`${LOCAL_API}/rest/v1/room_members`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ room_id: room.id, user_id: profile.id }),
  });
  const start = Date.now() - 75 * 60_000;
  const messages = Array.from({ length: 75 }, (_, i) => ({
    room_id: room.id,
    user_id: profile.id,
    body: `message ${i + 1}`,
    created_at: new Date(start + i * 60_000).toISOString(),
  }));
  const insert = await fetch(`${LOCAL_API}/rest/v1/messages`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify(messages),
  });
  expect(insert.ok).toBe(true);

  await page.goto(`/chat/${room.id}`);
  const log = page.getByRole("log", { name: "Messages" });
  await expect(log.getByText("message 75", { exact: true })).toBeVisible();
  await expect(log.getByText("message 1", { exact: true })).toHaveCount(0);

  // Scroll to the top: the next page loads and the start of history shows.
  await log.evaluate((el) => el.scrollTo({ top: -el.scrollHeight }));
  await expect(log.getByText("message 1", { exact: true })).toBeAttached();
  await expect(page.getByText("This is the beginning of the conversation.")).toBeVisible();
  await expect(log.getByText(/^message \d+$/)).toHaveCount(75);

  // Leave the shared local database as we found it (messages cascade).
  await fetch(`${LOCAL_API}/rest/v1/rooms?id=eq.${room.id}`, { method: "DELETE", headers: adminHeaders() });
});

test("/chat opens #general", async ({ page }) => {
  await signInAsGuest(page);
  await page.goto("/chat");
  await expect(page).toHaveURL(new RegExp(`/chat/${GENERAL_ROOM_ID}$`));
});

test("people search lists registered users from the first letter, not guests", async ({ page, browser }) => {
  test.skip(!SECRET_KEY, "SUPABASE_SECRET_KEY not set");
  // A registered user (as if they'd signed in with GitHub), with a unique name.
  const tag = Math.random().toString(36).slice(2, 7);
  const created = await fetch(`${LOCAL_API}/auth/v1/admin/users`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({
      email: `zz${tag}@example.test`,
      email_confirm: true,
      user_metadata: { user_name: `zz${tag}`, full_name: `Zelda ${tag}` },
      app_metadata: { provider: "github" },
    }),
  });
  expect(created.ok).toBe(true);
  const registered = await created.json();

  const other = await (await browser.newContext()).newPage();
  await signInAsGuest(other);
  const guestName = await currentUsername(other);

  await signInAsGuest(page);
  const nav = await openNav(page);
  await nav.getByRole("button", { name: "New direct message" }).click();
  const dialog = page.getByRole("dialog", { name: "New message" });
  const search = dialog.getByLabel("Name or username");

  // Display name prefix, then username prefix.
  await search.fill(`Zelda ${tag}`.slice(0, 7));
  await expect(dialog.getByRole("button", { name: new RegExp(`Zelda ${tag}`) })).toBeVisible();
  await search.fill(`zz${tag}`.slice(0, 3));
  await expect(dialog.getByRole("button", { name: new RegExp(`@zz${tag}`) })).toBeVisible();

  // Guests never show up for partial matches, only for their exact name.
  await search.fill("guest_");
  await expect(dialog.getByText("No one found starting with “guest_”.")).toBeVisible();
  await search.fill(guestName);
  await expect(dialog.getByRole("button", { name: new RegExp(guestName) })).toBeVisible();

  await fetch(`${LOCAL_API}/auth/v1/admin/users/${registered.id}`, { method: "DELETE", headers: adminHeaders() });
});
