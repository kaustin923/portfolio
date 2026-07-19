import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { test } from 'node:test';

import { publish } from '../src/agents/publisher.js';
import { config } from '../src/config.js';
import { resetFetch, setFetch, type FetchFn } from '../src/publish/http.js';
import {
  getDailyPublishCount,
  getYouTubeUnits,
  loadState,
  pacificDateKey,
  recordDailyPublish,
  recordYouTubeUnits,
  saveState,
  utcDateKey,
  type RunState,
} from '../src/state.js';
import type { ClipDraft, Platform } from '../src/types.js';

interface MutableConfig {
  dataDir: string;
  dryRun: boolean;
  quotas: {
    maxPostsPerDayPerPlatform: number;
    youtubeDailyUnits: number;
    youtubeInsertUnits: number;
  };
}

interface FetchCall {
  url: string;
  init?: RequestInit;
}

type FetchStep = Response | ((call: FetchCall) => Response | Promise<Response>);

const ENV_KEYS = [
  'IG_USER_ID',
  'IG_ACCESS_TOKEN',
  'TIKTOK_ACCESS_TOKEN',
  'YOUTUBE_CLIENT_ID',
  'YOUTUBE_CLIENT_SECRET',
  'YOUTUBE_REFRESH_TOKEN',
] as const;

async function withTempConfig<T>(
  dryRun: boolean,
  run: (dir: string) => Promise<T>,
): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'quota-preflights-'));
  const mutable = config as unknown as MutableConfig;
  const original = {
    dataDir: mutable.dataDir,
    dryRun: mutable.dryRun,
    quotas: { ...mutable.quotas },
    env: new Map(ENV_KEYS.map((key) => [key, process.env[key]])),
  };
  mutable.dataDir = `${dir}${sep}`;
  mutable.dryRun = dryRun;
  Object.assign(mutable.quotas, {
    maxPostsPerDayPerPlatform: 8,
    youtubeDailyUnits: 10_000,
    youtubeInsertUnits: 1_600,
  });

  try {
    return await run(dir);
  } finally {
    resetFetch();
    mutable.dataDir = original.dataDir;
    mutable.dryRun = original.dryRun;
    Object.assign(mutable.quotas, original.quotas);
    for (const key of ENV_KEYS) {
      const value = original.env.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(dir, { recursive: true, force: true });
  }
}

function baseState(): RunState {
  return { version: 1, publishedTopics: {}, runCount: 0 };
}

function makeDraft(outputPath: string, platform: Platform): ClipDraft {
  return {
    id: `quota-${platform}`,
    topicId: 'quota-topic',
    sourceCandidateId: 'quota-source',
    outputPath,
    aspectRatio: '9:16',
    caption: 'Quota test caption',
    hashtags: ['quota'],
    targetPlatforms: [platform],
    license: {
      type: 'original',
      requiresAttribution: false,
      commercialUse: true,
      sourceUrl: 'self',
    },
  };
}

