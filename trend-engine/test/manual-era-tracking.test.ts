import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { test } from 'node:test';

import { refreshManualPostStats } from '../src/agents/monitor.js';
import { pollCommandsOnce } from '../src/approval/commands.js';
import {
  resetPendingDecisions,
  resetTelegramFetch,
  setTelegramFetch,
  type TelegramFetchFn,
} from '../src/approval/telegram.js';
import { config } from '../src/config.js';
import { getLearningSummary } from '../src/learning.js';
import {
  extractYouTubeVideoId,
  readManualPosts,
  recordManualOutcome,
  registerManualPost,
} from '../src/manualPosts.js';
import { resetFetch, setFetch, type FetchFn } from '../src/publish/http.js';

interface MutableConfig {
  dataDir: string;
  dryRun: boolean;
  approval: {
    telegramBotToken: string;
    telegramChatId: string;
    timeoutMinutes: number;
  };
}

const contentFeatures = {
  angleType: 'explainer',
  hookStyle: 'question',
  durationSec: null,
  tier: 'yellow',
  syntheticMedia: true,
  voice: 'Feature Voice',
  postHourLocal: 9,
};

async function withTempConfig<T>(
  run: (dir: string, mutable: MutableConfig) => Promise<T>,
  dryRun = true,
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'trend-engine-manual-era-'));
  const mutable = config as unknown as MutableConfig;
  const original = {
    dataDir: mutable.dataDir,
    dryRun: mutable.dryRun,
    approval: { ...mutable.approval },
  };
  mutable.dataDir = `${dir}${sep}`;
  mutable.dryRun = dryRun;
  mutable.approval.telegramBotToken = 'telegram-test-token';
  mutable.approval.telegramChatId = 'approver-chat';

  try {
    return await run(dir, mutable);
  } finally {
    resetFetch();
    resetTelegramFetch();
    resetPendingDecisions();
    mutable.dataDir = original.dataDir;
    mutable.dryRun = original.dryRun;
    Object.assign(mutable.approval, original.approval);
    await rm(dir, { recursive: true, force: true });
  }
}

async function writeKit(
  dir: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const kitDir = join(dir, `kit-${Math.random().toString(36).slice(2)}`);
  await mkdir(kitDir, { recursive: true });
  await writeFile(join(kitDir, 'meta.json'), JSON.stringify({
    topicId: 'manual-topic',
    draftId: 'manual-draft',
    tier: 'yellow',
    syntheticMedia: true,
    contentFeatures,
    ...overrides,
  }));
  return kitDir;
}

