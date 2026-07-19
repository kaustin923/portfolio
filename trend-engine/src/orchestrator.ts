/**
 * Orchestrator — drives the whole pipeline, one topic at a time:
 *
 *   Trend Scout ──▶ Sourcing ──▶ Editor ──▶ Compliance Gate ──▶ Telegram
 *   approval ──▶ Publisher ──▶ Monitor
 *
 * The control flow lives here (deterministic), while the *reasoning* lives in
 * the individual agents (Claude). Nothing outward-facing happens without
 * passing the Compliance Gate and — for anything but our own original content —
 * an explicit human approval over Telegram.
 */

import { config, modeBanner } from './config.js';
import { checkCompliance } from './agents/compliance.js';
import { draftClip } from './agents/editor.js';
import { trackResults } from './agents/monitor.js';
import { publish } from './agents/publisher.js';
import { findClips } from './agents/sourcing.js';
import { discoverTopics } from './agents/trendScout.js';
import { requestApproval } from './approval/telegram.js';
import {
  loadState,
  recordPublished,
  saveState,
  topicKey,
  wasRecentlyPublished,
  type RunState,
} from './state.js';
import type { PostMetrics, Topic } from './types.js';

export interface RunReport {
  topicsConsidered: number;
  rawSignals: number;
  published: number;
  rejected: number;
  blocked: number;
  failed: number;
  deduped: number;
  metrics: PostMetrics[];
}

async function processTopic(
  topic: Topic,
  report: RunReport,
  state: RunState,
  key: string,
): Promise<void> {
  console.log(`\n▶ ${topic.title}  (${topic.opportunityScore}/100 · ${topic.stage} · ${topic.recommendation})`);
  console.log(`  window: ${topic.postWindow} (lead ${topic.leadTimeDays}d${topic.catalyst ? `, catalyst: ${topic.catalyst}` : ''})`);
  console.log(`  angle:  ${topic.suggestedAngle}`);

  // 1. Source a licensed clip (best-licensed candidate first).
  const candidates = await findClips(topic);
  const candidate = candidates[0];
  if (!candidate) {
    console.log('  no licensed source found — skipping');
    return;
  }
  console.log(`  source: ${candidate.provider} (${candidate.license.type})`);

  // 2. Edit + caption.
  const draft = await draftClip(topic, candidate);

  // 3. Compliance gate — hard stop for anything without a defensible license.
  const compliance = checkCompliance(draft);
  if (!compliance.approved) {
    report.blocked++;
    console.log(`  ⛔ blocked by compliance: ${compliance.reasons.join('; ')}`);
    return;
  }

  // 4. Human approval over Telegram (skipped only for our own original content).
  let decision = { status: 'approved' as const, note: 'no human review required' };
  if (compliance.requiresHumanReview) {
    const human = await requestApproval(topic, draft, compliance);
    if (human.status !== 'approved') {
      report.rejected++;
      console.log(`  🚫 not published (${human.status}): ${human.note ?? ''}`);
      return;
    }
    decision = human as typeof decision;
  }

  // 5. Publish to every target platform via official APIs.
  const results = await publish(draft, decision);
  const ok = results.filter((r) => r.status === 'published').length;
  report.published += ok;
  console.log(`  ✅ published to ${ok}/${results.length} platforms`);

  const livePublished = results.filter(
    (result) =>
      result.status === 'published' &&
      result.postId != null &&
      !result.postId.startsWith('dryrun-'),
  );
  if (livePublished.length > 0) {
    recordPublished(
      state,
      key,
      topic.title,
      [...new Set(livePublished.map((result) => result.platform))],
    );
  }

  // 6. Monitor — record metrics to feed back into the Scout.
  const metrics = await trackResults(results, topic);
  report.metrics.push(...metrics);
}

export async function runOnce(): Promise<RunReport> {
  console.log(modeBanner());

  const report: RunReport = {
    topicsConsidered: 0,
    rawSignals: 0,
    published: 0,
    rejected: 0,
    blocked: 0,
    failed: 0,
    deduped: 0,
    metrics: [],
  };
  const state = loadState();

  // Trend Forecaster — the crown jewel.
  console.log('\n🔮 Trend Forecaster: fusing signals + upcoming catalysts…');
  const scout = await discoverTopics();
  report.rawSignals = scout.rawSignalCount;
  console.log(
    `  ${scout.rawSignalCount} reactive signals (${Object.entries(scout.bySource)
      .map(([s, n]) => `${s}:${n}`)
      .join(', ')}) + ${scout.upcomingCount} upcoming catalysts → ${scout.topics.length} actionable forecasts`,
  );

  for (const t of scout.topics) {
    console.log(`   • ${t.opportunityScore}/100  [${t.stage}] ${t.title}  (${t.recommendation}, lead ${t.leadTimeDays}d)`);
  }
  if (scout.skipped.length) {
    console.log(`  ⏭  skipped as too-late/weak: ${scout.skipped.map((s) => `${s.title} (${s.stage})`).join('; ')}`);
  }

  // Turn the top N into clips.
  const toProcess = scout.topics.slice(0, config.topicsPerRun);
  for (const topic of toProcess) {
    const key = topicKey(topic.title);
    if (wasRecentlyPublished(state, key)) {
      report.deduped++;
      console.log('  ⏭ skipping (published within dedupe window)');
      continue;
    }

    report.topicsConsidered++;
    try {
      await processTopic(topic, report, state, key);
    } catch (err) {
      report.failed++;
      console.error(
        `  ✖ topic failed: ${topic.title}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  state.lastRunAt = new Date().toISOString();
  state.runCount++;
  saveState(state);

  console.log(
    `\n📊 Run complete — published ${report.published}, rejected ${report.rejected}, ` +
      `blocked ${report.blocked}, failed ${report.failed}, deduped ${report.deduped}`,
  );
  return report;
}
