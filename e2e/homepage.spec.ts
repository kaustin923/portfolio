import { test, expect } from "@playwright/test";

test.describe("Homepage", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("h1", { timeout: 30_000 });
  });

  test("hero renders with positioning and proof", async ({ page }) => {
    const h1 = page.locator("h1");
    await expect(h1).toBeVisible();
    await expect(h1).toHaveText("Kyle Austin");

    await expect(
      page.getByText("Forward-Deployed Engineer & Solutions Architect").first()
    ).toBeVisible();

    await expect(page.locator('img[alt="Kyle Austin"]')).toBeVisible();

    await expect(
      page.getByRole("link", { name: /See what I build/i })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Ask about my work/i })
    ).toBeVisible();
  });

  test("metrics band shows headline numbers", async ({ page }) => {
    const band = page.getByLabel("Key numbers");
    await expect(band).toBeVisible();
    await expect(band.getByText("1 of 9")).toBeVisible();
    await expect(band.getByText("$1.5M")).toBeVisible();
    await expect(band.getByText("92%")).toBeVisible();
  });

  test("capability tabs switch the panel content", async ({ page }) => {
    const section = page.locator("#capabilities");
    await section.scrollIntoViewIfNeeded();

    const tablist = section.getByRole("tablist", { name: "Capabilities" });
    await expect(tablist).toBeVisible();
    await expect(tablist.getByRole("tab")).toHaveCount(6);
    await expect(
      tablist.getByRole("tab", { name: /Agent Orchestration/i })
    ).toHaveAttribute("aria-selected", "true");

    const graphTab = tablist.getByRole("tab", { name: /Graph Architecture/i });
    await graphTab.click();
    await expect(graphTab).toHaveAttribute("aria-selected", "true");
    await expect(section.getByText(/Neo4j/i).first()).toBeVisible();
  });

  test("capability graph renders", async ({ page }) => {
    const section = page.locator("#capabilities");
    await section.scrollIntoViewIfNeeded();
    await expect(
      section.getByRole("heading", { name: /knowledge graph/i })
    ).toBeVisible();
    await expect(section.locator("svg[role='img']")).toBeVisible();
  });

  test("capability filter narrows the project grid", async ({ page }) => {
    const section = page.locator("#projects");
    await section.scrollIntoViewIfNeeded();

    await expect(section.getByText("11 projects")).toBeVisible();

    await section
      .getByRole("button", { name: "Graph Architecture", exact: true })
      .click();
    await expect(section.getByText("11 projects")).toHaveCount(0);
    await expect(
      section.getByRole("link", { name: /Decarbonization Knowledge Graph/i })
    ).toBeVisible();

    await section.getByRole("button", { name: /Clear/i }).click();
    await expect(section.getByText("11 projects")).toBeVisible();
  });

  test("lens tabs filter by involvement", async ({ page }) => {
    const section = page.locator("#projects");
    await section.scrollIntoViewIfNeeded();

    const leading = section.getByRole("tab", { name: "Leading" });
    await leading.click();
    await expect(leading).toHaveAttribute("aria-selected", "true");
    await expect(
      section.getByRole("link", { name: /AI Transformation Office/i })
    ).toBeVisible();
  });

  test("recognition section leads with the award", async ({ page }) => {
    const section = page.locator("#recognition");
    await section.scrollIntoViewIfNeeded();
    await expect(
      section.getByRole("heading", { name: /Luminary Award/i })
    ).toBeVisible();
    await expect(section.getByText(/1 of 9 recipients/i)).toBeVisible();
    await expect(
      section.getByRole("heading", { name: "NARUC Spring Conference" })
    ).toBeVisible();
  });

  test("about section has contact details", async ({ page }) => {
    const about = page.locator("#about");
    await about.scrollIntoViewIfNeeded();
    await expect(about.getByRole("heading", { name: "About" })).toBeVisible();
    await expect(
      about.getByRole("link", { name: /kaustin923@gmail.com/i })
    ).toBeVisible();
    await expect(about.getByRole("link", { name: /LinkedIn/i })).toBeVisible();
    await expect(about.getByText("Cherry Hill, NJ")).toBeVisible();
  });

  test("resume collapsibles expand", async ({ page }) => {
    const resume = page.locator("#resume");
    await resume.scrollIntoViewIfNeeded();
    await expect(resume.getByRole("heading", { name: "Resume" })).toBeVisible();

    for (const name of [
      "Summary",
      "Technical Skills",
      "Experience",
      "Personal Projects",
      "Education",
    ]) {
      await expect(resume.getByRole("button", { name })).toBeVisible();
    }

    const education = resume.getByRole("button", { name: "Education" });
    await expect(education).toHaveAttribute("aria-expanded", "false");
    await education.click();
    await expect(education).toHaveAttribute("aria-expanded", "true");
    await expect(resume.getByText(/Kent State University/i)).toBeVisible();
  });
});
