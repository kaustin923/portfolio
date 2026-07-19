/**
 * Evaluation report CLI.
 *
 *   npm run report
 *
 * Renders the learning loop's current picture from local data only. Every
 * section degrades gracefully on a cold start, and nothing here touches the
 * network — safe under DRY_RUN.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { TopicOutcome } from './agents/monitor.js';
import {
  computeCalibration,
  readForecasts,
  type CalibrationBucket,
  type CalibrationResult,
  type ForecastRecord,
} from './calibration.js';
import { config, modeBanner } from './config.js';
import {
  aggregateOutcomeFeatures,
  RECENCY_WINDOW,
  type FeatureAggregateBucket,
  type FeatureDimension,
} from './learning.js';
import { readManualPosts } from './manualPosts.js';
import type { ContentFeatures } from './types.js';
import {
  EXPERIMENT_VALUE_POOLS,
  planNextExperiment,
  readExperiments,
  type ExperimentPlan,
} from './variation.js';

const COLD_START_THRESHOLD = 8;
const MIN_FEATURE_SAMPLES = 3;
const FEATURE_DIMENSIONS: readonly FeatureDimension[] = [
  'angleType',
  'hookStyle',
  'tier',
  'syntheticMedia',
  'voice',
  'platform',
  'postHourLocal',
];

export interface FeatureDimensionReport {
  dimension: FeatureDimension;
  best: FeatureAggregateBucket | null;
  worst: FeatureAggregateBucket | null;
  insufficientData: boolean;
}

export interface PlatformPerformance {
  platform: string;
  posts: number;
  totalViews: number;
  averageViews: number;
  meanPlatformPercentile: number;
}

export interface HitRate {
  hits: number;
  total: number;
  rate: number | null;
}

export interface ForecastHitRateReport {
  coldStart: boolean;
  joinedCount: number;
  summary: string;
  overall: HitRate | null;
  opportunity70Plus: HitRate | null;
  byRecommendation: {
    'post-now': HitRate | null;
    prepare: HitRate | null;
  };
}

export interface ManualPostCoverage {
  kitsWritten: number;
  postsRegistered: number;
  coverage: number | null;
  summary: string;
}

export interface ExperimentReport {
  lastRecorded: ExperimentPlan | null;
  nextSuggestion: ExperimentPlan;
  counts: {
    hookStyle: Record<string, number>;
    angleType: Record<string, number>;
  };
}

export interface EvalReport {
  calibration: CalibrationResult & {
    coldStart: boolean;
    coldStartLine: string | null;
  };
  features: {
    halfLifeDays: number;
    coldStart: boolean;
    summary: string;
    dimensions: FeatureDimensionReport[];
    insufficientDataDimensions: FeatureDimension[];
  };
  platformPerformance: PlatformPerformance[];
  platformSummary: string;
  forecastHitRate: ForecastHitRateReport;
  manualPostCoverage: ManualPostCoverage;
  recommendations: [string, string, string];
  experiment: ExperimentReport;
}

interface JoinedPair {
  forecast: ForecastRecord;
  realizedPercentile: number;
}

function isContentFeatures(value: unknown): value is ContentFeatures {
  if (value === null || typeof value !== 'object') return false;
  const features = value as Partial<ContentFeatures>;
  return (
    typeof features.angleType === 'string' &&
    typeof features.hookStyle === 'string' &&
    (features.durationSec === null || typeof features.durationSec === 'number') &&
    (features.tier === null || typeof features.tier === 'string') &&
    typeof features.syntheticMedia === 'boolean' &&
    typeof features.voice === 'string' &&
    Number.isInteger(features.postHourLocal) &&
    typeof features.platform === 'string'
  );
}

function isTopicOutcome(value: unknown): value is TopicOutcome {
  if (value === null || typeof value !== 'object') return false;
  const outcome = value as Partial<TopicOutcome>;
  return (
    typeof outcome.postId === 'string' &&
    typeof outcome.platform === 'string' &&
    typeof outcome.views === 'number' &&
    Number.isFinite(outcome.views) &&
    typeof outcome.likes === 'number' &&
    typeof outcome.comments === 'number' &&
    typeof outcome.shares === 'number' &&
    typeof outcome.capturedAt === 'string' &&
    typeof outcome.topicId === 'string' &&
    typeof outcome.topicTitle === 'string' &&
    Array.isArray(outcome.domains) &&
    outcome.domains.every((domain) => typeof domain === 'string') &&
    typeof outcome.stage === 'string' &&
    typeof outcome.recommendation === 'string' &&
    typeof outcome.opportunityScore === 'number' &&
    (outcome.contentFeatures === undefined || isContentFeatures(outcome.contentFeatures))
  );
}

function filterOutcomes(lines: readonly string[]): TopicOutcome[] {
  const latestByPost = new Map<string, TopicOutcome>();
  for (const line of lines) {
    try {
      const parsed: unknown = JSON.parse(line);
      if (
        isTopicOutcome(parsed) &&
        !parsed.postId.startsWith('dryrun-') &&
        !(parsed.views === 0 && parsed.likes === 0 && parsed.comments === 0 && parsed.shares === 0)
      ) {
        const key = `${parsed.platform}\u0000${parsed.postId}`;
        latestByPost.delete(key);
        latestByPost.set(key, parsed);
      }
    } catch {
      // Corrupt and foreign JSONL records are isolated from valid history.
    }
  }
  return [...latestByPost.values()];
}

async function readOutcomeSets(): Promise<{
  all: TopicOutcome[];
  learning: TopicOutcome[];
}> {
  try {
    const raw = await readFile(join(config.dataDir, 'outcomes.jsonl'), 'utf8');
    const lines = raw.split(/\r?\n/).filter((line) => line.trim());
    return {
      all: filterOutcomes(lines),
      learning: filterOutcomes(lines.slice(-RECENCY_WINDOW)),
    };
  } catch {
    return { all: [], learning: [] };
  }
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function outcomePercentiles(outcomes: readonly TopicOutcome[]): Map<TopicOutcome, number> {
  const byPlatform = new Map<string, TopicOutcome[]>();
  for (const outcome of outcomes) {
    const records = byPlatform.get(outcome.platform) ?? [];
    records.push(outcome);
    byPlatform.set(outcome.platform, records);
  }

  const percentiles = new Map<TopicOutcome, number>();
  for (const records of byPlatform.values()) {
    const sorted = [...records].sort(
      (left, right) => left.views - right.views || left.postId.localeCompare(right.postId),
    );
    for (let start = 0; start < sorted.length;) {
      let end = start + 1;
      while (end < sorted.length && sorted[end]!.views === sorted[start]!.views) end += 1;
      const averageRank = ((start + 1) + end) / 2;
      const percentile = ((averageRank - 0.5) / sorted.length) * 100;
      for (let index = start; index < end; index += 1) {
        percentiles.set(sorted[index]!, percentile);
      }
      start = end;
    }
  }
  return percentiles;
}

function joinedPairs(
  forecasts: readonly ForecastRecord[],
  outcomes: readonly TopicOutcome[],
): JoinedPair[] {
  const latestForecasts = new Map<string, ForecastRecord>();
  for (const forecast of forecasts) {
    const current = latestForecasts.get(forecast.topicId);
    if (!current || forecast.ts >= current.ts) latestForecasts.set(forecast.topicId, forecast);
  }

  const percentiles = outcomePercentiles(outcomes);
  const realizedByTopic = new Map<string, number[]>();
  for (const outcome of outcomes) {
    const percentile = percentiles.get(outcome);
    if (percentile === undefined) continue;
    const realized = realizedByTopic.get(outcome.topicId) ?? [];
    realized.push(percentile);
    realizedByTopic.set(outcome.topicId, realized);
  }

  return [...latestForecasts]
    .flatMap(([topicId, forecast]): JoinedPair[] => {
      const realized = realizedByTopic.get(topicId);
      return realized?.length
        ? [{ forecast, realizedPercentile: median(realized) }]
        : [];
    })
    .sort((left, right) => left.forecast.topicId.localeCompare(right.forecast.topicId));
}

function hitRate(pairs: readonly JoinedPair[]): HitRate {
  const hits = pairs.filter((pair) => pair.realizedPercentile >= 60).length;
  return { hits, total: pairs.length, rate: pairs.length ? hits / pairs.length : null };
}

function formatRate(rate: HitRate): string {
  return rate.rate === null
    ? `${rate.hits}/${rate.total} (n/a)`
    : `${rate.hits}/${rate.total} (${Math.round(rate.rate * 100)}%)`;
}

function buildHitRateReport(pairs: readonly JoinedPair[]): ForecastHitRateReport {
  if (pairs.length < COLD_START_THRESHOLD) {
    return {
      coldStart: true,
      joinedCount: pairs.length,
      summary:
        `cold start — ${pairs.length} joined forecast→outcome pairs; ` +
        `need ${COLD_START_THRESHOLD} before reporting hit rates`,
      overall: null,
      opportunity70Plus: null,
      byRecommendation: { 'post-now': null, prepare: null },
    };
  }

  const overall = hitRate(pairs);
  const opportunity70Plus = hitRate(
    pairs.filter((pair) => pair.forecast.scores.opportunity >= 70),
  );
  const postNow = hitRate(
    pairs.filter((pair) => pair.forecast.recommendation === 'post-now'),
  );
  const prepare = hitRate(
    pairs.filter((pair) => pair.forecast.recommendation === 'prepare'),
  );
  return {
    coldStart: false,
    joinedCount: pairs.length,
    summary:
      `overall ${formatRate(overall)}; opportunity>=70 ${formatRate(opportunity70Plus)}; ` +
      `post-now ${formatRate(postNow)}; prepare ${formatRate(prepare)}`,
    overall,
    opportunity70Plus,
    byRecommendation: { 'post-now': postNow, prepare },
  };
}

function featureValue(value: FeatureAggregateBucket['value']): string {
  return value === null ? 'unknown' : String(value);
}

function bucketOrder(
  left: FeatureAggregateBucket,
  right: FeatureAggregateBucket,
  descending: boolean,
): number {
  const scoreOrder = descending ? right.score - left.score : left.score - right.score;
  return scoreOrder || featureValue(left.value).localeCompare(featureValue(right.value));
}

function buildFeatureReport(outcomes: readonly TopicOutcome[]): EvalReport['features'] {
  const aggregates = aggregateOutcomeFeatures(outcomes);
  const dimensions = FEATURE_DIMENSIONS.map((dimension): FeatureDimensionReport => {
    const eligible = aggregates.dimensions[dimension]
      .filter((bucket) => bucket.n >= MIN_FEATURE_SAMPLES);
    return {
      dimension,
      best: [...eligible].sort((left, right) => bucketOrder(left, right, true))[0] ?? null,
      worst: [...eligible].sort((left, right) => bucketOrder(left, right, false))[0] ?? null,
      insufficientData: eligible.length === 0,
    };
  });
  const insufficientDataDimensions = dimensions
    .filter((dimension) => dimension.insufficientData)
    .map((dimension) => dimension.dimension);
  const eligibleDimensions = dimensions.length - insufficientDataDimensions.length;
  const coldStart = eligibleDimensions === 0;
  return {
    halfLifeDays: aggregates.halfLifeDays,
    coldStart,
    summary: coldStart
      ? `cold start — 0/${dimensions.length} feature dimensions have a bucket with n>=${MIN_FEATURE_SAMPLES}`
      : `${eligibleDimensions}/${dimensions.length} feature dimensions have ranked buckets; ` +
        `insufficient: ${insufficientDataDimensions.join(', ') || 'none'}`,
    dimensions,
    insufficientDataDimensions,
  };
}

function buildPlatformPerformance(outcomes: readonly TopicOutcome[]): PlatformPerformance[] {
  const percentiles = outcomePercentiles(outcomes);
  const byPlatform = new Map<string, TopicOutcome[]>();
  for (const outcome of outcomes) {
    const records = byPlatform.get(outcome.platform) ?? [];
    records.push(outcome);
    byPlatform.set(outcome.platform, records);
  }
  return [...byPlatform]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([platform, records]) => {
      const totalViews = records.reduce((total, record) => total + record.views, 0);
      return {
        platform,
        posts: records.length,
        totalViews,
        averageViews: totalViews / records.length,
        meanPlatformPercentile:
          records.reduce((total, record) => total + (percentiles.get(record) ?? 0), 0) /
          records.length,
      };
    });
}

async function buildManualPostCoverage(): Promise<ManualPostCoverage> {
  const manualPostsPromise = readManualPosts();
  let kitsWritten = 0;
  try {
    const raw = await readFile(join(config.dataDir, 'provenance.jsonl'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const record = JSON.parse(line) as { kind?: unknown };
        if (record.kind === 'outbox') kitsWritten += 1;
      } catch {
        // A corrupt provenance line does not hide valid outbox records.
      }
    }
  } catch {
    // Missing provenance is a normal cold start.
  }
  const postsRegistered = (await manualPostsPromise).length;
  const coverage = kitsWritten > 0 ? postsRegistered / kitsWritten : null;
  return {
    kitsWritten,
    postsRegistered,
    coverage,
    summary: kitsWritten === 0
      ? `cold start — ${postsRegistered} posts registered from ${kitsWritten} written kits`
      : `${postsRegistered}/${kitsWritten} kits registered (${Math.round(coverage! * 100)}%)`,
  };
}

function buildExperimentReport(
  history: readonly ExperimentPlan[],
  nextSuggestion: ExperimentPlan,
): ExperimentReport {
  const hookStyle = Object.fromEntries(
    EXPERIMENT_VALUE_POOLS.hookStyle.map((value) => [value, 0]),
  );
  const angleType = Object.fromEntries(
    EXPERIMENT_VALUE_POOLS.angleType.map((value) => [value, 0]),
  );
  for (const plan of history) {
    const counts = plan.dimension === 'hookStyle' ? hookStyle : angleType;
    counts[plan.value] = (counts[plan.value] ?? 0) + 1;
  }
  return {
    lastRecorded: history.at(-1) ?? null,
    nextSuggestion,
    counts: { hookStyle, angleType },
  };
}

function globalBucket(
  features: EvalReport['features'],
  side: 'best' | 'worst',
): { dimension: FeatureDimension; bucket: FeatureAggregateBucket } | null {
  const candidates = features.dimensions.flatMap((dimension) =>
    dimension[side] ? [{ dimension: dimension.dimension, bucket: dimension[side] }] : [],
  );
  return candidates.sort((left, right) => {
    const scoreOrder = side === 'best'
      ? right.bucket.score - left.bucket.score
      : left.bucket.score - right.bucket.score;
    return scoreOrder ||
      FEATURE_DIMENSIONS.indexOf(left.dimension) - FEATURE_DIMENSIONS.indexOf(right.dimension) ||
      featureValue(left.bucket.value).localeCompare(featureValue(right.bucket.value));
  })[0] ?? null;
}

/**
 * Recommendation rules, in fixed slot order:
 * 1) schedule the highest-ranked eligible feature at P60+, otherwise report its
 *    measured shortfall or the exact feature cold-start count;
 * 2) prioritize calibration cold start, then avoid the lowest eligible P40-or-
 *    worse feature, otherwise cite the measured overall hit rate; and
 * 3) register manual posts below 50% coverage, otherwise report current coverage.
 * Ties use feature-dimension order above, then lexicographic bucket value.
 */
