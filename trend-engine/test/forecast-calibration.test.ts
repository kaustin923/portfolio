import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { test } from 'node:test';

import type { TopicOutcome } from '../src/agents/monitor.js';
import {
  appendForecasts,
  computeCalibration,
  getCalibrationSummary,
  readForecasts,
  type ForecastRecord,
} from '../src/calibration.js';
import { config } from '../src/config.js';
import type { Topic } from '../src/types.js';

const mutableConfig = config as unknown as { dataDir: string; dryRun: boolean };

function topic(overrides: Partial<Topic> = {}): Topic {
  return {
    id: 'forecast-topic',
    title: 'Forecast topic',
    summary: 'Summary',
    whyTrending: 'Because',
    momentum: 'rising',
    longevity: 'sustained',
    stage: 'emerging',
    leadTimeDays: 5,
    postWindow: 'this week',
    catalyst: null,
    recommendation: 'prepare',
    domains: ['science'],
    suggestedAngle: 'Explain it',
    saturationRisk: 'low',
    opportunityScore: 85,
    contributingSources: ['mock'],
    ...overrides,
  };
}

function forecast(
  topicId: string,
  overrides: Partial<{
    ts: string;
    opportunity: number;
    saturation: ForecastRecord['scores']['saturation'];
    stage: ForecastRecord['stage'];
    momentum: ForecastRecord['scores']['momentum'];
  }> = {},
): ForecastRecord {
  return {
    v: 1,
    ts: overrides.ts ?? '2026-02-01T00:00:00.000Z',
    topicId,
    title: `Topic ${topicId}`,
    scores: {
      momentum: overrides.momentum ?? 'rising',
      longevity: 'sustained',
      saturation: overrides.saturation ?? 'medium',
      opportunity: overrides.opportunity ?? 50,
    },
    stage: overrides.stage ?? 'rising',
    recommendation: 'prepare',
    windowStart: '2026-02-01',
    windowEnd: '2026-02-06',
    domains: ['science'],
  };
}

function outcome(
  topicId: string,
  platform: TopicOutcome['platform'],
  views: number,
  overrides: Partial<TopicOutcome> = {},
): TopicOutcome {
  return {
    postId: `post-${topicId}`,
    platform,
    views,
    likes: 1,
    comments: 1,
    shares: 1,
    capturedAt: '2026-03-01T00:00:00.000Z',
    topicId,
    topicTitle: `Topic ${topicId}`,
    domains: ['science'],
    stage: 'rising',
    recommendation: 'prepare',
    opportunityScore: 50,
    ...overrides,
  };
}

