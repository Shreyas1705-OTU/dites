import { expect, test } from "@playwright/test";

import { currentUsername, openNav, signInAsGuest } from "./helpers";

const unique = (label: string) => `${label} ${Math.random().toString(36).slice(2, 8)}`;

test("a message appears for others in real time, without a reload", async ({ browser }) => {
  const alice = await (await browser.newContext()).newPage();
  const bob = await (await browser.newContext()).newPage();
  await signInAsGuest(alice);
  await signInAsGuest(bob);

  const text = unique("live hello");
  const box = alice.getByRole("textbox", { name: /^Message / });
  await box.fill(text);
  await box.press("Enter");

  // Bob never reloads.
  await expect(bob.getByRole("log", { name: "Messages" }).getByText(text)).toBeVisible({ timeout: 10_000 });
  // Alice sees exactly one copy: the realtime echo replaces her optimistic message.
  await expect(alice.getByRole("log", { name: "Messages" }).getByText(text)).toHaveCount(1);
});

test("a new DM shows up in the other person's sidebar and delivers live", async ({ browser }) => {
  const alice = await (await browser.newContext()).newPage();
  const bob = await (await browser.newContext()).newPage();
  await signInAsGuest(alice);
  await signInAsGuest(bob);
  const aliceName = await currentUsername(alice);
  const bobName = await currentUsername(bob);

  const nav = await openNav(alice);
  await nav.getByRole("button", { name: "New direct message" }).click();
  const dialog = alice.getByRole("dialog", { name: "New message" });
  await dialog.getByLabel("Name or username").fill(bobName);
  await dialog.getByRole("button", { name: new RegExp(bobName) }).click();
  await expect(alice.getByRole("heading", { level: 1, name: bobName })).toBeVisible();

  // Bob's sidebar gains the DM through his user channel, no reload.
  const bobNav = await openNav(bob);
  await expect(bobNav.getByRole("link", { name: aliceName })).toBeVisible({ timeout: 10_000 });
  await bobNav.getByRole("link", { name: aliceName }).click();
  await expect(bob.getByRole("heading", { level: 1, name: aliceName })).toBeVisible();

  const text = unique("just between us");
  const box = alice.getByRole("textbox", { name: `Message ${bobName}` });
  await box.fill(text);
  await box.press("Enter");
  await expect(bob.getByRole("log", { name: "Messages" }).getByText(text)).toBeVisible({ timeout: 10_000 });
});
