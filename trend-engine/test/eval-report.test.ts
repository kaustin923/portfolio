import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { after, test } from 'node:test';

import { pollCommandsOnce } from '../src/approval/commands.js';
import {
  resetTelegramFetch,
  setTelegramFetch,
  type TelegramFetchFn,
} from '../src/approval/telegram.js';
import { config } from '../src/config.js';
import { buildEvalReport } from '../src/report.js';
import {
  planNextExperiment,
  readExperiments,
  recordExperiment,
} from '../src/variation.js';

type MutableConfig = {
  dryRun: boolean;
  dataDir: string;
  approval: {
    telegramBotToken: string;
    telegramChatId: string;
  };
};

const temporaryDirs: string[] = [];

function temporaryDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'trend-eval-report-'));
  temporaryDirs.push(dir);
  return `${dir}${sep}`;
}

function redirectConfig(dir: string, dryRun = true): () => void {
  const mutable = config as unknown as MutableConfig;
  const previous = {
    dryRun: mutable.dryRun,
    dataDir: mutable.dataDir,
    telegramBotToken: mutable.approval.telegramBotToken,
    telegramChatId: mutable.approval.telegramChatId,
  };
  mutable.dryRun = dryRun;
  mutable.dataDir = dir;
  mutable.approval.telegramBotToken = 'eval-report-token';
  mutable.approval.telegramChatId = 'approver-chat';
  return () => {
    mutable.dryRun = previous.dryRun;
    mutable.dataDir = previous.dataDir;
    mutable.approval.telegramBotToken = previous.telegramBotToken;
    mutable.approval.telegramChatId = previous.telegramChatId;
  };
}

function writeJsonl(path: string, records: readonly unknown[]): void {
  writeFileSync(path, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`);
}

function outcome(index: number): Record<string, unknown> {
  const topHalf = index >= 5;
  return {
    postId: `post-${index}`,
    platform: 'youtube-shorts',
    views: (index + 1) * 100,
    likes: index + 1,
    comments: 1,
    shares: 1,
    capturedAt: '2026-07-19T12:00:00.000Z',
    topicId: `topic-${index}`,
    topicTitle: `Topic ${index}`,
    domains: ['testing'],
    stage: 'rising',
    recommendation: topHalf ? 'prepare' : 'post-now',
    opportunityScore: index * 10 + 5,
    contentFeatures: {
      angleType: topHalf ? 'original-take' : 'explainer',
      hookStyle: topHalf ? 'question' : 'statement',
      durationSec: 20,
      tier: topHalf ? 'green.v1' : 'yellow',
      syntheticMedia: topHalf,
      voice: topHalf ? 'voice-a' : 'none',
      postHourLocal: topHalf ? 18 : 8,
      platform: 'youtube-shorts',
    },
  };
}

function forecast(index: number): Record<string, unknown> {
  const topHalf = index >= 5;
  return {
    v: 1,
    ts: `2026-07-19T12:${String(index).padStart(2, '0')}:00.000Z`,
    topicId: `topic-${index}`,
    title: `Topic ${index}`,
    scores: {
      momentum: 'rising',
      longevity: 'sustained',
      saturation: 'low',
      opportunity: index * 10 + 5,
    },
    stage: 'rising',
    recommendation: topHalf ? 'prepare' : 'post-now',
    windowStart: '2026-07-19',
    windowEnd: '2026-07-22',
    domains: ['testing'],
  };
}

function manualPost(index: number): Record<string, unknown> {
  return {
    v: 1,
    at: `2026-07-19T13:0${index}:00.000Z`,
    topicId: `topic-${index}`,
    draftId: `draft-${index}`,
    platform: 'youtube-shorts',
    postUrl: `https://youtube.com/shorts/abcdefghij${index}`,
    videoId: `abcdefghij${index}`,
    tier: 'green',
    syntheticMedia: false,
    contentFeatures: null,
  };
}