function buildRecommendations(
  features: EvalReport['features'],
  forecast: ForecastHitRateReport,
  coverage: ManualPostCoverage,
): [string, string, string] {
  const best = globalBucket(features, 'best');
  const worst = globalBucket(features, 'worst');
  const positive = best === null
    ? `feature cold start — 0/${features.dimensions.length} dimensions have an eligible n>=${MIN_FEATURE_SAMPLES} bucket`
    : best.bucket.score >= 60
      ? `${best.dimension}=${featureValue(best.bucket.value)} outperforms ` +
        `(P${Math.round(best.bucket.score)}, n=${best.bucket.n}) — schedule more`
      : `best eligible feature is ${best.dimension}=${featureValue(best.bucket.value)} ` +
        `(P${Math.round(best.bucket.score)}, n=${best.bucket.n}), below the P60 schedule-more rule — collect more outcomes`;

  let calibrationOrNegative: string;
  if (forecast.coldStart) {
    calibrationOrNegative =
      `enter metrics for posted kits to unlock calibration — only ${forecast.joinedCount} ` +
      `joined pairs (need ${COLD_START_THRESHOLD})`;
  } else if (worst && worst.bucket.score <= 40) {
    calibrationOrNegative =
      `avoid ${worst.dimension}=${featureValue(worst.bucket.value)} ` +
      `(P${Math.round(worst.bucket.score)}, n=${worst.bucket.n}) until a controlled retest`;
  } else if (forecast.overall) {
    calibrationOrNegative =
      `forecast hit rate is ${formatRate(forecast.overall)}; no eligible feature crossed the P40 avoid rule`;
  } else {
    calibrationOrNegative =
      `feature avoidance cold start — 0 eligible buckets and ${forecast.joinedCount} joined pairs`;
  }

  const manual = coverage.kitsWritten === 0
    ? `manual tracking cold start — ${coverage.postsRegistered} posts registered from ${coverage.kitsWritten} written kits`
    : coverage.coverage! < 0.5
      ? `register manual posts — only ${coverage.postsRegistered} of ${coverage.kitsWritten} kits tracked ` +
        `(${Math.round(coverage.coverage! * 100)}%)`
      : `manual tracking coverage is ${coverage.postsRegistered} of ${coverage.kitsWritten} kits ` +
        `(${Math.round(coverage.coverage! * 100)}%) — keep registering each kit`;

  return [positive, calibrationOrNegative, manual];
}

