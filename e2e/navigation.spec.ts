import { test, expect } from "@playwright/test";

test.describe("Navigation", () => {
  test("desktop navbar links scroll to sections", async ({
    page,
    isMobile,
  }) => {
    test.skip(!!isMobile, "Desktop-only test");
    await page.goto("/");
    await page.waitForSelector("nav a", { timeout: 30_000 });

    for (const section of ["About", "Resume", "Projects"]) {
      const navLink = page.locator("nav").getByRole("link", { name: section });
      await navLink.click();
      const target = page.locator(`#${section.toLowerCase()}`);
      await expect(target).toBeInViewport({ timeout: 5000 });
    }
  });

  test("mobile hamburger menu works", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Mobile-only test");
    await page.goto("/");
    await page.waitForSelector("nav", { timeout: 30_000 });

    const hamburger = page.getByLabel("Toggle menu");
    await expect(hamburger).toBeVisible();
    await hamburger.click();

    const aboutLink = page.locator("nav").getByRole("link", { name: "About" });
    await expect(aboutLink).toBeVisible();
    await aboutLink.click();

    // Menu should close after click
    await expect(aboutLink).not.toBeVisible({ timeout: 5000 });
  });

  test("brand link navigates home from project page", async ({ page }) => {
    await page.goto("/projects/ios-fitness-app");
    await page.waitForSelector("nav", { timeout: 30_000 });

    const brand = page.locator("nav a").first();
    await expect(brand).toBeVisible();
    await brand.click();

    await page.waitForURL("/", { timeout: 15_000 });
  });
});
