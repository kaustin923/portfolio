/**
 * Trend Scout — the crown jewel.
 *
 * Pulls raw signals from many free sources, then uses Claude to cluster and
 * rank them into a handful of high-opportunity Topics. This is the piece that
 * would have told you "World Cup content is about to boom" — and it is 100%
 * legal regardless of what the downstream sourcing model ends up being.
 *
 * Output is a ranked, de-duplicated, scored Topic[] — structured JSON we can
 * hand straight to the Sourcing agent.
 */

import { config } from '../config.js';
import { structured } from '../llm.js';
import { collectSignals } from '../sources/index.js';
import type { SignalSource, Topic, TrendSignal } from '../types.js';

const SYSTEM = `You are a trend analyst for a short-form video studio.
You are given raw trending signals from Reddit, Google Trends, YouTube, and Hacker News.
Your job: cluster signals that are about the same underlying story, then rank the
clusters by how good a *content opportunity* each is for short-form video.

For each topic, judge:
- momentum: exploding | rising | steady | fading
- longevity: spike (dies in days) | sustained (weeks) | evergreen (always relevant)
- domains: which verticals fit — e.g. educational, sports, news-explainer, science, finance, lifestyle
- suggestedAngle: a concrete, defensible angle we could actually produce (favor
  explainer / commentary / original-take angles over "just reposting the clip")
- saturationRisk: how crowded the topic already is (low | medium | high)
- opportunityScore: 0–100 combining momentum, longevity, fit, and low saturation

Be decisive and specific. Prefer topics with real staying power or a clear
educational/explainer angle over fleeting drama. Do not invent signals that
were not provided.`;

/** JSON Schema kept to the structured-output-safe subset (types + enums only). */
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
          'id',
          'title',
          'summary',
          'whyTrending',
          'momentum',
          'longevity',
          'domains',
          'suggestedAngle',
          'saturationRisk',
          'opportunityScore',
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
        `- [${s.source}] "${s.title}" (score=${s.score}${
          s.velocity != null ? `, velocity=${s.velocity.toFixed(2)}` : ''
        }${s.category ? `, cat=${s.category}` : ''})`,
    )
    .join('\n');
}

export interface TrendScoutResult {
  topics: Topic[];
  rawSignalCount: number;
  bySource: Partial<Record<SignalSource, number>>;
}

export async function discoverTopics(): Promise<TrendScoutResult> {
  const signals = await collectSignals();

  const bySource: Partial<Record<SignalSource, number>> = {};
  for (const s of signals) bySource[s.source] = (bySource[s.source] ?? 0) + 1;

  if (signals.length === 0) {
    return { topics: [], rawSignalCount: 0, bySource };
  }

  const { topics } = await structured<{ topics: Topic[] }>({
    system: SYSTEM,
    user: `Region: ${config.trendScout.geo}. Return the top ${config.trendScout.topN} topics as JSON.

Raw signals:
${renderSignals(signals)}`,
    schema: SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 8000,
  });

  const ranked = topics
    .sort((a, b) => b.opportunityScore - a.opportunityScore)
    .slice(0, config.trendScout.topN);

  return { topics: ranked, rawSignalCount: signals.length, bySource };
}
