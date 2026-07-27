import { test, expect, type Page } from "@playwright/test";
import { chatSuggestions } from "../src/data/knowledge-base";

/**
 * These tests drive the chat UI against a stubbed /api/chat, so they never call
 * Anthropic, never need ANTHROPIC_API_KEY, and never touch the rate limiter.
 * The live model is covered by chat-api.spec.ts, which only runs when
 * E2E_TESTING is set (see testIgnore in playwright.config.ts).
 */
const STUB_ANSWER =
  "Kyle led the build end to end. Details are in the [Capital Project Platform](/projects/capital-project-platform) write-up.";

const GREETING_FRAGMENT = "Hi! I'm an AI that can answer questions";

/** The chips the panel opens with. The rotation cursor starts at the top. */
const OPENING_CHIPS = chatSuggestions.slice(0, 4);
const FIRST_CHIP = OPENING_CHIPS[0];

async function stubChatApi(page: Page) {
  await page.route("**/api/chat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/plain; charset=utf-8",
      body: STUB_ANSWER,
    });
  });
}

async function openChat(page: Page) {
  await page.getByRole("button", { name: "Open chat" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

/** Waits for the stubbed answer, which renders its link through markdown. */
function answerLink(page: Page) {
  return page
    .getByRole("log")
    .getByRole("link", { name: "Capital Project Platform" });
}

test.describe("Chat widget", () => {
  test.beforeEach(async ({ page }) => {
    await stubChatApi(page);
    await page.goto("/");
    // Wait for hydration before driving the client-side widget.
    await page.waitForSelector("h1", { timeout: 30_000 });
  });

  test("launcher is visible and named", async ({ page }) => {
    const launcher = page.getByRole("button", { name: "Open chat" });
    await expect(launcher).toBeVisible();
    await expect(launcher).toHaveAttribute("aria-haspopup", "dialog");
  });

  test("launcher opens a labelled modal dialog with the greeting", async ({
    page,
  }) => {
    await openChat(page);

    const dialog = page.getByRole("dialog");
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(dialog).toHaveAttribute("aria-label", "Ask about Kyle");
    await expect(dialog.getByText(GREETING_FRAGMENT)).toBeVisible();
  });

  test("escape closes the panel and returns focus to the launcher", async ({
    page,
  }) => {
    await openChat(page);

    await page.keyboard.press("Escape");

    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByRole("button", { name: "Open chat" })).toBeFocused();
  });

  test("close button closes the panel", async ({ page }) => {
    await openChat(page);

    await page.getByRole("button", { name: "Close chat" }).click();

    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("opening the panel moves focus to the input", async ({ page }) => {
    await openChat(page);

    await expect(
      page.getByRole("dialog").getByLabel("Ask a question about Kyle")
    ).toBeFocused();
  });

  test("suggestion chips come from the knowledge base", async ({ page }) => {
    await openChat(page);

    const dialog = page.getByRole("dialog");
    for (const suggestion of OPENING_CHIPS) {
      await expect(
        dialog.getByRole("button", { name: suggestion.label })
      ).toBeVisible();
    }
  });

  test("clicking a suggestion sends the question and renders the answer", async ({
    page,
  }) => {
    await openChat(page);

    await page
      .getByRole("dialog")
      .getByRole("button", { name: FIRST_CHIP.label })
      .click();

    await expect(
      page.getByRole("log").getByText(FIRST_CHIP.question)
    ).toBeVisible();
    // Markdown renders, so the link text shows rather than the raw URL.
    await expect(answerLink(page)).toBeVisible();
  });

  test("typing a question sends it", async ({ page }) => {
    await openChat(page);

    const input = page
      .getByRole("dialog")
      .getByLabel("Ask a question about Kyle");
    await input.fill("What does Kyle build?");
    await input.press("Enter");

    await expect(
      page.getByRole("log").getByText("What does Kyle build?")
    ).toBeVisible();
    await expect(answerLink(page)).toBeVisible();
  });

  test("fresh chips appear once an answer lands", async ({ page }) => {
    await openChat(page);

    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: FIRST_CHIP.label }).click();
    await expect(answerLink(page)).toBeVisible();

    await expect(dialog.getByText("Ask next")).toBeVisible();
    // The question just asked is not offered again.
    await expect(
      dialog.getByRole("button", { name: FIRST_CHIP.label })
    ).toHaveCount(0);
  });

  test("an internal link navigates and gets the panel out of the way", async ({
    page,
  }) => {
    await openChat(page);

    await page
      .getByRole("dialog")
      .getByRole("button", { name: FIRST_CHIP.label })
      .click();
    await expect(answerLink(page)).toBeVisible();

    await answerLink(page).click();

    await expect(page).toHaveURL(/\/projects\/capital-project-platform/);
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("clear resets the conversation", async ({ page }) => {
    await openChat(page);

    const dialog = page.getByRole("dialog");
    const clear = dialog.getByRole("button", { name: "Clear chat" });

    // Nothing to clear until something has been asked.
    await expect(clear).toHaveCount(0);

    await dialog.getByRole("button", { name: FIRST_CHIP.label }).click();
    await expect(clear).toBeVisible();

    await clear.click();

    await expect(dialog.getByText(GREETING_FRAGMENT)).toBeVisible();
    await expect(clear).toHaveCount(0);
    await expect(
      dialog.getByRole("button", { name: FIRST_CHIP.label })
    ).toBeVisible();
  });

  test("the hero button opens the chat", async ({ page }) => {
    await page.getByRole("button", { name: "Ask about my work" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(GREETING_FRAGMENT)).toBeVisible();
  });

  test("the conversation survives navigating away and back", async ({
    page,
  }) => {
    await openChat(page);

    await page
      .getByRole("dialog")
      .getByRole("button", { name: FIRST_CHIP.label })
      .click();
    await expect(answerLink(page)).toBeVisible();

    await page.goto("/projects/capital-project-platform");
    await page.goto("/");
    await page.waitForSelector("h1", { timeout: 30_000 });

    await openChat(page);

    await expect(
      page.getByRole("log").getByText(FIRST_CHIP.question)
    ).toBeVisible();
    await expect(answerLink(page)).toBeVisible();
  });

  test("a failed request surfaces an error instead of an empty bubble", async ({
    page,
  }) => {
    // Registered after the stub in beforeEach, so this handler wins.
    await page.route("**/api/chat", async (route) => {
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({ error: "The assistant is offline right now." }),
      });
    });

    await openChat(page);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: FIRST_CHIP.label })
      .click();

    // Scoped to the dialog: Next's route announcer is also a role="alert".
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
      "The assistant is offline right now."
    );
  });
});
