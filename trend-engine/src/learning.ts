import { readFile } from 'node:fs/promises';

import type { TopicOutcome } from './agents/monitor.js';
import { config } from './config.js';
import type { ClipDraft, ContentFeatures, Platform } from './types.js';

export const NO_HISTORY_SUMMARY =
  'No performance history yet — no recorded post outcomes to learn from.';
export const RECENCY_WINDOW = 500;

const DEFAULT_HALF_LIFE_DAYS = 21;
const MIN_FEATURE_SAMPLES = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const FEATURE_DIMENSIONS = [
  'angleType',
  'hookStyle',
  'tier',
  'syntheticMedia',
  'voice',
  'platform',
  'postHourLocal',
] as const;

export type FeatureDimension = (typeof FEATURE_DIMENSIONS)[number];
export type FeatureValue = string | boolean | null;

export interface FeatureAggregateBucket {
  value: FeatureValue;
  n: number;
  score: number;
}

export interface FeatureAggregates {
  halfLifeDays: number;
  dimensions: Record<FeatureDimension, FeatureAggregateBucket[]>;
  insufficient: Record<FeatureDimension, FeatureAggregateBucket[]>;
}

interface RankedAverage {
  key: string;
  avgViews: number;
  posts: number;
}

interface ScoredFeatureBucket extends FeatureAggregateBucket {
  dimension: FeatureDimension;
}

interface WeightedBucket {
  value: FeatureValue;
  n: number;
  weightedPercentiles: number;
  totalWeight: number;
  percentiles: number;
}

/**
 * Angle rules are evaluated in this fixed order against topicAngle + caption:
 * reaction terms (react/response/duet/stitch), numbered/list terms, explicit
 * first-person opinion terms, then explain/how/why/guide/tutorial terms.
 */
const ANGLE_RULES: ReadonlyArray<readonly [
  ContentFeatures['angleType'],
  RegExp,
]> = [
  ['reaction', /\b(?:react(?:ion|ing|s|ed)?|respond(?:ing|s|ed)?|response|duet|stitch)\b/i],
  [
    'listicle',
    /(?:\b(?:top|best)\s+\d+\b|\b\d+\s+(?:ways|things|reasons|tips|facts|steps|mistakes|examples)\b|\b(?:listicle|rank(?:ed|ing)?)\b)/i,
  ],
  [
    'original-take',
    /(?:\b(?:my|our)\s+(?:take|view|opinion|perspective)\b|\b(?:hot|original)\s+take\b|\b(?:i|we)\s+(?:think|believe|argue)\b)/i,
  ],
  [
    'explainer',
    /\b(?:explain(?:er|ed|ing|s)?|how|why|what\s+is|guide|breakdown|tutorial|learn)\b/i,
  ],
];

