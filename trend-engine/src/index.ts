/**
 * CLI entry point.
 *
 *   npm run scout   → run just the Trend Scout and print ranked topics
 *   npm start       → run the full pipeline once (DRY_RUN unless configured)
 *   npm run daemon  → continuously run the pipeline on a jittered schedule
 *
 * DRY_RUN is the default; nothing is published and no API key is required.
 */

import { config, modeBanner } from './config.js';
import { discoverTopics } from './agents/trendScout.js';
import { setLLM } from './llm.js';
import { runOnce } from './orchestrator.js';
import { runDaemon } from './scheduler.js';
import { makeMockLLM } from './testing/mockLlm.js';

async function main() {
  // DRY_RUN hits no external APIs — including Anthropic. Swap in the
  // deterministic mock brain so the whole pipeline runs offline, keeping the
  // "no API key required" contract documented above.
  if (config.dryRun) setLLM(makeMockLLM());

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

  if (cmd === 'daemon') {
    await runDaemon();
    return;
  }

  console.error(`Unknown command "${cmd}". Use "scout | run | daemon".`);
  process.exit(1);
}

main().catch((err) => {
  console.error('\n💥 Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
