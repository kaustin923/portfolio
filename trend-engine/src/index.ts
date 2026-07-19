/**
 * CLI entry point.
 *
 *   npm run scout   → run just the Trend Scout and print ranked topics
 *   npm start       → run the full pipeline once (DRY_RUN unless configured)
 *
 * DRY_RUN is the default; nothing is published and no API key is required.
 */

import { modeBanner } from './config.js';
import { discoverTopics } from './agents/trendScout.js';
import { runOnce } from './orchestrator.js';

async function main() {
  const cmd = process.argv[2] ?? 'run';

  if (cmd === 'scout') {
    console.log(modeBanner());
    const { topics, rawSignalCount, bySource } = await discoverTopics();
    console.log(
      `\n${rawSignalCount} signals (${Object.entries(bySource)
        .map(([s, n]) => `${s}:${n}`)
        .join(', ')}) → ${topics.length} topics\n`,
    );
    for (const t of topics) {
      console.log(`${t.opportunityScore.toString().padStart(3)}/100  ${t.title}`);
      console.log(`         ${t.momentum} · ${t.longevity} · saturation:${t.saturationRisk}`);
      console.log(`         domains: ${t.domains.join(', ')}`);
      console.log(`         angle:   ${t.suggestedAngle}\n`);
    }
    return;
  }

  if (cmd === 'run') {
    await runOnce();
    return;
  }

  console.error(`Unknown command "${cmd}". Use "scout" or "run".`);
  process.exit(1);
}

main().catch((err) => {
  console.error('\n💥 Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
