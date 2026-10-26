import { expect, test, type Page } from "@playwright/test";

import { adminHeaders, LOCAL_API, SECRET_KEY, signInAsGuest } from "./helpers";

// Global chat collects messages from every run, so each test uses unique text.
const unique = (label: string) => `${label} ${Math.random().toString(36).slice(2, 8)}`;

function composer(page: Page) {
  return page.getByRole("textbox", { name: /^Message / });
}

async function send(page: Page, text: string) {
  await composer(page).fill(text);
  await composer(page).press("Enter");
}

const log = (page: Page) => page.getByRole("log", { name: "Messages" });

test("a guest sends a message with Enter and it survives a reload", async ({ page }) => {
  await signInAsGuest(page);
  const text = unique("hello from e2e");
  await send(page, text);

  await expect(log(page).getByText(text)).toBeVisible();
  await expect(composer(page)).toHaveValue("");
  await expect(page.getByText("Sending…")).toHaveCount(0);

  await page.reload();
  await expect(log(page).getByText(text)).toBeVisible();
});

test("Shift+Enter adds a line instead of sending", async ({ page }) => {
  await signInAsGuest(page);
  const first = unique("line one");
  await composer(page).fill(first);
  await composer(page).press("Shift+Enter");
  await composer(page).pressSequentially("line two");
  await expect(composer(page)).toHaveValue(`${first}\nline two`);
  await composer(page).press("Enter");
  await expect(log(page).getByText(`${first}\nline two`)).toBeVisible();
});

test("a failed send shows Retry, and Retry delivers it", async ({ page }) => {
  await signInAsGuest(page);
  const fail = (route: import("@playwright/test").Route) =>
    route.request().method() === "POST" ? route.abort("internetdisconnected") : route.continue();
  await page.route("**/rest/v1/messages*", fail);

  const text = unique("offline message");
  await send(page, text);
  await expect(page.getByRole("alert").filter({ hasText: "Not sent." })).toBeVisible();

  await page.unroute("**/rest/v1/messages*", fail);
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Not sent." })).toHaveCount(0);
  await page.reload();
  await expect(log(page).getByText(text)).toBeVisible();
});

test("retrying after a lost response does not create a duplicate", async ({ page }) => {
  test.skip(!SECRET_KEY, "SUPABASE_SECRET_KEY not set");
  // No realtime here, so the realtime echo can't confirm the message and the
  // Retry path is what's being tested.
  await page.routeWebSocket(/\/realtime\/v1\//, (ws) => ws.close());
  await signInAsGuest(page);

  // The insert reaches the database, but the browser is told it failed.
  const loseResponse = async (route: import("@playwright/test").Route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fetch();
    await route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
  };
  await page.route("**/rest/v1/messages*", loseResponse);

  const text = unique("sent once");
  await send(page, text);
  await expect(page.getByRole("alert").filter({ hasText: "Not sent." })).toBeVisible();

  await page.unroute("**/rest/v1/messages*", loseResponse);
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Not sent." })).toHaveCount(0);

  const rows = await (
    await fetch(`${LOCAL_API}/rest/v1/messages?select=id&body=eq.${encodeURIComponent(text)}`, {
      headers: adminHeaders(),
    })
  ).json();
  expect(rows).toHaveLength(1);
});

test("a sent message never flips to 'Not sent' when its response is lost but the echo arrives", async ({ page }) => {
  test.skip(!SECRET_KEY, "SUPABASE_SECRET_KEY not set");
  await signInAsGuest(page);
  await page.route("**/rest/v1/messages*", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fetch();
    await route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
  });

  // The echo can only win if the room's realtime channel is already joined.
  await expect(log(page)).toHaveAttribute("data-realtime", "live");
  const text = unique("echo wins");
  await send(page, text);
  // Whatever arrives first, the end state is one delivered message.
  await expect(log(page).getByText(text)).toHaveCount(1);
  await expect(page.getByRole("alert").filter({ hasText: "Not sent." })).toHaveCount(0, { timeout: 10_000 });
  const rows = await (
    await fetch(`${LOCAL_API}/rest/v1/messages?select=id&body=eq.${encodeURIComponent(text)}`, {
      headers: adminHeaders(),
    })
  ).json();
  expect(rows).toHaveLength(1);
});

test("the 21st message in a minute is rate limited with a friendly message", async ({ page }) => {
  await signInAsGuest(page);
  const tag = unique("burst");
  for (let i = 1; i <= 21; i++) {
    await send(page, `${tag} #${i}`);
  }
  await expect(page.getByRole("alert").filter({ hasText: "Slow down: you can send 20 messages a minute." })).toHaveCount(1);
  await expect(log(page).getByText(`${tag} #20`, { exact: true })).toBeVisible();
});

// Attack test #13: markup in a message is shown as text and never runs.
test("HTML and scripts in messages render as plain text", async ({ page }) => {
  await signInAsGuest(page);
  let dialogs = 0;
  page.on("dialog", (dialog) => {
    dialogs++;
    void dialog.dismiss();
  });

  const tag = Math.random().toString(36).slice(2, 8);
  const script = `<script>window.__xss = "${tag}"; alert(1)</script>`;
  const img = `<img src=x onerror="window.__xss='${tag}'; alert(1)">`;
  await send(page, script);
  await send(page, img);

  await expect(log(page).getByText(script, { exact: true })).toBeVisible();
  await expect(log(page).getByText(img, { exact: true })).toBeVisible();
  await page.reload();
  await expect(log(page).getByText(img, { exact: true })).toBeVisible();

  expect(await page.evaluate(() => (window as unknown as { __xss?: string }).__xss)).toBeUndefined();
  await expect(log(page).locator("img, script")).toHaveCount(0);
  expect(dialogs).toBe(0);
});

test("the length limit counts characters the way the database does", async ({ page }) => {
  await signInAsGuest(page);
  const sendButton = page.getByRole("button", { name: "Send message" });

  // 2,000 emoji are 4,000 UTF-16 units in JavaScript but 2,000 characters in Postgres.
  await composer(page).fill("🙂".repeat(2000));
  await expect(page.getByText("2,000 / 2,000")).toBeVisible();
  await expect(sendButton).toBeEnabled();

  await composer(page).fill("a".repeat(2001));
  await expect(page.getByText("2,001 / 2,000")).toBeVisible();
  await expect(sendButton).toBeDisabled();
});
