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
import { draftClip, draftOriginal } from './agents/editor.js';
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
import type { ClipDraft, PostMetrics, Topic } from './types.js';
import { appendFingerprint } from './variation.js';

const NO_ELIGIBLE_ORIGINAL_BROLL =
  'Original drafts require commercial-use stock, CC0, or public-domain b-roll with no attribution requirement.';

export interface RunReport {
  topicsConsidered: number;
  rawSignals: number;
  published: number;
  originals: number;
  rejected: number;
  blocked: number;
  failed: number;
  deduped: number;
  metrics: PostMetrics[];
}

async function processDraft(
  topic: Topic,
  draft: ClipDraft,
  report: RunReport,
  state: RunState,
  key: string,
  original: boolean,
): Promise<void> {
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
  if (original) report.originals++;
  const ok = results.filter((r) => r.status === 'published').length;
  report.published += ok;
  console.log(`  ✅ published to ${ok}/${results.length} platforms`);

  // [anti-template-variation] persist structure fingerprint
  const structure = draft.structure;
  if (ok > 0 && structure) {
    await appendFingerprint({
      v: 1,
      at: new Date().toISOString(),
      draftId: draft.id,
      videoIndex: structure.videoIndex,
      hookType: structure.hookType,
      openingHash: structure.openingHash,
      openingNgrams: structure.openingNgrams,
      captionPattern: structure.captionPattern,
      brollCount: structure.brollCount,
    });
  }

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
  const metrics = await trackResults(results, topic, {
    draft,
    tier: compliance.tier ?? null,
  });
  report.metrics.push(...metrics);
}

async function processTopic(
  topic: Topic,
  report: RunReport,
  state: RunState,
  key: string,
  produceSourced: boolean,
  produceOriginal: boolean,
): Promise<void> {
  console.log(`\n▶ ${topic.title}  (${topic.opportunityScore}/100 · ${topic.stage} · ${topic.recommendation})`);
  console.log(`  window: ${topic.postWindow} (lead ${topic.leadTimeDays}d${topic.catalyst ? `, catalyst: ${topic.catalyst}` : ''})`);
  console.log(`  angle:  ${topic.suggestedAngle}`);

  // 1. Source once so the sourced and original paths share the same candidates.
  const candidates = await findClips(topic);

  // [tier-router-cards] licensed-clip budget gate
  async function countLicensedClipsPublishedThisUtcMonth(): Promise<number> {
    let jsonl: string;
    try {
      const { readFile } = await import('node:fs/promises');
      jsonl = await readFile(`${config.dataDir}provenance.jsonl`, 'utf8');
    } catch {
      return 0;
    }

    const now = new Date();
    let count = 0;
    for (const line of jsonl.split('\n')) {
      if (!line.trim()) continue;
      try {
        const record = JSON.parse(line) as {
          status?: unknown;
          publishedAt?: unknown;
          license?: { type?: unknown };
        };
        if (
          record.status !== 'published' ||
          record.license?.type !== 'licensed' ||
          typeof record.publishedAt !== 'string'
        ) {
          continue;
        }
        const publishedAt = new Date(record.publishedAt);
        if (
          !Number.isNaN(publishedAt.getTime()) &&
          publishedAt.getUTCFullYear() === now.getUTCFullYear() &&
          publishedAt.getUTCMonth() === now.getUTCMonth()
        ) {
          count++;
        }
      } catch {
        // A malformed receipt must not prevent valid receipts from enforcing the cap.
      }
    }
    return count;
  }

  let usedLicensedClips = await countLicensedClipsPublishedThisUtcMonth();
  const budgetedCandidates = candidates.filter((candidate) => {
    if ((candidate.license.type as string) !== 'licensed') return true;
    if (usedLicensedClips >= config.licensing.monthlyClipBudget) {
      console.log(
        `  ⛔ licensed-clip budget (${usedLicensedClips}/${config.licensing.monthlyClipBudget} this month) reached - skipping licensed candidate ${candidate.id}`,
      );
      return false;
    }
    usedLicensedClips++;
    return true;
  });
  candidates.splice(0, candidates.length, ...budgetedCandidates);
  if (produceSourced) {
    const candidate = candidates[0];
    if (!candidate) {
      console.log('  no licensed source found — skipping');
    } else {
      console.log(`  source: ${candidate.provider} (${candidate.license.type})`);

      // 2. Edit + caption.
      const draft = await draftClip(topic, candidate);
      await processDraft(topic, draft, report, state, key, false);
    }
  }

  if (produceOriginal) {
    try {
      const draft = await draftOriginal(topic, candidates);
      await processDraft(topic, draft, report, state, `original:${topicKey(topic.title)}`, true);
    } catch (err) {
      if (err instanceof Error && err.message === NO_ELIGIBLE_ORIGINAL_BROLL) {
        console.log('  ⏭ no eligible b-roll for original — skipping');
        return;
      }
      report.failed++;
      console.error(
        `  ✖ original failed: ${topic.title}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }
}

export async function runOnce(): Promise<RunReport> {
  console.log(modeBanner());

  const report: RunReport = {
    topicsConsidered: 0,
    rawSignals: 0,
    published: 0,
    originals: 0,
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
  // ─── experiment hint [owned by task eval-report] ───
  let experimentPlan: import('./variation.js').ExperimentPlan | null = null;
  let experimentProcessed = false;
  try {
    const { planNextExperiment } = await import('./variation.js');
    experimentPlan = await planNextExperiment();
  } catch (err) {
    console.warn(
      '[orchestrator] failed to plan experiment hint (non-fatal):',
      err instanceof Error ? err.message : String(err),
    );
  }
  const originalsToProduce = Math.min(config.originalsPerRun, toProcess.length);
  for (const [index, topic] of toProcess.entries()) {
    const key = topicKey(topic.title);
    const originalKey = `original:${key}`;
    let produceSourced = true;
    let produceOriginal = index < originalsToProduce;

    if (wasRecentlyPublished(state, key)) {
      report.deduped++;
      produceSourced = false;
      console.log('  ⏭ skipping sourced clip (published within dedupe window)');
    } else {
      report.topicsConsidered++;
    }
    if (produceOriginal && wasRecentlyPublished(state, originalKey)) {
      report.deduped++;
      produceOriginal = false;
      console.log('  ⏭ skipping original (published within dedupe window)');
    }
    if (!produceSourced && !produceOriginal) continue;

    try {
      experimentProcessed = true;
      await processTopic(
        experimentPlan
          ? {
              ...topic,
              suggestedAngle:
                `${topic.suggestedAngle} (experiment: try a '${experimentPlan.value}' ` +
                `${experimentPlan.dimension} this time — soft suggestion, ignore if it hurts the angle)`,
            }
          : topic,
        report,
        state,
        key,
        produceSourced,
        produceOriginal,
      );
    } catch (err) {
      report.failed++;
      console.error(
        `  ✖ topic failed: ${topic.title}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }
  if (experimentPlan && experimentProcessed) {
    try {
      const { recordExperiment } = await import('./variation.js');
      await recordExperiment(experimentPlan);
    } catch (err) {
      console.warn(
        '[orchestrator] failed to record experiment hint (non-fatal):',
        err instanceof Error ? err.message : String(err),
      );
    }
  }
  // ─── end experiment hint ───

  state.lastRunAt = new Date().toISOString();
  state.runCount++;
  saveState(state);

  console.log(
    `\n📊 Run complete — published ${report.published}, rejected ${report.rejected}, ` +
      `blocked ${report.blocked}, failed ${report.failed}, deduped ${report.deduped}`,
  );
  return report;
}
