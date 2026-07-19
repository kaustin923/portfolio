import { readFile } from 'node:fs/promises';

import type { TopicOutcome } from './agents/monitor.js';
import { config } from './config.js';

export const NO_HISTORY_SUMMARY =
  'No performance history yet — no recorded post outcomes to learn from.';
export const RECENCY_WINDOW = 500;

interface RankedAverage {
  key: string;
  avgViews: number;
  posts: number;
}

function rankByAvgViews(
  records: readonly TopicOutcome[],
  keysOf: (record: TopicOutcome) => readonly string[],
): RankedAverage[] {
  const aggregates = new Map<string, { views: number; posts: number }>();
  for (const record of records) {
    for (const key of keysOf(record)) {
      const aggregate = aggregates.get(key) ?? { views: 0, posts: 0 };
      aggregate.views += record.views;
      aggregate.posts += 1;
      aggregates.set(key, aggregate);
    }
  }

  return [...aggregates].map(([key, aggregate]) => ({
    key,
    avgViews: Math.round(aggregate.views / aggregate.posts),
    posts: aggregate.posts,
  })).sort((a, b) => b.avgViews - a.avgViews || a.key.localeCompare(b.key));
}

function compactViews(value: number): string {
  return value >= 1000
    ? `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`
    : String(value);
}

function renderRanking(ranking: readonly RankedAverage[]): string {
  return ranking.map((item) => `'${item.key}' ${compactViews(item.avgViews)}`).join(' > ');
}

export function summarizeOutcomes(records: readonly TopicOutcome[]): string {
  if (records.length === 0) return NO_HISTORY_SUMMARY;

  const domains = rankByAvgViews(records, (record) => record.domains);
  const stages = rankByAvgViews(records, (record) => [record.stage]);
  const recommendations = rankByAvgViews(records, (record) => [record.recommendation]);
  const avgViews = Math.round(
    records.reduce((total, record) => total + record.views, 0) / records.length,
  );
  const bestDomain = domains[0]?.key ?? 'unclassified';
  const bestStage = stages[0]?.key ?? 'unclassified';
  const worstDomain = domains.at(-1)?.key;
  const underperformed =
    domains.length >= 2 && worstDomain && worstDomain !== bestDomain
      ? `; '${worstDomain}' has underperformed`
      : '';

  return (
    `Historical performance (${records.length} recorded posts, ${compactViews(avgViews)} avg views/post): ` +
    `by domain — ${renderRanking(domains)}; by stage — ${renderRanking(stages)}; ` +
    `by recommendation — ${renderRanking(recommendations)}. ` +
    `Favor '${bestDomain}' topics at the '${bestStage}' stage${underperformed}.`
  );
}

function isTopicOutcome(value: unknown): value is TopicOutcome {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<TopicOutcome>;
  return (
    typeof record.postId === 'string' &&
    typeof record.platform === 'string' &&
    typeof record.views === 'number' &&
    Number.isFinite(record.views) &&
    typeof record.likes === 'number' &&
    typeof record.comments === 'number' &&
    typeof record.shares === 'number' &&
    typeof record.capturedAt === 'string' &&
    typeof record.topicId === 'string' &&
    typeof record.topicTitle === 'string' &&
    Array.isArray(record.domains) &&
    record.domains.every((domain) => typeof domain === 'string') &&
    typeof record.stage === 'string' &&
    typeof record.recommendation === 'string' &&
    typeof record.opportunityScore === 'number'
  );
}

export async function getLearningSummary(): Promise<string> {
  let raw: string;
  try {
    raw = await readFile(`${config.dataDir}outcomes.jsonl`, 'utf8');
  } catch {
    return NO_HISTORY_SUMMARY;
  }

  const records: TopicOutcome[] = [];
  const lines = raw.split(/\r?\n/).filter((line) => line.trim()).slice(-RECENCY_WINDOW);
  for (const line of lines) {
    try {
      const parsed: unknown = JSON.parse(line);
      if (isTopicOutcome(parsed) && !parsed.postId.startsWith('dryrun-')) records.push(parsed);
    } catch {
      // Corrupt and foreign lines are ignored independently.
    }
  }
  return summarizeOutcomes(records);
}
