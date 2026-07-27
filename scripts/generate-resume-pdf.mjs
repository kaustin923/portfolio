/**
 * Renders /resume/print with Chromium and writes public/kyle-austin-resume.pdf.
 *
 * The PDF is generated from the same `src/data/resume.ts` the site renders, so
 * the download can never drift from the page.
 *
 * Usage:
 *   npm run dev            # or any server on BASE_URL
 *   node scripts/generate-resume-pdf.mjs [baseUrl]
 */
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "..", "public", "kyle-austin-resume.pdf");
const BASE = process.argv[2] ?? process.env.BASE_URL ?? "http://localhost:3000";

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const res = await page.goto(`${BASE}/resume/print`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });

  if (!res || !res.ok()) {
    throw new Error(`Could not load ${BASE}/resume/print (HTTP ${res?.status()})`);
  }

  // Chromium only applies @page and print media through emulateMedia.
  await page.emulateMedia({ media: "print" });
  await mkdir(dirname(OUT), { recursive: true });
  const buf = await page.pdf({
    path: OUT,
    format: "Letter",
    printBackground: true,
    preferCSSPageSize: true,
  });

  // A resume that spills onto a second page is a bug, not a preference.
  const pages = (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? [])
    .length;
  console.log(`Wrote ${OUT} (${pages} page${pages === 1 ? "" : "s"})`);
  if (pages !== 1) {
    console.error(
      `\nERROR: expected 1 page, got ${pages}. Trim src/data/resume.ts or tighten src/app/resume/print/page.tsx.`
    );
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