function jsonl(records: readonly unknown[]): string {
  return `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
}

test('appendForecasts skips DRY_RUN and persists actionable and skipped live forecasts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trend-engine-forecasts-'));
  const originalDataDir = mutableConfig.dataDir;
  const originalDryRun = mutableConfig.dryRun;
  mutableConfig.dataDir = `${dir}${sep}`;
  const topics = [
    topic(),
    topic({
      id: 'skipped-topic',
      title: 'Skipped topic',
      leadTimeDays: -4,
      stage: 'saturated',
      recommendation: 'skip-saturated',
      saturationRisk: 'high',
      opportunityScore: 10,
    }),
  ];

  try {
    mutableConfig.dryRun = true;
    await appendForecasts(topics, '2026-07-19');
    await assert.rejects(
      readFile(join(dir, 'forecasts.jsonl'), 'utf8'),
      (err: unknown) => (err as NodeJS.ErrnoException).code === 'ENOENT',
    );

    mutableConfig.dryRun = false;
    await appendForecasts(topics, '2026-07-19');
    const records = (await readFile(join(dir, 'forecasts.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as ForecastRecord);

    assert.equal(records.length, 2);
    assert.deepEqual(records.map((record) => record.topicId), ['forecast-topic', 'skipped-topic']);
    assert.equal(records[0]?.windowStart, '2026-07-19');
    assert.equal(records[0]?.windowEnd, '2026-07-24');
    assert.equal(records[1]?.windowEnd, '2026-07-19');
    assert.deepEqual(records[1]?.scores, {
      momentum: 'rising',
      longevity: 'sustained',
      saturation: 'high',
      opportunity: 10,
    });
    assert.equal(records[1]?.recommendation, 'skip-saturated');
  } finally {
    mutableConfig.dataDir = originalDataDir;
    mutableConfig.dryRun = originalDryRun;
  }
});

test('computeCalibration joins latest forecasts and computes platform-normalized deciles', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trend-engine-calibration-'));
  const originalDataDir = mutableConfig.dataDir;
  mutableConfig.dataDir = `${dir}${sep}`;

  const forecasts = [
    forecast('t1', { ts: '2026-01-01T00:00:00.000Z', opportunity: 85 }),
    ...Array.from({ length: 8 }, (_, index) => {
      const number = index + 1;
      const highRealized = number === 3 || number === 4 || number === 7 || number === 8;
      return forecast(`t${number}`, {
        opportunity: highRealized ? 85 : 65,
        saturation: highRealized ? 'low' : 'high',
      });
    }),
  ];
  const outcomes = [
    ...Array.from({ length: 4 }, (_, index) => outcome(`t${index + 1}`, 'tiktok', (index + 1) * 100)),
    ...Array.from({ length: 4 }, (_, index) => outcome(`t${index + 5}`, 'x', (index + 1) * 10)),
    outcome('t1', 'tiktok', 999_999, { postId: 'dryrun-filtered' }),
    outcome('t1', 'tiktok', 0, { postId: 'zero-filtered', likes: 0, comments: 0, shares: 0 }),
  ];

  try {
    await writeFile(join(dir, 'forecasts.jsonl'), jsonl(forecasts));
    await writeFile(join(dir, 'outcomes.jsonl'), jsonl(outcomes));

    const result = await computeCalibration();
    assert.equal(result.joinedCount, 8);
    assert.deepEqual(
      result.buckets.find((bucket) => bucket.decile === '60-69'),
      { decile: '60-69', n: 4, medianRealizedPercentile: 25 },
    );
    assert.deepEqual(
      result.buckets.find((bucket) => bucket.decile === '80-89'),
      { decile: '80-89', n: 4, medianRealizedPercentile: 75 },
    );

    const saturation = result.predictors.find((predictor) => predictor.feature === 'saturation');
    assert.equal(saturation?.spread, 50);
    assert.equal(saturation?.expectedDirectionSpread, -50);
    assert.equal(saturation?.strongestNegative, true);
    assert.match(result.summary, /80-89 scores realized median P75/);
    assert.match(result.summary, /60-69 scores realized median P25/);
    assert.match(result.summary, /saturation proved the strongest negative predictor \(high P25 vs low P75\)/);
    assert.ok(result.summary.length <= 500);
    assert.ok(result.summary.split('\n').length <= 4);

    const persisted = JSON.parse(await readFile(join(dir, 'calibration.json'), 'utf8')) as unknown;
    assert.deepEqual(persisted, result);
  } finally {
    mutableConfig.dataDir = originalDataDir;
  }
});

test('getCalibrationSummary returns no statistics below eight joined topics', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trend-engine-calibration-cold-'));
  const originalDataDir = mutableConfig.dataDir;
  mutableConfig.dataDir = `${dir}${sep}`;

  try {
    await writeFile(join(dir, 'forecasts.jsonl'), jsonl([forecast('cold')]));
    await writeFile(join(dir, 'outcomes.jsonl'), jsonl([outcome('cold', 'tiktok', 100)]));

    assert.equal(
      await getCalibrationSummary(),
      'Forecast calibration cold start: only 1 forecast→outcome pairs recorded (need 8) — no calibration statistics yet.',
    );
    const persisted = JSON.parse(
      await readFile(join(dir, 'calibration.json'), 'utf8'),
    ) as { buckets: unknown[]; predictors: unknown[] };
    assert.deepEqual(persisted.buckets, []);
    assert.deepEqual(persisted.predictors, []);
  } finally {
    mutableConfig.dataDir = originalDataDir;
  }
});

test('forecast and outcome readers tolerate corrupt lines independently', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trend-engine-calibration-corrupt-'));
  const originalDataDir = mutableConfig.dataDir;
  mutableConfig.dataDir = `${dir}${sep}`;

  try {
    await writeFile(
      join(dir, 'forecasts.jsonl'),
      `not-json\n${JSON.stringify(forecast('valid'))}\n${JSON.stringify({ v: 1 })}\n`,
    );
    await writeFile(
      join(dir, 'outcomes.jsonl'),
      `also-not-json\n${JSON.stringify(outcome('valid', 'tiktok', 100))}\n`,
    );

    assert.deepEqual((await readForecasts()).map((record) => record.topicId), ['valid']);
    assert.equal((await computeCalibration()).joinedCount, 1);
  } finally {
    mutableConfig.dataDir = originalDataDir;
  }
});
