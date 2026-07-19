/**
 * Learning loop — turns recorded post outcomes into forecaster guidance.
 *
 * The Monitor agent appends {@link TopicOutcome} lines to
 * `${config.dataDir}outcomes.jsonl`: per-post metrics joined to the forecast
 * context that produced the post (domains, stage, recommendation). This module
 * aggregates that history into a COMPACT natural-language summary meant to be
 * injected verbatim into the forecaster's prompt, so past performance biases
 * future topic ranking.
 *
 * `summarizeOutcomes` is pure (array in → string out) so it can be unit-tested
 * without touching the filesystem; `getLearningSummary` is the thin I/O
 * wrapper the orchestrator wires into the forecaster.
 */

import { readFile } from 'node:fs/promises';
import { config } from './config.js';
import type { TopicOutcome } from './agents/monitor.js';

/** Returned when there is nothing recorded to learn from yet. */
export const NO_HISTORY_SUMMARY =
  'No performance history yet — no recorded post outcomes to learn from.';

// ────────────────────────────────────────────────────────────────────────────
// Pure aggregation
// ────────────────────────────────────────────────────────────────────────────

interface SegmentStat {
  key: string;
  avgViews: number;
  posts: number;
}

/**
 * Average views per post grouped by the key(s) `keysOf` extracts from each
 * record, ranked best-first. A record may contribute to several keys (a post
 * can belong to multiple domains). Ties break alphabetically so the output is
 * deterministic.
 */
function rankByAvgViews(
  records: readonly TopicOutcome[],
  keysOf: (r: TopicOutcome) => readonly string[],
): SegmentStat[] {
  const acc = new Map<string, { views: number; posts: number }>();
  for (const r of records) {
    for (const key of keysOf(r)) {
      const cur = acc.get(key) ?? { views: 0, posts: 0 };
      cur.views += r.views;
      cur.posts += 1;
      acc.set(key, cur);
    }
  }
  return [...acc.entries()]
    .map(([key, v]) => ({ key, avgViews: Math.round(v.views / v.posts), posts: v.posts }))
    .sort((a, b) => b.avgViews - a.avgViews || a.key.localeCompare(b.key));
}

/** Compact view-count formatting: 8236 → "8.2k", 950 → "950". */
function fmt(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(n);
}

/** "'science' 8.2k > 'lifestyle' 420" — best-first ranking of one dimension. */
function describe(ranked: readonly SegmentStat[]): string {
  return ranked.map((s) => `'${s.key}' ${fmt(s.avgViews)}`).join(' > ');
}

/**
 * Aggregate outcome records into a compact prompt-ready summary: average views
 * per post by domain, by stage, and by recommendation (each ranked best-first),
 * plus a one-line takeaway naming the leading and lagging segments.
 *
 * Pure: no I/O, deterministic for a given input. Returns
 * {@link NO_HISTORY_SUMMARY} for an empty array.
 */
export function summarizeOutcomes(records: readonly TopicOutcome[]): string {
  if (records.length === 0) return NO_HISTORY_SUMMARY;

  const domains = rankByAvgViews(records, (r) => r.domains);
  const stages = rankByAvgViews(records, (r) => [r.stage]);
  const recs = rankByAvgViews(records, (r) => [r.recommendation]);

  const parts = [
    `Historical performance (${records.length} recorded posts, avg views/post):`,
    `by domain — ${describe(domains)};`,
    `by stage — ${describe(stages)};`,
    `by recommendation — ${describe(recs)}.`,
  ];

  const bestDomain = domains[0];
  const worstDomain = domains.length > 1 ? domains[domains.length - 1] : undefined;
  const bestStage = stages[0];
  if (bestDomain && bestStage) {
    let takeaway = `Favor '${bestDomain.key}' topics at the '${bestStage.key}' stage`;
    if (worstDomain && worstDomain.key !== bestDomain.key) {
      takeaway += `; '${worstDomain.key}' has underperformed`;
    }
    parts.push(takeaway + '.');
  }

  return parts.join(' ');
}

// ────────────────────────────────────────────────────────────────────────────
// I/O wrapper
// ────────────────────────────────────────────────────────────────────────────

/** Minimal shape check so a corrupt/foreign line can't poison the aggregate. */
function isTopicOutcome(v: unknown): v is TopicOutcome {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.views === 'number' &&
    Number.isFinite(r.views) &&
    typeof r.stage === 'string' &&
    typeof r.recommendation === 'string' &&
    Array.isArray(r.domains) &&
    r.domains.every((d) => typeof d === 'string')
  );
}

/**
 * Read `${config.dataDir}outcomes.jsonl` and summarize it for the forecaster's
 * prompt. Missing file, empty file, or all-malformed lines all yield the
 * "no history" string — the learning loop degrades gracefully to a cold start.
 */
export async function getLearningSummary(): Promise<string> {
  let raw: string;
  try {
    raw = await readFile(`${config.dataDir}outcomes.jsonl`, 'utf8');
  } catch {
    return NO_HISTORY_SUMMARY;
  }

  const records: TopicOutcome[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (isTopicOutcome(parsed)) records.push(parsed);
    } catch {
      /* skip malformed line */
    }
  }

  return summarizeOutcomes(records);
}
