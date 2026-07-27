import { test, expect } from "@playwright/test";

const PROJECT_SLUGS = [
  "capital-project-platform",
  "ai-native-delivery-engine",
  "decarbonization-knowledge-graph",
  "rag-gap-assessment",
  "climate-ai-platform",
  "copilot-studio-agent-flows",
  "enterprise-data-migration",
  "genai-emissions-extraction",
  "ai-transformation-office",
  "ios-fitness-app",
  "super-bowl-squares",
];

test.describe("Projects", () => {
  test("every project card renders on the homepage", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("h1", { timeout: 30_000 });

    const section = page.locator("#projects");
    await section.scrollIntoViewIfNeeded();

    // Scope to the grid; the capability panel also links to project pages.
    for (const slug of PROJECT_SLUGS) {
      await expect(
        section.locator(`a[href="/projects/${slug}"]`)
      ).toBeAttached();
    }
  });

  test("flagship projects are badged", async ({ page }) => {
    await page.goto("/");
    const section = page.locator("#projects");
    await section.scrollIntoViewIfNeeded();
    // Four spotlight projects carry the flagship badge.
    await expect(section.getByText("Flagship")).toHaveCount(4);
  });

  for (const slug of PROJECT_SLUGS) {
    test(`project detail page loads: ${slug}`, async ({ page }) => {
      const response = await page.goto(`/projects/${slug}`);
      expect(response?.status()).toBe(200);
      await page.waitForSelector("h1", { timeout: 30_000 });

      const h1 = page.locator("h1");
      await expect(h1).toBeVisible();
      await expect(h1).not.toBeEmpty();

      await expect(
        page.getByRole("heading", { name: "Overview" })
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Challenges" })
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Outcomes" })
      ).toBeVisible();

      await expect(page.getByRole("link", { name: /Back to/i })).toBeVisible();
    });
  }

  test("project pages carry their own metadata", async ({ page }) => {
    await page.goto("/projects/decarbonization-knowledge-graph");
    await expect(page).toHaveTitle(/Decarbonization Knowledge Graph/i);
  });

  test("back link returns to the projects section", async ({ page }) => {
    await page.goto("/projects/ios-fitness-app");
    await page.waitForSelector("h1", { timeout: 30_000 });

    await page.getByRole("link", { name: /Back to/i }).click();
    await page.waitForURL(/#projects/, { timeout: 15_000 });
  });
});
