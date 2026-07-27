import { test, expect } from "@playwright/test";

const NAV = [
  { label: "What I build", id: "capabilities" },
  { label: "Work", id: "projects" },
  { label: "About", id: "about" },
  { label: "Resume", id: "resume" },
];

test.describe("Navigation", () => {
  test("desktop navbar links scroll to sections", async ({
    page,
    isMobile,
  }) => {
    test.skip(!!isMobile, "Desktop-only test");
    await page.goto("/");
    await page.waitForSelector("nav a", { timeout: 30_000 });

    // Scope to the header nav; the footer repeats the same link labels.
    const mainNav = page.getByRole("navigation", { name: "Main" });
    for (const { label, id } of NAV) {
      await mainNav.getByRole("link", { name: label }).click();
      await expect(page.locator(`#${id}`)).toBeInViewport({ timeout: 5000 });
    }
  });

  test("mobile hamburger menu works", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Mobile-only test");
    await page.goto("/");
    await page.waitForSelector("nav", { timeout: 30_000 });

    const hamburger = page.getByLabel("Open menu");
    await expect(hamburger).toBeVisible();
    await hamburger.click();

    const aboutLink = page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "About" });
    await expect(aboutLink).toBeVisible();
    await aboutLink.click();

    // Menu closes after a selection.
    await expect(aboutLink).not.toBeVisible({ timeout: 5000 });
  });

  test("skip link is reachable by keyboard", async ({ page, isMobile }) => {
    test.skip(!!isMobile, "Desktop-only test");
    await page.goto("/");
    await page.waitForSelector("h1", { timeout: 30_000 });

    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("link", { name: /Skip to content/i })
    ).toBeFocused();
  });

  test("brand link navigates home from a project page", async ({ page }) => {
    await page.goto("/projects/ios-fitness-app");
    await page.waitForSelector("nav", { timeout: 30_000 });

    await page.locator("nav a").first().click();
    await page.waitForURL("/", { timeout: 15_000 });
  });
});
