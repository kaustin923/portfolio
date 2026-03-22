import { test, expect } from "@playwright/test";

test.describe("404 Page", () => {
  test("shows 404 content and back link", async ({ page }) => {
    await page.goto("/nonexistent-page");
    // Wait for page to render
    await page.waitForSelector("main", { timeout: 30_000 });

    await expect(page.getByText("404")).toBeVisible();
    await expect(page.getByText("Page not found")).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Back to Home/i })
    ).toBeVisible();
  });
});