function jsonResponse(value: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function makeRecorder(steps: FetchStep[]): FetchCall[] {
  const calls: FetchCall[] = [];
  const remaining = [...steps];
  const fakeFetch: FetchFn = async (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const call = { url, init };
    calls.push(call);
    const step = remaining.shift();
    if (!step) throw new Error(`Unexpected fetch call: ${url}`);
    return typeof step === 'function' ? step(call) : step;
  };
  setFetch(fakeFetch);
  return calls;
}

async function withoutPublishLogs<T>(run: () => Promise<T>): Promise<T> {
  const originalLog = console.log;
  console.log = () => undefined;
  try {
    return await run();
  } finally {
    console.log = originalLog;
  }
}

test('quota state round-trips, prunes stale dates, and accepts legacy state', async () => {
  await withTempConfig(true, async (dir) => {
    const today = utcDateKey();
    const pacificToday = pacificDateKey();
    const state: RunState = {
      ...baseState(),
      dailyPublishCounts: { '2025-01-01': { tiktok: 99 } },
    };

    recordDailyPublish(state, 'tiktok', today);
    recordDailyPublish(state, 'tiktok', today);
    recordDailyPublish(state, 'instagram-reels', today);
    recordYouTubeUnits(state, 1_600, pacificToday);
    assert.deepEqual(Object.keys(state.dailyPublishCounts ?? {}), [today]);
    assert.equal(getDailyPublishCount(state, 'tiktok', today), 2);
    assert.equal(getDailyPublishCount(state, 'tiktok', '2025-01-01'), 0);
    assert.equal(getYouTubeUnits(state, pacificToday), 1_600);

    saveState(state);
    assert.deepEqual(loadState(), state);

    const legacy = baseState();
    writeFileSync(join(dir, 'state.json'), JSON.stringify(legacy));
    assert.deepEqual(loadState(), legacy, 'legacy version 1 files remain valid');
    assert.equal(utcDateKey(new Date('2026-01-01T07:30:00.000Z')), '2026-01-01');
    assert.equal(pacificDateKey(new Date('2026-01-01T07:30:00.000Z')), '2025-12-31');
  });
});

test('saveState preserves quota counters from a stale caller', async () => {
  await withTempConfig(true, async () => {
    const dailyDate = utcDateKey();
    const youtubeDate = pacificDateKey();
    const publisherState = baseState();
    recordDailyPublish(publisherState, 'youtube-shorts', dailyDate);
    recordDailyPublish(publisherState, 'youtube-shorts', dailyDate);
    recordYouTubeUnits(publisherState, 1_600, youtubeDate);
    saveState(publisherState);

    const staleOrchestratorState: RunState = {
      version: 1,
      publishedTopics: {},
      runCount: 1,
    };
    saveState(staleOrchestratorState);

    const restored = loadState();
    assert.equal(restored.runCount, 1);
    assert.equal(getDailyPublishCount(restored, 'youtube-shorts', dailyDate), 2);
    assert.equal(getYouTubeUnits(restored, youtubeDate), 1_600);
  });
});

test('daily platform cap skips before any platform preflight fetch', async () => {
  await withTempConfig(false, async (dir) => {
    process.env.TIKTOK_ACCESS_TOKEN = 'tiktok-token';
    const state = baseState();
    for (let count = 0; count < config.quotas.maxPostsPerDayPerPlatform; count += 1) {
      recordDailyPublish(state, 'tiktok', utcDateKey());
    }
    saveState(state);
    const calls = makeRecorder([]);

    const results = await withoutPublishLogs(() =>
      publish(makeDraft(join(dir, 'not-read.mp4'), 'tiktok'), { status: 'approved' }),
    );

    assert.equal(results[0]?.status, 'skipped');
    assert.equal(
      results[0]?.error,
      `daily publish cap reached (${config.quotas.maxPostsPerDayPerPlatform}/${config.quotas.maxPostsPerDayPerPlatform}) — skipping`,
    );
    assert.equal(calls.length, 0);
  });
});

test('Instagram quota preflight skips when content_publishing_limit is reached', async () => {
  await withTempConfig(false, async (dir) => {
    process.env.IG_USER_ID = 'ig/user';
    process.env.IG_ACCESS_TOKEN = 'ig-token';
    saveState(baseState());
    const calls = makeRecorder([
      jsonResponse({
        data: [{ quota_usage: 100, config: { quota_total: 100, quota_duration: 86_400 } }],
      }),
    ]);

    const results = await withoutPublishLogs(() =>
      publish(makeDraft(join(dir, 'not-read.mp4'), 'instagram-reels'), {
        status: 'approved',
      }),
    );

    assert.equal(results[0]?.status, 'skipped');
    assert.equal(results[0]?.error, 'IG content_publishing_limit reached (100/100)');
    assert.equal(calls.length, 1);
    assert.match(calls[0]?.url ?? '', /ig%2Fuser\/content_publishing_limit/);
    assert.doesNotMatch(calls[0]?.url ?? '', /access_token/i);
    assert.equal(
      new Headers(calls[0]?.init?.headers).get('Authorization'),
      'Bearer ig-token',
    );
  });
});

test('Instagram preflight allows the adapter when quota remains', async () => {
  await withTempConfig(false, async (dir) => {
    process.env.IG_USER_ID = 'ig-user';
    process.env.IG_ACCESS_TOKEN = 'ig-token';
    saveState(baseState());
    const videoPath = join(dir, 'instagram.mp4');
    writeFileSync(videoPath, new Uint8Array([1, 2, 3]));
    const calls = makeRecorder([
      jsonResponse({
        data: [{ quota_usage: 99, config: { quota_total: 100, quota_duration: 86_400 } }],
      }),
      jsonResponse({ id: 'container-1' }),
      jsonResponse({ success: true }),
      jsonResponse({ status_code: 'FINISHED' }),
      jsonResponse({ id: 'media-1' }),
      jsonResponse({ permalink: 'https://www.instagram.com/reel/media-1/' }),
    ]);

    const results = await withoutPublishLogs(() =>
      publish(makeDraft(videoPath, 'instagram-reels'), { status: 'approved' }),
    );

    assert.equal(results[0]?.status, 'published');
    assert.equal(results[0]?.postId, 'media-1');
    assert.equal(calls.length, 6);
    assert.match(calls[1]?.url ?? '', /\/ig-user\/media$/);
    assert.equal(getDailyPublishCount(loadState(), 'instagram-reels', utcDateKey()), 1);
  });
});

test('TikTok preflight skips when SELF_ONLY is unavailable', async () => {
  await withTempConfig(false, async (dir) => {
    process.env.TIKTOK_ACCESS_TOKEN = 'tiktok-token';
    saveState(baseState());
    const calls = makeRecorder([
      jsonResponse({
        data: {
          privacy_level_options: ['PUBLIC_TO_EVERYONE'],
          max_video_post_duration_sec: 60,
        },
        error: { code: 'ok' },
      }),
    ]);

    const results = await withoutPublishLogs(() =>
      publish(makeDraft(join(dir, 'not-read.mp4'), 'tiktok'), { status: 'approved' }),
    );

    assert.equal(results[0]?.status, 'skipped');
    assert.match(results[0]?.error ?? '', /required SELF_ONLY/);
    assert.equal(calls.length, 1);
  });
});

test('TikTok preflight skips an explicit creator_info refusal', async () => {
  await withTempConfig(false, async (dir) => {
    process.env.TIKTOK_ACCESS_TOKEN = 'tiktok-token';
    saveState(baseState());
    const calls = makeRecorder([
      jsonResponse({
        data: {},
        error: {
          code: 'spam_risk_too_many_posts',
          message: 'posting too frequently',
        },
      }),
    ]);

    const results = await withoutPublishLogs(() =>
      publish(makeDraft(join(dir, 'not-read.mp4'), 'tiktok'), { status: 'approved' }),
    );

    assert.equal(results[0]?.status, 'skipped');
    assert.match(results[0]?.error ?? '', /spam_risk_too_many_posts/);
    assert.match(results[0]?.error ?? '', /posting too frequently/);
    assert.equal(calls.length, 1);
  });
});

test('YouTube quota ledger skips an insert that would exceed the daily units', async () => {
  await withTempConfig(false, async (dir) => {
    process.env.YOUTUBE_CLIENT_ID = 'client-id';
    process.env.YOUTUBE_CLIENT_SECRET = 'client-secret';
    process.env.YOUTUBE_REFRESH_TOKEN = 'refresh-token';
    const state: RunState = {
      ...baseState(),
      youtubeQuota: { date: pacificDateKey(), unitsUsed: 9_600 },
    };
    saveState(state);
    const calls = makeRecorder([]);

    const results = await withoutPublishLogs(() =>
      publish(makeDraft(join(dir, 'not-read.mp4'), 'youtube-shorts'), {
        status: 'approved',
      }),
    );

    assert.equal(results[0]?.status, 'skipped');
    assert.equal(
      results[0]?.error,
      'YouTube quota ledger: would exceed daily units (9600+1600 > 10000)',
    );
    assert.equal(calls.length, 0);
    assert.equal(getYouTubeUnits(loadState(), pacificDateKey()), 9_600);
  });
});

test('YouTube quota ledger records units before an allowed insert attempt', async () => {
  await withTempConfig(false, async (dir) => {
    process.env.YOUTUBE_CLIENT_ID = 'client-id';
    process.env.YOUTUBE_CLIENT_SECRET = 'client-secret';
    process.env.YOUTUBE_REFRESH_TOKEN = 'refresh-token';
    const state: RunState = {
      ...baseState(),
      youtubeQuota: { date: pacificDateKey(), unitsUsed: 8_000 },
    };
    saveState(state);
    const videoPath = join(dir, 'youtube.mp4');
    writeFileSync(videoPath, new Uint8Array([4, 5, 6]));
    const uploadLocation = 'https://upload.youtube.test/quota-attempt';
    const calls = makeRecorder([
      jsonResponse({ access_token: 'access-token' }),
      jsonResponse({}, { headers: { Location: uploadLocation } }),
      jsonResponse({ id: 'youtube-video-1' }),
    ]);

    const results = await withoutPublishLogs(() =>
      publish(makeDraft(videoPath, 'youtube-shorts'), { status: 'approved' }),
    );

    assert.equal(results[0]?.status, 'published');
    assert.equal(calls.length, 3);
    const restored = loadState();
    assert.equal(getYouTubeUnits(restored, pacificDateKey()), 9_600);
    assert.equal(getDailyPublishCount(restored, 'youtube-shorts', utcDateKey()), 1);
  });
});

test('DRY_RUN performs no quota fetches and creates no state file', async () => {
  await withTempConfig(true, async (dir) => {
    const videoPath = join(dir, 'dry-run.mp4');
    writeFileSync(videoPath, new Uint8Array([7, 8, 9]));
    const calls = makeRecorder([]);

    const results = await withoutPublishLogs(() =>
      publish(
        {
          ...makeDraft(videoPath, 'tiktok'),
          targetPlatforms: ['instagram-reels', 'tiktok', 'youtube-shorts'],
        },
        { status: 'approved' },
      ),
    );

    assert.equal(results.length, 3);
    assert.ok(results.every((result) => result.status === 'published'));
    assert.equal(calls.length, 0);
    assert.equal(existsSync(join(dir, 'state.json')), false);
  });
});