function writeFullFixture(dir: string): void {
  writeJsonl(join(dir, 'outcomes.jsonl'), Array.from({ length: 10 }, (_, index) => outcome(index)));
  writeJsonl(join(dir, 'forecasts.jsonl'), Array.from({ length: 10 }, (_, index) => forecast(index)));
  writeJsonl(join(dir, 'provenance.jsonl'), [
    { kind: 'outbox' },
    { kind: 'published' },
    { kind: 'outbox' },
    { kind: 'outbox' },
    { kind: 'outbox' },
  ]);
  writeJsonl(join(dir, 'manual-posts.jsonl'), [manualPost(0), manualPost(1)]);
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

after(() => {
  resetTelegramFetch();
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

test('buildEvalReport computes calibration, feature, hit-rate, platform, and coverage math', async () => {
  const dir = temporaryDir();
  const restore = redirectConfig(dir);
  writeFullFixture(dir);

  try {
    const report = await buildEvalReport();
    assert.equal(report.calibration.coldStart, false);
    assert.equal(report.calibration.joinedCount, 10);
    assert.deepEqual(report.calibration.buckets.at(-1), {
      decile: '90-100',
      n: 1,
      medianRealizedPercentile: 95,
    });

    const angle = report.features.dimensions.find((dimension) => dimension.dimension === 'angleType');
    assert.equal(angle?.best?.value, 'original-take');
    assert.equal(angle?.best?.n, 5);
    assert.equal(Math.round(angle?.best?.score ?? 0), 75);
    assert.equal(angle?.worst?.value, 'explainer');
    assert.equal(angle?.worst?.n, 5);
    assert.equal(Math.round(angle?.worst?.score ?? 0), 25);

    assert.deepEqual(report.forecastHitRate.overall, { hits: 4, total: 10, rate: 0.4 });
    assert.deepEqual(report.forecastHitRate.opportunity70Plus, { hits: 3, total: 3, rate: 1 });
    assert.deepEqual(report.forecastHitRate.byRecommendation['post-now'], {
      hits: 0,
      total: 5,
      rate: 0,
    });
    assert.deepEqual(report.forecastHitRate.byRecommendation.prepare, {
      hits: 4,
      total: 5,
      rate: 0.8,
    });
    assert.deepEqual(report.platformPerformance, [{
      platform: 'youtube-shorts',
      posts: 10,
      totalViews: 5_500,
      averageViews: 550,
      meanPlatformPercentile: 50,
    }]);
    assert.equal(report.manualPostCoverage.kitsWritten, 4);
    assert.equal(report.manualPostCoverage.postsRegistered, 2);
    assert.equal(report.manualPostCoverage.coverage, 0.5);

    assert.equal(report.recommendations.length, 3);
    assert.match(report.recommendations[0], /P75, n=5/);
    assert.match(report.recommendations[1], /P25, n=5/);
    assert.match(report.recommendations[2], /2 of 4 kits \(50%\)/);
    assert.ok(report.recommendations.every((recommendation) => /\d/.test(recommendation)));
  } finally {
    restore();
  }
});

test('buildEvalReport reports an honest empty cold start without fabricated rates', async () => {
  const dir = temporaryDir();
  const restore = redirectConfig(dir);
  try {
    const report = await buildEvalReport();
    assert.equal(report.calibration.coldStart, true);
    assert.match(report.calibration.summary, /only 0 forecast→outcome pairs/);
    assert.match(report.features.summary, /cold start — 0\/7/);
    assert.match(report.platformSummary, /cold start — 0 live outcome rows/);
    assert.equal(report.forecastHitRate.overall, null);
    assert.match(report.forecastHitRate.summary, /cold start — 0 joined/);
    assert.equal(report.manualPostCoverage.coverage, null);
    assert.match(report.manualPostCoverage.summary, /cold start — 0 posts registered from 0/);
    assert.deepEqual(report.recommendations.map((recommendation) =>
      /cold start|unlock calibration/.test(recommendation)), [true, true, true]);
    assert.equal(report.recommendations.length, 3);
    assert.doesNotMatch(report.recommendations.join('\n'), /\bP\d{2}\b/);
  } finally {
    restore();
  }
});

test('experiment planning is deterministic and balances dimensions and values', async () => {
  const dir = temporaryDir();
  const restore = redirectConfig(dir);
  try {
    writeFileSync(join(dir, 'experiments.jsonl'), '{corrupt\n');
    const first = await planNextExperiment();
    assert.deepEqual(await planNextExperiment(), first);
    assert.equal(first.dimension, 'hookStyle');
    assert.equal(first.value, 'imperative');

    const dimensions: string[] = [];
    for (let index = 0; index < 50; index += 1) {
      const plan = await planNextExperiment();
      dimensions.push(plan.dimension);
      await recordExperiment(plan);
    }
    assert.deepEqual(
      dimensions.slice(0, 8),
      ['hookStyle', 'angleType', 'hookStyle', 'angleType', 'hookStyle', 'angleType', 'hookStyle', 'angleType'],
    );

    const history = await readExperiments();
    assert.equal(history.length, 50);
    for (const dimension of ['hookStyle', 'angleType'] as const) {
      const counts = new Map<string, number>();
      for (const plan of history.filter((candidate) => candidate.dimension === dimension)) {
        counts.set(plan.value, (counts.get(plan.value) ?? 0) + 1);
      }
      const values = [...counts.values()];
      assert.equal(Math.max(...values) - Math.min(...values) <= 1, true);
    }
  } finally {
    restore();
  }
});

test('/report sends a compact MarkdownV2-escaped digest to the approver chat', async () => {
  const dir = temporaryDir();
  const restore = redirectConfig(dir, false);
  writeFullFixture(dir);
  const calls: Array<{ method: string; body: Record<string, unknown> }> = [];
  setTelegramFetch((async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = url.slice(url.lastIndexOf('/') + 1);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ method, body });
    if (method === 'getUpdates') {
      return jsonResponse({
        ok: true,
        result: [{
          update_id: 101,
          message: {
            text: '/report',
            chat: { id: 'approver-chat' },
            from: { username: 'operator' },
          },
        }],
      });
    }
    return jsonResponse({ ok: true, result: true });
  }) as TelegramFetchFn);

  try {
    await pollCommandsOnce({ dir, timeoutSec: 0 });
    const sent = calls.find((call) => call.method === 'sendMessage');
    assert.ok(sent);
    assert.equal(sent.body.parse_mode, 'MarkdownV2');
    assert.equal(sent.body.chat_id, 'approver-chat');
    assert.match(String(sent.body.text), /original\\-take/);
    assert.match(String(sent.body.text), /1\\\. /);
    assert.equal(String(sent.body.text).split('\n').length <= 15, true);
  } finally {
    resetTelegramFetch();
    restore();
  }
});

test('npm run report overwrites eval-report.json and succeeds on repeat', () => {
  const dir = temporaryDir();
  const env = { ...process.env, DATA_DIR: dir, DRY_RUN: '1' };
  const run = () => spawnSync('npm', ['run', 'report'], {
    cwd: process.cwd(),
    env,
    encoding: 'utf8',
  });

  const first = run();
  assert.equal(first.status, 0, first.stderr || first.stdout);
  const firstReport = JSON.parse(readFileSync(join(dir, 'eval-report.json'), 'utf8')) as {
    v?: unknown;
    generatedAt?: unknown;
    recommendations?: unknown;
  };
  assert.equal(firstReport.v, 1);
  assert.equal(typeof firstReport.generatedAt, 'string');
  assert.equal(Array.isArray(firstReport.recommendations), true);

  const second = run();
  assert.equal(second.status, 0, second.stderr || second.stdout);
  const secondReport = JSON.parse(readFileSync(join(dir, 'eval-report.json'), 'utf8')) as {
    v?: unknown;
    recommendations?: unknown[];
  };
  assert.equal(secondReport.v, 1);
  assert.equal(secondReport.recommendations?.length, 3);
});
