import { expect, type Page } from "@playwright/test";

export const GENERAL_ROOM_ID = "00000000-0000-4000-8000-000000000001";
export const LOCAL_API = "http://127.0.0.1:54321";

// Local stack's secret key, passed in by the developer or CI, never committed:
//   SUPABASE_SECRET_KEY=$(npx supabase status -o json | jq -r .SECRET_KEY) npx playwright test
export const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

export function adminHeaders() {
  return {
    apikey: SECRET_KEY!,
    Authorization: `Bearer ${SECRET_KEY}`,
    "Content-Type": "application/json",
  };
}

export async function signInAsGuest(page: Page) {
  await page.goto("/");
  const guest = page.getByRole("button", { name: "Try as guest" });
  await expect(guest).toBeEnabled({ timeout: 15_000 });
  await guest.click();
  await expect(page).toHaveURL(new RegExp(`/chat/${GENERAL_ROOM_ID}$`));
}

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;

// On phones the sidebar lives in a drawer behind the header's menu button.
export async function openNav(page: Page) {
  if (isMobile(page)) {
    await page.getByRole("button", { name: "Open rooms and messages" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
  }
  return page.getByRole("navigation", { name: "Rooms and direct messages" }).filter({ visible: true });
}

export async function currentUsername(page: Page) {
  const nav = await openNav(page);
  const text = await nav.getByText(/@guest_[0-9a-f]{5}/).textContent();
  const username = text!.match(/guest_[0-9a-f]{5}/)![0];
  if (isMobile(page)) await page.keyboard.press("Escape");
  return username;
}
