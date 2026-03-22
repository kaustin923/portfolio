import { test, expect } from "@playwright/test";

const PROJECT_SLUGS = [
  "ios-fitness-app",
  "super-bowl-squares",
  "rag-gap-assessment",
  "climate-ai-platform",
  "genai-emissions-extraction",
  "ai-transformation-office",
];

test.describe("Projects", () => {
  test("all 6 project cards render on homepage", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("h1", { timeout: 30_000 });

    const projectNames = [
      "iOS Fitness App",
      "Super Bowl Squares",
      "RAG Gap Assessment Tool",
      "Climate AI Platform",
      "GenAI Emissions Extraction",
      "AI Transformation Office",
    ];

    for (const name of projectNames) {
      await expect(page.getByText(name).first()).toBeVisible();
    }
  });

  test("project cards link to detail pages", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("h1", { timeout: 30_000 });

    for (const slug of PROJECT_SLUGS) {
      const link = page.locator(`a[href="/projects/${slug}"]`);
      await expect(link).toBeAttached();
    }
  });

  for (const slug of PROJECT_SLUGS) {
    test(`project detail page loads: ${slug}`, async ({ page }) => {
      await page.goto(`/projects/${slug}`);
      await page.waitForSelector("h1", { timeout: 30_000 });

      // Project name heading
      const h1 = page.locator("h1");
      await expect(h1).toBeVisible();
      await expect(h1).not.toBeEmpty();

      // Tech tags - use text-based selector since Tailwind v4 may compile classes differently
      const techTags = page.locator("span.rounded-full").first();
      await expect(techTags).toBeVisible();

      // Key sections
      await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Challenges" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Outcomes" })).toBeVisible();

      // Back link
      await expect(
        page.getByRole("link", { name: /Back to Projects/i })
      ).toBeVisible();
    });
  }

  test("back to projects link works", async ({ page }) => {
    await page.goto("/projects/ios-fitness-app");
    await page.waitForSelector("h1", { timeout: 30_000 });

    await page.getByRole("link", { name: /Back to Projects/i }).click();
    await page.waitForURL(/\/#projects/, { timeout: 15_000 });
  });
});
