import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { after, test } from 'node:test';

import { readMetrics, summarizePerformance } from '../src/agents/monitor.js';
import { config } from '../src/config.js';
import { resetLLM, setLLM, type LLM, type StructuredRequest } from '../src/llm.js';
import { runOnce } from '../src/orchestrator.js';
import { computeDelayMs } from '../src/scheduler.js';
import {
  acquireLock,
  loadState,
  recordPublished,
  releaseLock,
  saveState,
  topicKey,
  wasRecentlyPublished,
  type RunState,
} from '../src/state.js';
import { makeMockLLM } from '../src/testing/mockLlm.js';
import type { PostMetrics } from '../src/types.js';

const temporaryDirs: string[] = [];

function temporaryDir(): string {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? '/tmp', 'trend-engine-test-'));
  temporaryDirs.push(dir);
  return `${dir}${sep}`;
}

function redirectDataDir(dir: string): () => void {
  const mutableConfig = config as unknown as { dataDir: string };
  const original = mutableConfig.dataDir;
  mutableConfig.dataDir = dir;
  return () => {
    mutableConfig.dataDir = original;
  };
}

/** These tests cover the classic sourcing/editor path, not the studio pipeline. */
function forceClassicPipeline(): () => void {
  const mutableStudio = config.studio as unknown as { mode: boolean };
  const original = mutableStudio.mode;
  mutableStudio.mode = false;
  return () => {
    mutableStudio.mode = original;
  };
}

after(() => {
  resetLLM();
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

test('run state round-trips and detects recently published topic keys', () => {
  const dir = temporaryDir();
  const state: RunState = { version: 1, publishedTopics: {}, runCount: 0 };
  const key = topicKey('World Cup 2026!!');

  assert.equal(key, 'world-cup-2026');
  recordPublished(state, key, 'World Cup 2026!!', ['tiktok']);
  saveState(state, dir);

  const restored = loadState(dir);
  assert.deepEqual(restored, state);
  assert.equal(wasRecentlyPublished(restored, key), true);
  assert.equal(wasRecentlyPublished(restored, key, 0), false);
});

test('corrupt state falls back to a fresh state without throwing', () => {
  const dir = temporaryDir();
  writeFileSync(join(dir, 'state.json'), 'not json');
  const originalWarn = console.warn;
  let warned = false;
  console.warn = () => {
    warned = true;
  };

  try {
    assert.deepEqual(loadState(dir), { version: 1, publishedTopics: {}, runCount: 0 });
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(warned, true);
});

test('run lock prevents overlap, releases, and replaces stale locks', () => {
  const dir = temporaryDir();
  assert.equal(acquireLock(dir), true);
  assert.equal(acquireLock(dir), false);
  releaseLock(dir);
  assert.equal(acquireLock(dir), true);
  releaseLock(dir);

  writeFileSync(
    join(dir, 'run.lock'),
    JSON.stringify({ pid: 999999, startedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString() }),
  );
  assert.equal(acquireLock(dir), true);
  releaseLock(dir);
});

test('scheduler delay applies jitter and clamps runs per day', () => {
  const eightHours = 8 * 60 * 60 * 1000;
  assert.equal(computeDelayMs(3, 20, () => 1), eightHours * 1.2);
  assert.equal(computeDelayMs(3, 20, () => 0), eightHours * 0.8);
  assert.equal(computeDelayMs(0, 20, () => 0.5), 86_400_000);
});

test('metrics reader skips corruption and summaries exclude DRY_RUN records', async () => {
  const dir = temporaryDir();
  const dryrun: PostMetrics = {
    postId: 'dryrun-tiktok-x',
    platform: 'tiktok',
    views: 999999,
    likes: 0,
    comments: 0,
    shares: 0,
    capturedAt: '2026-07-19T00:00:00.000Z',
  };
  const real: PostMetrics = {
    postId: 'real-123',
    platform: 'youtube-shorts',
    views: 4321,
    likes: 100,
    comments: 20,
    shares: 10,
    capturedAt: '2026-07-19T01:00:00.000Z',
  };
  writeFileSync(
    join(dir, 'metrics.jsonl'),
    `${JSON.stringify(dryrun)}\nmalformed line\n${JSON.stringify(real)}\n`,
  );

  const metrics = await readMetrics(dir);
  assert.deepEqual(metrics, [dryrun, real]);

  const summary = summarizePerformance(metrics);
  assert.ok(summary);
  assert.match(summary, /real-123/);
  assert.doesNotMatch(summary, /dryrun-tiktok-x/);
  assert.equal(summarizePerformance([dryrun]), null);
});

test('one topic failure does not abort the remaining pipeline', async () => {
  const restoreDataDir = redirectDataDir(temporaryDir());
  const restoreStudioMode = forceClassicPipeline();
  const delegate = makeMockLLM();
  let threwCaption = false;
  const flaky: LLM = {
    async structured<T>(request: StructuredRequest): Promise<T> {
      const properties = (request.schema as { properties?: Record<string, unknown> }).properties ?? {};
      if (!threwCaption && 'caption' in properties) {
        threwCaption = true;
        throw new Error('intentional first-caption failure');
      }
      return delegate.structured<T>(request);
    },
    research(prompt: string): Promise<string> {
      return delegate.research(prompt);
    },
  };

  setLLM(flaky);
  try {
    const report = await runOnce();
    assert.equal(report.failed, 1);
    assert.equal(
      report.published,
      (report.topicsConsidered - report.failed) * config.publishing.defaultPlatforms.length,
    );
  } finally {
    resetLLM();
    restoreStudioMode();
    restoreDataDir();
  }
});

test('repeated DRY_RUN pipeline runs never create dedupe records', async () => {
  const restoreDataDir = redirectDataDir(temporaryDir());
  const restoreStudioMode = forceClassicPipeline();
  const before = { ...loadState(config.dataDir).publishedTopics };
  setLLM(makeMockLLM());
  try {
    const first = await runOnce();
    const second = await runOnce();
    assert.ok(first.published > 0);
    assert.equal(second.published, first.published);
    assert.equal(second.topicsConsidered, first.topicsConsidered);
    assert.deepEqual(loadState(config.dataDir).publishedTopics, before);
  } finally {
    resetLLM();
    restoreStudioMode();
    restoreDataDir();
  }
});
