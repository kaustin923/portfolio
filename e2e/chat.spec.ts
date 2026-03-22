import { test, expect } from "@playwright/test";

test.describe("Chat Widget", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for hydration
    await page.waitForSelector("h1", { timeout: 30_000 });
  });

  test("toggle button is visible with correct aria label", async ({
    page,
  }) => {
    const button = page.getByLabel("Open chat");
    await expect(button).toBeVisible();
  });

  test("clicking opens chat panel with greeting", async ({ page }) => {
    await page.getByLabel("Open chat").click();

    await expect(page.getByText("Ask about Kyle")).toBeVisible();
    await expect(
      page.getByText("Hi! I'm an AI that can answer questions")
    ).toBeVisible();
  });

  test("close button works", async ({ page }) => {
    await page.getByLabel("Open chat").click();
    await expect(page.getByText("Ask about Kyle")).toBeVisible();

    // Close button is in the header next to "Ask about Kyle"
    await page.getByLabel("Close chat").click();

    await expect(page.getByText("Ask about Kyle")).not.toBeVisible();
  });

  test("sample prompts visible on initial open", async ({ page }) => {
    await page.getByLabel("Open chat").click();

    await expect(page.getByText("What's Kyle's background?")).toBeVisible();
    await expect(page.getByText("Tell me about his AI projects")).toBeVisible();
    await expect(page.getByText("What tech does he work with?")).toBeVisible();
    await expect(
      page.getByText("Why is he looking for a new role?")
    ).toBeVisible();
  });

  test("clicking a sample prompt sends message and hides prompts", async ({
    page,
  }) => {
    await page.getByLabel("Open chat").click();

    const prompt = page.getByRole("button", {
      name: "What's Kyle's background?",
    });
    await expect(prompt).toBeVisible();
    await prompt.click();

    // Sample prompts should disappear
    await expect(
      page.getByRole("button", { name: "Tell me about his AI projects" })
    ).not.toBeVisible();
  });

  test("clear button visible after messages, resets to initial state", async ({
    page,
  }) => {
    await page.getByLabel("Open chat").click();

    // Clear button should NOT be visible with only greeting
    const clearButton = page.getByLabel("Clear chat");
    await expect(clearButton).not.toBeVisible();

    // Send a message via sample prompt
    await page
      .getByRole("button", { name: "What's Kyle's background?" })
      .click();

    // Wait for user message to appear (messages > 1 triggers clear button)
    await expect(clearButton).toBeVisible({ timeout: 10_000 });

    // Click clear
    await clearButton.click();

    // Should reset to greeting + sample prompts
    await expect(
      page.getByText("Hi! I'm an AI that can answer questions")
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "What's Kyle's background?" })
    ).toBeVisible();
    await expect(clearButton).not.toBeVisible();
  });
});