export function deriveContentFeatures(input: {
  draft: ClipDraft;
  tier?: string | null;
  topicAngle?: string;
}): Omit<ContentFeatures, 'platform' | 'postHourLocal'> {
  const classificationText = [input.topicAngle, input.draft.caption]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join(' ');
  const angleType = ANGLE_RULES.find(([, pattern]) => pattern.test(classificationText))?.[0]
    ?? 'other';
  const syntheticMedia = input.draft.syntheticMedia ?? false;

  return {
    angleType,
    hookStyle: input.draft.structure?.hookType ?? 'unknown',
    durationSec: null,
    tier: input.tier ?? null,
    syntheticMedia,
    voice: syntheticMedia ? (process.env.TTS_VOICE?.trim() || 'system-default') : 'none',
  };
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

function learningHalfLifeDays(): number {
  const configured = Number(process.env.LEARNING_HALFLIFE_DAYS);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_HALF_LIFE_DAYS;
}

function emptyDimensions(): Record<FeatureDimension, FeatureAggregateBucket[]> {
  return {
    angleType: [],
    hookStyle: [],
    tier: [],
    syntheticMedia: [],
    voice: [],
    platform: [],
    postHourLocal: [],
  };
}

function daypart(hour: number): string | null {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (hour <= 5) return 'night';
  if (hour <= 11) return 'morning';
  if (hour <= 17) return 'afternoon';
  return 'evening';
}

function dimensionValue(
  features: ContentFeatures,
  dimension: FeatureDimension,
): FeatureValue | undefined {
  switch (dimension) {
    case 'angleType':
    case 'hookStyle':
    case 'voice':
    case 'platform':
      return features[dimension];
    case 'tier':
      return features.tier;
    case 'syntheticMedia':
      return features.syntheticMedia;
    case 'postHourLocal':
      return daypart(features.postHourLocal) ?? undefined;
  }
}

function featureValueKey(value: FeatureValue): string {
  return `${typeof value}:${String(value)}`;
}

function platformPercentiles(records: readonly TopicOutcome[]): number[] {
  const percentiles = Array.from({ length: records.length }, () => 0);
  const byPlatform = new Map<Platform, Array<{ index: number; views: number }>>();

  records.forEach((record, index) => {
    const platformRecords = byPlatform.get(record.platform) ?? [];
    platformRecords.push({ index, views: record.views });
    byPlatform.set(record.platform, platformRecords);
  });

  for (const platformRecords of byPlatform.values()) {
    platformRecords.sort((a, b) => a.views - b.views || a.index - b.index);
    for (let start = 0; start < platformRecords.length;) {
      let end = start + 1;
      while (
        end < platformRecords.length &&
        platformRecords[end]?.views === platformRecords[start]?.views
      ) end += 1;

      // Ties share their average one-based rank so input order cannot affect a score.
      const rank = (start + 1 + end) / 2;
      const percentile = ((rank - 0.5) / platformRecords.length) * 100;
      for (let index = start; index < end; index += 1) {
        percentiles[platformRecords[index]!.index] = percentile;
      }
      start = end;
    }
  }

  return percentiles;
}

export function aggregateOutcomeFeatures(
  records: readonly TopicOutcome[],
  now = new Date(),
): FeatureAggregates {
  const halfLifeDays = learningHalfLifeDays();
  const dimensions = emptyDimensions();
  const insufficient = emptyDimensions();
  const accumulators = new Map<FeatureDimension, Map<string, WeightedBucket>>(
    FEATURE_DIMENSIONS.map((dimension) => [dimension, new Map()]),
  );
  const percentiles = platformPercentiles(records);
  const nowMs = now.getTime();

  records.forEach((record, recordIndex) => {
    const features = record.contentFeatures;
    if (!features) return;

    const capturedAtMs = Date.parse(record.capturedAt);
    const ageDays = Number.isFinite(capturedAtMs) && Number.isFinite(nowMs)
      ? Math.max(0, (nowMs - capturedAtMs) / MS_PER_DAY)
      : 0;
    const weight = 0.5 ** (ageDays / halfLifeDays);
    const percentile = percentiles[recordIndex] ?? 0;

    for (const dimension of FEATURE_DIMENSIONS) {
      const value = dimensionValue(features, dimension);
      if (value === undefined) continue;
      const buckets = accumulators.get(dimension)!;
      const key = featureValueKey(value);
      const bucket = buckets.get(key) ?? {
        value,
        n: 0,
        weightedPercentiles: 0,
        totalWeight: 0,
        percentiles: 0,
      };
      bucket.n += 1;
      bucket.weightedPercentiles += percentile * weight;
      bucket.totalWeight += weight;
      bucket.percentiles += percentile;
      buckets.set(key, bucket);
    }
  });

  for (const dimension of FEATURE_DIMENSIONS) {
    const buckets = [...accumulators.get(dimension)!.values()]
      .map((bucket): FeatureAggregateBucket => ({
        value: bucket.value,
        n: bucket.n,
        score: bucket.totalWeight > 0
          ? bucket.weightedPercentiles / bucket.totalWeight
          : bucket.percentiles / bucket.n,
      }))
      .sort((a, b) => b.score - a.score || String(a.value).localeCompare(String(b.value)));
    dimensions[dimension] = buckets;
    insufficient[dimension] = buckets.filter((bucket) => bucket.n < MIN_FEATURE_SAMPLES);
  }

  return { halfLifeDays, dimensions, insufficient };
}

function renderFeatureBucket(bucket: ScoredFeatureBucket): string {
  const value = bucket.value === null ? 'unknown' : String(bucket.value);
  return `${bucket.dimension}=${value} P${Math.round(bucket.score)} (n=${bucket.n})`;
}

function renderFeatureSummary(records: readonly TopicOutcome[]): string {
  if (!records.some((record) => record.contentFeatures !== undefined)) return '';

  const aggregates = aggregateOutcomeFeatures(records);
  const eligible = FEATURE_DIMENSIONS.flatMap((dimension) =>
    aggregates.dimensions[dimension]
      .filter((bucket) => bucket.n >= MIN_FEATURE_SAMPLES)
      .map((bucket) => ({ ...bucket, dimension })),
  ).sort((a, b) =>
    b.score - a.score ||
    FEATURE_DIMENSIONS.indexOf(a.dimension) - FEATURE_DIMENSIONS.indexOf(b.dimension) ||
    String(a.value).localeCompare(String(b.value)),
  );

  const bestCount = eligible.length >= 3 ? 2 : Math.min(1, eligible.length);
  const best = eligible.slice(0, bestCount);
  const bestKeys = new Set(best.map((bucket) =>
    `${bucket.dimension}:${featureValueKey(bucket.value)}`,
  ));
  const worst = [...eligible]
    .reverse()
    .find((bucket) => !bestKeys.has(`${bucket.dimension}:${featureValueKey(bucket.value)}`));
  const ranked = best.length > 0
    ? `best — ${best.map(renderFeatureBucket).join(', ')}` +
      (worst ? `; worst — ${renderFeatureBucket(worst)}` : '')
    : 'insufficient data for ranked features';
  const insufficientDimensions = FEATURE_DIMENSIONS.filter(
    (dimension) => aggregates.insufficient[dimension].length > 0,
  );
  const insufficientText = insufficientDimensions.length > 0
    ? ` Insufficient data: ${insufficientDimensions.join(', ')}.`
    : '';

  return (
    ` Content features (platform-normalized, ${aggregates.halfLifeDays}d half-life): ` +
    `${ranked}.${insufficientText}`
  );
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

  const legacySummary = (
    `Historical performance (${records.length} recorded posts, ${compactViews(avgViews)} avg views/post): ` +
    `by domain — ${renderRanking(domains)}; by stage — ${renderRanking(stages)}; ` +
    `by recommendation — ${renderRanking(recommendations)}. ` +
    `Favor '${bestDomain}' topics at the '${bestStage}' stage${underperformed}.`
  );
  return legacySummary + renderFeatureSummary(records);
}

function isContentFeatures(value: unknown): value is ContentFeatures {
  if (!value || typeof value !== 'object') return false;
  const features = value as Partial<ContentFeatures>;
  return (
    typeof features.angleType === 'string' &&
    typeof features.hookStyle === 'string' &&
    (features.durationSec === null ||
      (typeof features.durationSec === 'number' && Number.isFinite(features.durationSec))) &&
    (features.tier === null || typeof features.tier === 'string') &&
    typeof features.syntheticMedia === 'boolean' &&
    typeof features.voice === 'string' &&
    typeof features.postHourLocal === 'number' &&
    Number.isInteger(features.postHourLocal) &&
    features.postHourLocal >= 0 &&
    features.postHourLocal <= 23 &&
    (features.platform === 'tiktok' ||
      features.platform === 'youtube-shorts' ||
      features.platform === 'instagram-reels' ||
      features.platform === 'x')
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
    typeof record.opportunityScore === 'number' &&
    (record.contentFeatures === undefined || isContentFeatures(record.contentFeatures))
  );
}

export async function getLearningSummary(): Promise<string> {
  let raw: string;
  try {
    raw = await readFile(`${config.dataDir}outcomes.jsonl`, 'utf8');
  } catch {
    return NO_HISTORY_SUMMARY;
  }

  // Repeated stat refreshes append a new snapshot of the same post; the
  // latest row per (platform, postId) wins so one post never counts twice.
  const latestByPost = new Map<string, TopicOutcome>();
  const lines = raw.split(/\r?\n/).filter((line) => line.trim()).slice(-RECENCY_WINDOW);
  for (const line of lines) {
    try {
      const parsed: unknown = JSON.parse(line);
      if (
        isTopicOutcome(parsed) &&
        !parsed.postId.startsWith('dryrun-') &&
        !(parsed.views === 0 && parsed.likes === 0 && parsed.comments === 0 && parsed.shares === 0)
      ) {
        const key = `${parsed.platform} ${parsed.postId}`;
        latestByPost.delete(key);
        latestByPost.set(key, parsed);
      }
    } catch {
      // Corrupt and foreign lines are ignored independently.
    }
  }
  return summarizeOutcomes([...latestByPost.values()]);
}
