import { test, expect } from "@playwright/test";

test.describe("Homepage", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for client hydration - hero text appears after React hydrates
    await page.waitForSelector("h1", { timeout: 30_000 });
  });

  test("hero renders with key elements", async ({ page }) => {
    const h1 = page.locator("h1");
    await expect(h1).toBeVisible();
    await expect(h1).not.toBeEmpty();

    await expect(page.getByText("AI Solutions Engineer")).toBeVisible();

    const headshot = page.locator('img[alt="Kyle Austin"]');
    await expect(headshot).toBeVisible();

    await expect(page.getByRole("link", { name: /See My Work/i })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Download Resume/i })
    ).toBeVisible();
  });

  test("highlights section renders 3 cards", async ({ page }) => {
    await expect(page.getByText("NARUC Spring Conference")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Executive Leadership Conference" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "AI Transformation Office" }).first()
    ).toBeVisible();
  });

  test("about section has key content", async ({ page }) => {
    const about = page.locator("#about");
    await expect(about.getByRole("heading", { name: "About" })).toBeVisible();
    await expect(
      about.getByRole("link", { name: /kaustin923@gmail.com/i })
    ).toBeVisible();
    await expect(
      about.getByRole("link", { name: /LinkedIn/i })
    ).toBeVisible();
    await expect(about.getByText("Cherry Hill, NJ")).toBeVisible();
  });

  test("resume section with collapsible sections", async ({ page }) => {
    const resumeHeading = page.getByRole("heading", { name: "Resume" });
    await expect(resumeHeading).toBeVisible();

    // 5 collapsible sections: Summary, Technical Skills, Experience, Personal Projects, Education
    const sectionButtons = page.locator("button", { hasText: /(Summary|Technical Skills|Experience|Personal Projects|Education)/ });
    await expect(sectionButtons).toHaveCount(5);
  });

  test("projects section with subheadings and cards", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /Personal Projects/i })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Professional Projects/i })
    ).toBeVisible();

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
});
