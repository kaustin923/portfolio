import { test, expect } from "@playwright/test";

test.describe("Resume", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for page hydration
    await page.waitForSelector("h1", { timeout: 30_000 });
  });

  test("default open/closed state of sections", async ({ page }) => {
    const resume = page.locator("#resume");
    await resume.scrollIntoViewIfNeeded();
    // Summary, Technical Skills, Experience should be open (content visible)
    await expect(
      resume.getByText("Forward-deployed engineer", { exact: false })
    ).toBeVisible();
    await expect(resume.getByText("AI & LLM")).toBeVisible();
    await expect(
      resume.getByText("PricewaterhouseCoopers", { exact: false })
    ).toBeVisible();

    // Education should be closed (content not visible). Scope to the resume
    // section; the About section also names the school.
    await expect(resume.getByText("Kent State University")).not.toBeVisible();
  });

  test("click to expand and collapse sections", async ({ page }) => {
    const resume = page.locator("#resume");
    const eduButton = resume.getByRole("button", { name: "Education" });
    await eduButton.scrollIntoViewIfNeeded();
    await eduButton.click();
    await expect(resume.getByText("Kent State University")).toBeVisible();

    await eduButton.click();
    await expect(resume.getByText("Kent State University")).not.toBeVisible();
  });

  test("PDF download link has correct attributes", async ({ page }) => {
    const downloadLink = page.getByRole("link", { name: /Download/i }).first();
    await expect(downloadLink).toHaveAttribute("href", "/kyle-austin-resume.pdf");
    await expect(downloadLink).toHaveAttribute("download", /.*/);
  });

  test("PDF file is accessible and valid", async ({ request }) => {
    const response = await request.get("/kyle-austin-resume.pdf");
    expect(response.status()).toBe(200);

    const contentType = response.headers()["content-type"];
    expect(contentType).toContain("application/pdf");

    const body = await response.body();
    expect(body.length).toBeGreaterThan(10_000);
  });
});
