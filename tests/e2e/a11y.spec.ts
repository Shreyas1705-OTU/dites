import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { signInAsGuest } from "./helpers";

// Automated accessibility scan (axe-core, WCAG 2.2 A/AA rules) of each main
// screen in light and dark mode. Automated checks catch roughly a third of
// accessibility problems (contrast, names, roles, ARIA misuse); keyboard and
// screen-reader behaviour is covered by the other tests and manual checks.

async function scan(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const summary = results.violations.map(
    (v) => `${v.impact}: ${v.id} (${v.nodes.length}) ${v.help}\n    ${v.nodes.map((n) => n.target.join(" ")).join("\n    ")}`,
  );
  expect(summary, summary.join("\n")).toEqual([]);
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} mode`, () => {
    test.use({ colorScheme: scheme });

    test("sign-in screen", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("button", { name: "Try as guest" })).toBeEnabled({ timeout: 15_000 });
      await scan(page);
    });

    test("Global chat with messages and the composer", async ({ page }) => {
      await signInAsGuest(page);
      const box = page.getByRole("textbox", { name: /^Message / });
      await box.fill(`a11y check ${Math.random().toString(36).slice(2, 7)}`);
      await box.press("Enter");
      await expect(page.getByText("Sending…")).toHaveCount(0);
      await scan(page);
    });

    test("members panel", async ({ page }) => {
      await signInAsGuest(page);
      await page.getByRole("button", { name: /^Members/ }).click();
      await expect(page.getByRole("dialog", { name: "Members of Global chat" })).toBeVisible();
      await scan(page);
    });

    test("new message dialog with results", async ({ page }) => {
      await signInAsGuest(page);
      const isPhone = (page.viewportSize()?.width ?? 1280) < 768;
      if (isPhone) await page.getByRole("button", { name: "Open rooms and messages" }).click();
      await page
        .getByRole("navigation", { name: "Rooms and direct messages" })
        .filter({ visible: true })
        .getByRole("button", { name: "New direct message" })
        .click();
      await page.getByRole("dialog", { name: "New message" }).getByLabel("Name or username").fill("guest_");
      await expect(page.getByText(/No one found starting with/)).toBeVisible();
      await scan(page);
    });

    test("profile settings", async ({ page }) => {
      await signInAsGuest(page);
      await page.goto("/settings/profile");
      await expect(page.getByRole("button", { name: "Save profile" })).toBeVisible();
      await scan(page);
    });
  });
}

test("keyboard: the skip link is first and jumps to the main content", async ({ page }) => {
  await signInAsGuest(page);
  // A fresh load, so focus starts at the top of the document.
  await page.reload();
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main-content$/);
});

test("keyboard: Escape closes dialogs and returns focus to what opened them", async ({ page }) => {
  await signInAsGuest(page);
  const trigger = page.getByRole("button", { name: /^Members/ });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Members of Global chat" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