export async function buildEvalReport(): Promise<EvalReport> {
  const [{ all, learning }, calibrationResult, forecasts, coverage, experiments, nextExperiment] =
    await Promise.all([
      readOutcomeSets(),
      computeCalibration(),
      readForecasts(),
      buildManualPostCoverage(),
      readExperiments(),
      planNextExperiment(),
    ]);
  const features = buildFeatureReport(learning);
  const platformPerformance = buildPlatformPerformance(all);
  const forecastHitRate = buildHitRateReport(joinedPairs(forecasts, all));
  const calibrationColdStart = calibrationResult.joinedCount < COLD_START_THRESHOLD;
  const manualPostCoverage = coverage;
  return {
    calibration: {
      ...calibrationResult,
      coldStart: calibrationColdStart,
      coldStartLine: calibrationColdStart ? calibrationResult.summary : null,
    },
    features,
    platformPerformance,
    platformSummary: platformPerformance.length === 0
      ? 'cold start — 0 live outcome rows recorded'
      : `${platformPerformance.reduce((total, platform) => total + platform.posts, 0)} posts across ` +
        `${platformPerformance.length} platforms`,
    forecastHitRate,
    manualPostCoverage,
    recommendations: buildRecommendations(features, forecastHitRate, manualPostCoverage),
    experiment: buildExperimentReport(experiments, nextExperiment),
  };
}

