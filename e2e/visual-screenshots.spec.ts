import { test } from "@playwright/test";
import { mkdirSync } from "fs";
import { join } from "path";

const screenshotDir = join(__dirname, "screenshots");

test.beforeAll(() => {
  mkdirSync(screenshotDir, { recursive: true });
});

test.describe("Visual Screenshots", () => {
  test("homepage full page", async ({ page }, testInfo) => {
    await page.goto("/");
    await page.waitForSelector("h1", { timeout: 30_000 });
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: join(screenshotDir, `${testInfo.project.name}-homepage.png`),
      fullPage: true,
    });
  });

  test("project detail page", async ({ page }, testInfo) => {
    await page.goto("/projects/ios-fitness-app");
    await page.waitForSelector("h1", { timeout: 30_000 });
    await page.waitForTimeout(1000);

    await page.screenshot({
      path: join(screenshotDir, `${testInfo.project.name}-project-detail.png`),
      fullPage: true,
    });
  });

  test("404 page", async ({ page }, testInfo) => {
    await page.goto("/nonexistent-page");
    await page.waitForSelector("main", { timeout: 30_000 });
    await page.waitForTimeout(500);

    await page.screenshot({
      path: join(screenshotDir, `${testInfo.project.name}-404.png`),
      fullPage: true,
    });
  });

  test("chat open", async ({ page }, testInfo) => {
    await page.goto("/");
    await page.waitForSelector("h1", { timeout: 30_000 });
    await page.getByLabel("Open chat").click();
    await page.waitForTimeout(500);

    await page.screenshot({
      path: join(screenshotDir, `${testInfo.project.name}-chat-open.png`),
    });
  });
});
