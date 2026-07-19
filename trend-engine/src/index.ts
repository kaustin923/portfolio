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
    const { topics, rawSignalCount, upcomingCount, bySource, skipped } = await discoverTopics();
    console.log(
      `\n${rawSignalCount} reactive signals (${Object.entries(bySource)
        .map(([s, n]) => `${s}:${n}`)
        .join(', ')}) + ${upcomingCount} upcoming catalysts → ${topics.length} actionable forecasts\n`,
    );
    for (const t of topics) {
      console.log(`${t.opportunityScore.toString().padStart(3)}/100  [${t.stage}] ${t.title}`);
      console.log(`         ${t.recommendation} · ${t.postWindow} (lead ${t.leadTimeDays}d)`);
      console.log(`         ${t.catalyst ? `catalyst: ${t.catalyst} · ` : ''}domains: ${t.domains.join(', ')}`);
      console.log(`         angle:    ${t.suggestedAngle}\n`);
    }
    if (skipped.length) {
      console.log(`⏭  skipped as too-late/weak:`);
      for (const s of skipped) console.log(`   - [${s.stage}] ${s.title} (${s.recommendation})`);
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