function calibrationTable(buckets: readonly CalibrationBucket[]): Array<Record<string, unknown>> {
  return buckets.map((bucket) => ({
    decile: bucket.decile,
    n: bucket.n,
    medianRealizedPercentile: bucket.medianRealizedPercentile === null
      ? '—'
      : `P${Math.round(bucket.medianRealizedPercentile)}`,
  }));
}

async function main(): Promise<void> {
  const report = await buildEvalReport();
  const generatedAt = new Date().toISOString();
  const outputPath = join(config.dataDir, 'eval-report.json');
  await mkdir(config.dataDir, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify({ v: 1, generatedAt, ...report }, null, 2)}\n`);

  console.log(modeBanner());
  console.log(`\n📊 Evaluation report — data dir: ${config.dataDir}\n`);
  console.log('── Forecast calibration ──');
  if (report.calibration.buckets.length) console.table(calibrationTable(report.calibration.buckets));
  console.log(report.calibration.summary);

  console.log('\n── Content features ──');
  console.table(report.features.dimensions.map((dimension) => ({
    dimension: dimension.dimension,
    best: dimension.best
      ? `${featureValue(dimension.best.value)} P${Math.round(dimension.best.score)} n=${dimension.best.n}`
      : 'insufficient data',
    worst: dimension.worst
      ? `${featureValue(dimension.worst.value)} P${Math.round(dimension.worst.score)} n=${dimension.worst.n}`
      : 'insufficient data',
  })));
  console.log(report.features.summary);

  console.log('\n── Platform performance ──');
  if (report.platformPerformance.length) console.table(report.platformPerformance);
  console.log(report.platformSummary);

  console.log('\n── Forecast hit rate ──');
  console.log(report.forecastHitRate.summary);
  console.log('\n── Manual-post coverage ──');
  console.log(report.manualPostCoverage.summary);
  console.log('\n── Recommendations ──');
  report.recommendations.forEach((recommendation, index) => {
    console.log(`${index + 1}. ${recommendation}`);
  });
  console.log('\n── Experiment scheduler ──');
  console.log('last:', report.experiment.lastRecorded ?? 'none');
  console.log('next:', report.experiment.nextSuggestion);
  console.table([
    ...Object.entries(report.experiment.counts.hookStyle).map(([value, count]) => ({
      dimension: 'hookStyle', value, count,
    })),
    ...Object.entries(report.experiment.counts.angleType).map(([value, count]) => ({
      dimension: 'angleType', value, count,
    })),
  ]);
  console.log(`\nWrote ${outputPath}`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((err: unknown) => {
    console.error('report failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