async function readJsonl(path: string): Promise<Array<Record<string, unknown>>> {
  return (await readFile(path, 'utf8'))
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function inputUrl(input: string | URL | Request): string {
  return typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
}

function setEnv(name: string, value: string | undefined): () => void {
  const original = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  return () => {
    if (original === undefined) delete process.env[name];
    else process.env[name] = original;
  };
}

test('registerManualPost joins kit metadata and readers use latest-wins records', async () => {
  await withTempConfig(async (dir) => {
    const kitDir = await writeKit(dir);
    const postUrl = 'https://youtube.com/shorts/dQw4w9WgXcQ';
    const first = await registerManualPost(kitDir, 'youtube-shorts', postUrl);
    const secondKit = await writeKit(dir, { draftId: 'replacement-draft' });
    const second = await registerManualPost(secondKit, 'youtube-shorts', postUrl);

    assert.deepEqual(
      {
        ...first,
        at: '',
      },
      {
        v: 1,
        at: '',
        topicId: 'manual-topic',
        draftId: 'manual-draft',
        platform: 'youtube-shorts',
        postUrl,
        videoId: 'dQw4w9WgXcQ',
        tier: 'yellow',
        syntheticMedia: true,
        contentFeatures,
      },
    );

    await writeFile(
      join(dir, 'manual-posts.jsonl'),
      `${(await readFile(join(dir, 'manual-posts.jsonl'), 'utf8'))}{corrupt\n`,
    );
    const latest = await readManualPosts();
    assert.equal(latest.length, 1);
    assert.equal(latest[0]?.draftId, second.draftId);
  });
});

test('manual registration and metric entry fail loudly on invalid input', async () => {
  await withTempConfig(async (dir) => {
    const missingKit = join(dir, 'missing-kit');
    await assert.rejects(
      registerManualPost(missingKit, 'tiktok', 'https://example.com/post'),
      (err: unknown) =>
        err instanceof Error &&
        /missing or unparseable/.test(err.message) &&
        err.message.includes(join(missingKit, 'meta.json')),
    );

    const badJsonKit = join(dir, 'bad-json-kit');
    await mkdir(badJsonKit);
    await writeFile(join(badJsonKit, 'meta.json'), '{bad');
    await assert.rejects(
      registerManualPost(badJsonKit, 'tiktok', 'https://example.com/post'),
      /meta\.json/,
    );

    const missingIdKit = await writeKit(dir, { topicId: '' });
    await assert.rejects(
      registerManualPost(missingIdKit, 'tiktok', 'https://example.com/post'),
      /meta\.json: missing topicId/,
    );

    const validKit = await writeKit(dir);
    await assert.rejects(
      registerManualPost(validKit, 'facebook', 'https://example.com/post'),
      /invalid platform: facebook/,
    );
    await assert.rejects(
      recordManualOutcome('https://example.com/unregistered', 100),
      /not registered — run: npm run track register/,
    );
    await assert.rejects(
      recordManualOutcome('https://example.com/unregistered', 1.5),
      /views must be a non-negative finite integer/,
    );
  });
});

test('manual views produce feature-attributed, forecast-joined learning outcomes', async () => {
  await withTempConfig(async (dir) => {
    const kitDir = await writeKit(dir);
    const postUrl = 'https://example.com/manual-post';
    await registerManualPost(kitDir, 'tiktok', postUrl);
    await writeFile(
      join(dir, 'forecasts.jsonl'),
      [
        '{corrupt',
        JSON.stringify({
          v: 1,
          ts: '2026-07-19T10:00:00.000Z',
          topicId: 'manual-topic',
          title: 'Old forecast title',
          scores: {
            momentum: 'rising',
            longevity: 'sustained',
            saturation: 'low',
            opportunity: 60,
          },
          domains: ['old-domain'],
          stage: 'emerging',
          recommendation: 'prepare',
          windowStart: '2026-07-19',
          windowEnd: '2026-07-20',
        }),
        JSON.stringify({
          v: 1,
          ts: '2026-07-19T11:00:00.000Z',
          topicId: 'manual-topic',
          title: 'Manual forecast title',
          scores: {
            momentum: 'exploding',
            longevity: 'sustained',
            saturation: 'low',
            opportunity: 92,
          },
          domains: ['science', 'education'],
          stage: 'rising',
          recommendation: 'post-now',
          windowStart: '2026-07-19',
          windowEnd: '2026-07-21',
        }),
      ].join('\n'),
    );

    await recordManualOutcome(postUrl, 1234, 56, 7);

    const [outcome] = await readJsonl(join(dir, 'outcomes.jsonl'));
    assert.deepEqual(
      { ...outcome, capturedAt: '', contentFeatures: undefined },
      {
        postId: postUrl,
        platform: 'tiktok',
        views: 1234,
        likes: 56,
        comments: 7,
        shares: 0,
        capturedAt: '',
        contentFeatures: undefined,
        topicId: 'manual-topic',
        topicTitle: 'Manual forecast title',
        domains: ['science', 'education'],
        stage: 'rising',
        recommendation: 'post-now',
        opportunityScore: 92,
      },
    );
    assert.deepEqual(outcome?.contentFeatures, {
      ...contentFeatures,
      platform: 'tiktok',
    });
    const summary = await getLearningSummary();
    assert.match(summary, /Historical performance \(1 recorded posts, 1\.2k avg views\/post\)/);
    assert.match(summary, /science/);
    assert.match(summary, /rising/);

    // A repeated stat entry replaces the earlier snapshot rather than
    // double-counting the post in learning statistics.
    await recordManualOutcome(postUrl, 2000, 80, 9);
    const outcomes = await readJsonl(join(dir, 'outcomes.jsonl'));
    assert.equal(outcomes.length, 2, 'the ledger itself stays append-only');
    const refreshed = await getLearningSummary();
    assert.match(refreshed, /Historical performance \(1 recorded posts, 2k avg views\/post\)/);
  });
});

test('extractYouTubeVideoId recognizes public URL shapes and rejects invalid IDs', () => {
  const id = 'dQw4w9WgXcQ';
  const cases: Array<[string, string | null]> = [
    [`https://www.youtube.com/watch?v=${id}`, id],
    [`https://youtube.com/watch?feature=share&v=${id}&t=2`, id],
    [`https://youtu.be/${id}?si=abc`, id],
    [`https://www.youtube.com/shorts/${id}`, id],
    [`https://m.youtube.com/shorts/${id}/`, id],
    ['https://www.youtube.com/watch?v=short', null],
    ['https://youtu.be/dQw4w9WgXcQx', null],
    [`https://example.com/watch?v=${id}`, null],
    ['not a url', null],
  ];
  for (const [url, expected] of cases) {
    assert.equal(extractYouTubeVideoId(url), expected, url);
  }
});

test('YouTube public refresh uses the fetch seam and fails loud without its key', async () => {
  const restoreKey = setEnv('YOUTUBE_API_KEY', 'manual-stats-key');
  try {
    await withTempConfig(async (dir, mutable) => {
      const kitDir = await writeKit(dir);
      const postUrl = 'https://youtu.be/dQw4w9WgXcQ';
      await registerManualPost(kitDir, 'youtube-shorts', postUrl);
      const calls: string[] = [];
      setFetch((async (input) => {
        calls.push(inputUrl(input));
        return jsonResponse({
          items: [{
            id: 'dQw4w9WgXcQ',
            statistics: { viewCount: '4321', likeCount: '210', commentCount: '19' },
          }],
        });
      }) as FetchFn);

      assert.deepEqual(await refreshManualPostStats(), { refreshed: 1, skipped: 0 });
      assert.equal(calls.length, 1);
      const url = new URL(calls[0]!);
      assert.equal(url.searchParams.get('part'), 'statistics');
      assert.equal(url.searchParams.get('id'), 'dQw4w9WgXcQ');
      assert.equal(url.searchParams.get('key'), 'manual-stats-key');
      const [outcome] = await readJsonl(join(dir, 'outcomes.jsonl'));
      assert.equal(outcome?.views, 4321);
      assert.equal(outcome?.likes, 210);
      assert.equal(outcome?.comments, 19);
      assert.deepEqual(outcome?.contentFeatures, {
        ...contentFeatures,
        platform: 'youtube-shorts',
      });

      delete process.env.YOUTUBE_API_KEY;
      await assert.rejects(refreshManualPostStats(), /YOUTUBE_API_KEY/);
      assert.equal(calls.length, 1, 'key validation must happen before fetch');

      process.env.YOUTUBE_API_KEY = 'manual-stats-key';
      mutable.dryRun = true;
      await assert.rejects(refreshManualPostStats(), /zero network in DRY_RUN/);
      assert.equal(calls.length, 1, 'DRY_RUN must happen before fetch');
    }, false);
  } finally {
    restoreKey();
  }
});

test('/track records locally, replies to the approver, and ignores other chats', async () => {
  await withTempConfig(async (dir) => {
    const kitDir = await writeKit(dir);
    const postUrl = 'https://example.com/telegram-post';
    await registerManualPost(kitDir, 'instagram-reels', postUrl);

    const calls: Array<{ method: string; body: Record<string, unknown> }> = [];
    setTelegramFetch((async (input, init) => {
      const url = inputUrl(input);
      const method = url.slice(url.lastIndexOf('/') + 1);
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      calls.push({ method, body });
      if (method === 'getUpdates') {
        return jsonResponse({
          ok: true,
          result: [
            {
              update_id: 1,
              message: {
                text: `/track ${postUrl} 9999`,
                chat: { id: 'intruder-chat' },
                from: { username: 'intruder' },
              },
            },
            {
              update_id: 2,
              message: {
                text: `/track ${postUrl} 1.5`,
                chat: { id: 'approver-chat' },
                from: { username: 'operator' },
              },
            },
            {
              update_id: 3,
              message: {
                text: `/track ${postUrl} 2468`,
                chat: { id: 'approver-chat' },
                from: { username: 'operator' },
              },
            },
          ],
        });
      }
      return jsonResponse({ ok: true, result: true });
    }) as TelegramFetchFn);

    await pollCommandsOnce({ dir, timeoutSec: 0 });

    const replies = calls
      .filter((call) => call.method === 'sendMessage')
      .map((call) => call.body.text);
    assert.deepEqual(replies, [
      'views must be a non-negative finite integer',
      `recorded: 2468 views for ${postUrl}`,
    ]);
    const outcomes = await readJsonl(join(dir, 'outcomes.jsonl'));
    assert.equal(outcomes.length, 1, 'the non-approver update must not record an outcome');
    assert.equal(outcomes[0]?.views, 2468);
  }, false);
});
