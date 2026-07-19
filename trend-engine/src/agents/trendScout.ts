/**
 * Trend Forecaster — the crown jewel (rebuilt to be predictive, not reactive).
 *
 * The old version ranked what was already loud. That's a trap: by the time a
 * topic is peaking (the World Cup is *here*), the feed is flooded and you've
 * missed the window. This version fuses two inputs —
 *   • reactive signals  (Reddit / Trends / YouTube / HN — what's rising now)
 *   • upcoming catalysts (scheduled events — what's coming in 2–8 weeks)
 * — and asks Fable to place each topic on its hype curve and tell us WHEN to
 * post. It actively down-ranks `peaking`/`saturated` and surfaces `emerging`/
 * `rising` topics with real lead time and an explicit posting window.
 */

import { config } from '../config.js';
import { getLearningSummary } from '../learning.js';
import { structured } from '../llm.js';
import { collectSignals } from '../sources/index.js';
import { collectUpcoming } from '../sources/upcoming.js';
import { readMetrics, summarizePerformance } from './monitor.js';
import type { SignalSource, Topic, TrendSignal, UpcomingCatalyst } from '../types.js';

const SYSTEM = `You are a trend FORECASTER for a short-form video studio. Your edge is
timing: you help post AHEAD of a wave, never into a saturated one.

You are given (a) reactive signals showing what is loud right now and (b) upcoming
catalysts — scheduled future events. Fuse them. For each distinct topic, place it on
its hype curve and decide what to do:

stage:
  emerging   — early signals / a catalyst is weeks out. Best money is here.
  rising     — climbing fast, window still open. Post now.
  peaking    — at maximum attention right now. Feed is flooded; usually too late.
  saturated  — everyone has already posted it. Skip.
  declining  — attention falling. Skip unless evergreen.

leadTimeDays: days until predicted peak. Negative means it already peaked.
postWindow:   concrete guidance, e.g. "post 3–7 days before the final".
catalyst:     the upcoming event driving it, or null.
recommendation: post-now | prepare | watch | skip-saturated.
opportunityScore (0–100): reward good lead time + momentum + longevity + low
  saturation. Heavily penalize peaking/saturated topics — a peaked topic is a
  BAD opportunity no matter how loud it is.

Rules:
- Do NOT recommend posting into a saturated/peaked topic just because it is loud.
  (Example: if a tournament is already underway, that content is saturated —
  skip it, or find the emerging sub-angle that is NOT yet flooded.)
- Prefer topics where we can be early: a catalyst 1–4 weeks out with rising but
  not-yet-flooded interest is ideal.
- Favor defensible angles (explainer / original take) over "repost the clip".
- Do not invent signals or events that were not provided.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    topics: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          summary: { type: 'string' },
          whyTrending: { type: 'string' },
          momentum: { type: 'string', enum: ['exploding', 'rising', 'steady', 'fading'] },
          longevity: { type: 'string', enum: ['spike', 'sustained', 'evergreen'] },
          stage: {
            type: 'string',
            enum: ['emerging', 'rising', 'peaking', 'saturated', 'declining'],
          },
          leadTimeDays: { type: 'integer' },
          postWindow: { type: 'string' },
          catalyst: { type: ['string', 'null'] },
          recommendation: {
            type: 'string',
            enum: ['post-now', 'prepare', 'watch', 'skip-saturated'],
          },
          domains: { type: 'array', items: { type: 'string' } },
          suggestedAngle: { type: 'string' },
          saturationRisk: { type: 'string', enum: ['low', 'medium', 'high'] },
          opportunityScore: { type: 'integer' },
          contributingSources: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['reddit', 'google-trends', 'youtube', 'hackernews', 'mock'],
            },
          },
        },
        required: [
          'id', 'title', 'summary', 'whyTrending', 'momentum', 'longevity',
          'stage', 'leadTimeDays', 'postWindow', 'catalyst', 'recommendation',
          'domains', 'suggestedAngle', 'saturationRisk', 'opportunityScore',
          'contributingSources',
        ],
      },
    },
  },
  required: ['topics'],
} as const;

function renderSignals(signals: TrendSignal[]): string {
  return signals
    .map(
      (s) =>
        `- [${s.source}] "${s.title}" (score=${s.score}` +
        `${s.velocity != null ? `, velocity=${s.velocity.toFixed(2)}` : ''}` +
        `${s.category ? `, cat=${s.category}` : ''})`,
    )
    .join('\n');
}

function renderCatalysts(catalysts: UpcomingCatalyst[]): string {
  return catalysts
    .map(
      (c) =>
        `- "${c.title}" on ${c.date} (${c.daysUntil >= 0 ? `in ${c.daysUntil}d` : `${-c.daysUntil}d ago`}, ` +
        `${c.category}, confidence=${c.confidence})`,
    )
    .join('\n');
}

/** Recommendations we're willing to act on this run (never publish saturated). */
const ACTIONABLE = new Set(['post-now', 'prepare']);

export interface TrendScoutResult {
  topics: Topic[];
  rawSignalCount: number;
  upcomingCount: number;
  bySource: Partial<Record<SignalSource, number>>;
  /** Forecasts we chose NOT to act on, with the reason — kept for transparency. */
  skipped: Array<Pick<Topic, 'title' | 'stage' | 'recommendation'>>;
}

export async function discoverTopics(today = new Date().toISOString().slice(0, 10)): Promise<TrendScoutResult> {
  const [signals, upcoming, learning] = await Promise.all([
    collectSignals(),
    collectUpcoming(today),
    getLearningSummary(),
  ]);

  const bySource: Partial<Record<SignalSource, number>> = {};
  for (const s of signals) bySource[s.source] = (bySource[s.source] ?? 0) + 1;

  if (signals.length === 0 && upcoming.length === 0) {
    return { topics: [], rawSignalCount: 0, upcomingCount: 0, bySource, skipped: [] };
  }

  let perf: string | null = null;
  try {
    perf = summarizePerformance(await readMetrics());
  } catch (err) {
    console.warn('[trend-scout] failed to read performance metrics:', err);
    perf = null;
  }

  let user =
    `Today is ${today}. Region: ${config.trendScout.geo}. ` +
    `Return the top ${config.trendScout.topN} forward-looking topics as JSON.\n\n` +
    `HISTORICAL PERFORMANCE (bias toward what has converted before):\n${learning}\n\n` +
    `REACTIVE SIGNALS (loud now):\n${renderSignals(signals) || '(none)'}\n\n` +
    `UPCOMING CATALYSTS (coming soon):\n${renderCatalysts(upcoming) || '(none)'}`;
  if (perf) {
    user +=
      `\n\nPAST PERFORMANCE (our own live posts — weight domains/angles that actually earned views):\n` +
      perf;
  }

  const { topics } = await structured<{ topics: Topic[] }>({
    system: SYSTEM,
    user,
    schema: SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 12000,
  });

  // Split actionable from skipped, then rank the actionable set. Sorting keys:
  // opportunity first, then shorter (but non-negative) lead time as a tiebreak
  // so imminent-but-not-yet-peaked topics win.
  const actionable = topics
    .filter((t) => ACTIONABLE.has(t.recommendation))
    .sort((a, b) => b.opportunityScore - a.opportunityScore || a.leadTimeDays - b.leadTimeDays)
    .slice(0, config.trendScout.topN);

  const skipped = topics
    .filter((t) => !ACTIONABLE.has(t.recommendation))
    .map((t) => ({ title: t.title, stage: t.stage, recommendation: t.recommendation }));

  return {
    topics: actionable,
    rawSignalCount: signals.length,
    upcomingCount: upcoming.length,
    bySource,
    skipped,
  };
}
