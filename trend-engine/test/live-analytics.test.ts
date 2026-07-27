import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { test } from 'node:test';

import { trackResults, type TopicOutcome } from '../src/agents/monitor.js';
import { config } from '../src/config.js';
import { getLearningSummary, NO_HISTORY_SUMMARY } from '../src/learning.js';
import { resetFetch, setFetch, type FetchFn } from '../src/publish/http.js';
import type { Platform, PostMetrics, Topic } from '../src/types.js';

interface MutableConfig {
  dataDir: string;
  dryRun: boolean;
  apiKeys: { youtube: string };
}

interface FetchCall {
  url: string;
  init?: RequestInit;
}

const topic: Topic = {
  id: 'live-analytics-topic',
  title: 'Live analytics topic',
  summary: 'A test topic',
  whyTrending: 'Tests exercise the learning loop',
  momentum: 'rising',
  longevity: 'sustained',
  stage: 'rising',
  leadTimeDays: 2,
  postWindow: 'now',
  catalyst: null,
  recommendation: 'post-now',
  domains: ['real-domain'],
  suggestedAngle: 'Explain the metrics',
  saturationRisk: 'low',
  opportunityScore: 91,
  contributingSources: ['mock'],
};

function jsonResponse(value: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function inputUrl(input: string | URL | Request): string {
  return typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
}

async function withConfig<T>(
  dryRun: boolean,
  run: (dir: string) => Promise<T>,
  youtubeApiKey = config.apiKeys.youtube,
): Promise<T> {
  const mutableConfig = config as unknown as MutableConfig;
  const originalDataDir = mutableConfig.dataDir;
  const originalDryRun = mutableConfig.dryRun;
  const originalYouTubeApiKey = mutableConfig.apiKeys.youtube;
  const dir = await mkdtemp(join(tmpdir(), 'trend-engine-live-analytics-'));
  mutableConfig.dataDir = `${dir}${sep}`;
  mutableConfig.dryRun = dryRun;
  mutableConfig.apiKeys.youtube = youtubeApiKey;

  try {
    return await run(dir);
  } finally {
    resetFetch();
    mutableConfig.dataDir = originalDataDir;
    mutableConfig.dryRun = originalDryRun;
    mutableConfig.apiKeys.youtube = originalYouTubeApiKey;
    await rm(dir, { recursive: true, force: true });
  }
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

function outcome(overrides: Partial<TopicOutcome> = {}): TopicOutcome {
  return {
    postId: 'real-learning-post',
    platform: 'tiktok',
    views: 2500,
    likes: 200,
    comments: 30,
    shares: 20,
    capturedAt: '2026-07-19T12:00:00.000Z',
    topicId: 'topic-real',
    topicTitle: 'Real learning topic',
    domains: ['real-domain'],
    stage: 'rising',
    recommendation: 'post-now',
    opportunityScore: 90,
    ...overrides,
  };
}

test('live analytics maps YouTube, TikTok, Instagram, and X engagement fields', async () => {
  const restoreTikTok = setEnv('TIKTOK_ACCESS_TOKEN', 'tiktok-token');
  const restoreInstagram = setEnv('IG_ACCESS_TOKEN', 'instagram-token');
  const restoreX = setEnv('X_ACCESS_TOKEN', 'x-token');

  try {
    await withConfig(false, async () => {
      const calls: FetchCall[] = [];
      const fakeFetch: FetchFn = async (input, init) => {
        const call = { url: inputUrl(input), init };
        calls.push(call);
        if (call.url.startsWith('https://www.googleapis.com/youtube/v3/videos')) {
          return jsonResponse({
            items: [
              { statistics: { viewCount: '1200', likeCount: '80', commentCount: '12' } },
            ],
          });
        }
        if (call.url.startsWith('https://open.tiktokapis.com/v2/video/query/')) {
          return jsonResponse({
            data: {
              videos: [
                { view_count: 2300, like_count: 190, comment_count: 31, share_count: 24 },
              ],
            },
          });
        }
        if (call.url.startsWith('https://graph.facebook.com/v23.0/')) {
          return jsonResponse({
            data: [
              { name: 'views', values: [{ value: 3400 }] },
              { name: 'likes', values: [{ value: 280 }] },
              { name: 'comments', values: [{ value: 42 }] },
              { name: 'shares', values: [{ value: 35 }] },
            ],
          });
        }
        if (call.url.startsWith('https://api.x.com/2/tweets/')) {
          return jsonResponse({
            data: {
              public_metrics: {
                impression_count: 4500,
                like_count: 370,
                reply_count: 53,
                retweet_count: 46,
              },
            },
          });
        }
        throw new Error(`Unexpected fetch call: ${call.url}`);
      };
      setFetch(fakeFetch);

      const expected: Array<[Platform, PostMetrics]> = [
        [
          'youtube-shorts',
          {
            postId: 'youtube-post',
            platform: 'youtube-shorts',
            views: 1200,
            likes: 80,
            comments: 12,
            shares: 0,
            capturedAt: '',
          },
        ],
        [
          'tiktok',
          {
            postId: 'tiktok-post',
            platform: 'tiktok',
            views: 2300,
            likes: 190,
            comments: 31,
            shares: 24,
            capturedAt: '',
          },
        ],
        [
          'instagram-reels',
          {
            postId: 'instagram-reels-post',
            platform: 'instagram-reels',
            views: 3400,
            likes: 280,
            comments: 42,
            shares: 35,
            capturedAt: '',
          },
        ],
        [
          'x',
          {
            postId: 'x-post',
            platform: 'x',
            views: 4500,
            likes: 370,
            comments: 53,
            shares: 46,
            capturedAt: '',
          },
        ],
      ];

      for (const [platform, metric] of expected) {
        const [actual] = await trackResults([
          { platform, status: 'published', postId: metric.postId },
        ]);
        assert.ok(actual);
        assert.deepEqual(
          { ...actual, capturedAt: '' },
          metric,
        );
      }

      assert.equal(calls.length, 4);
      assert.match(calls[0]?.url ?? '', /[?&]key=youtube-key(?:&|$)/);
      assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), {
        filters: { video_ids: ['tiktok-post'] },
      });
      assert.equal(
        new Headers(calls[1]?.init?.headers).get('Authorization'),
        'Bearer tiktok-token',
      );
      assert.match(calls[2]?.url ?? '', /graph\.facebook\.com\/v23\.0/);
      assert.equal(
        new Headers(calls[3]?.init?.headers).get('Authorization'),
        'Bearer x-token',
      );
    }, 'youtube-key');
  } finally {
    restoreTikTok();
    restoreInstagram();
    restoreX();
  }
});

test('live analytics failures and empty responses never poison either JSONL stream', async () => {
  const scenarios: Array<{
    name: string;
    response: () => Promise<Response>;
    expectedCalls: number;
  }> = [
    {
      name: 'network error',
      response: async () => {
        throw new Error('offline');
      },
      expectedCalls: 2,
    },
    {
      name: 'HTTP 500',
      response: async () => new Response('busy', { status: 500 }),
      expectedCalls: 2,
    },
    {
      name: 'empty items',
      response: async () => jsonResponse({ items: [] }),
      expectedCalls: 1,
    },
  ];

  for (const scenario of scenarios) {
    await withConfig(false, async (dir) => {
      let fetchCalls = 0;
      setFetch(async () => {
        fetchCalls += 1;
        return scenario.response();
      });
      const originalWarn = console.warn;
      console.warn = () => undefined;

      try {
        const metrics = await trackResults(
          [{ platform: 'youtube-shorts', status: 'published', postId: 'real-1' }],
          topic,
        );
        assert.deepEqual(metrics, [], scenario.name);
        assert.equal(fetchCalls, scenario.expectedCalls, scenario.name);
        assert.equal(existsSync(join(dir, 'metrics.jsonl')), false, scenario.name);
        assert.equal(existsSync(join(dir, 'outcomes.jsonl')), false, scenario.name);
      } finally {
        console.warn = originalWarn;
      }
    }, 'youtube-key');
  }
});

test('missing analytics environment fails loud and skips persistence', async () => {
  const restoreTikTok = setEnv('TIKTOK_ACCESS_TOKEN', undefined);

  try {
    await withConfig(false, async (dir) => {
      let fetchCalls = 0;
      setFetch(async () => {
        fetchCalls += 1;
        return jsonResponse({ data: { videos: [] } });
      });
      const warnings: unknown[][] = [];
      const originalWarn = console.warn;
      console.warn = (...args: unknown[]) => {
        warnings.push(args);
      };

      try {
        const metrics = await trackResults(
          [{ platform: 'tiktok', status: 'published', postId: 'real-1' }],
          topic,
        );
        assert.deepEqual(metrics, []);
        assert.equal(fetchCalls, 0);
        assert.ok(
          warnings.some((args) => args.map(String).join(' ').includes('TIKTOK_ACCESS_TOKEN')),
        );
        assert.equal(existsSync(join(dir, 'metrics.jsonl')), false);
        assert.equal(existsSync(join(dir, 'outcomes.jsonl')), false);
      } finally {
        console.warn = originalWarn;
      }
    });
  } finally {
    restoreTikTok();
  }
});

test('a transient analytics failure retries once and persists the recovered metrics', async () => {
  const restoreTikTok = setEnv('TIKTOK_ACCESS_TOKEN', 'retry-token');

  try {
    await withConfig(false, async (dir) => {
      let fetchCalls = 0;
      setFetch(async () => {
        fetchCalls += 1;
        if (fetchCalls === 1) return new Response('busy', { status: 500 });
        return jsonResponse({
          data: {
            videos: [
              { view_count: 9876, like_count: 765, comment_count: 54, share_count: 43 },
            ],
          },
        });
      });

      const metrics = await trackResults([
        { platform: 'tiktok', status: 'published', postId: 'retry-post' },
      ]);
      assert.equal(fetchCalls, 2);
      assert.deepEqual(
        metrics.map(({ capturedAt: _capturedAt, ...metric }) => metric),
        [
          {
            postId: 'retry-post',
            platform: 'tiktok',
            views: 9876,
            likes: 765,
            comments: 54,
            shares: 43,
          },
        ],
      );

      const lines = (await readFile(join(dir, 'metrics.jsonl'), 'utf8')).trim().split('\n');
      assert.equal(lines.length, 1);
      const persisted = JSON.parse(lines[0]!) as PostMetrics;
      assert.deepEqual(persisted, metrics[0]);
    });
  } finally {
    restoreTikTok();
  }
});

test('DRY_RUN keeps deterministic mock metrics and performs zero fetches', async () => {
  await withConfig(true, async () => {
    let fetchCalls = 0;
    setFetch(async () => {
      fetchCalls += 1;
      throw new Error('DRY_RUN attempted an analytics request');
    });
    const result = {
      platform: 'tiktok' as const,
      status: 'published' as const,
      postId: 'dryrun-tiktok-draft-1',
    };

    const first = await trackResults([result]);
    const second = await trackResults([result]);

    assert.equal(fetchCalls, 0);
    assert.equal(first[0]?.postId, 'dryrun-tiktok-draft-1');
    assert.ok((first[0]?.views ?? 0) > 0);
    assert.deepEqual(
      first.map(({ capturedAt: _capturedAt, ...metric }) => metric),
      second.map(({ capturedAt: _capturedAt, ...metric }) => metric),
    );
  });
});

test('learning summary ignores historical all-zero and dry-run outcomes', async () => {
  await withConfig(false, async (dir) => {
    const zero = outcome({
      postId: 'zero-live-post',
      domains: ['zero-domain'],
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
    });
    const real = outcome();
    const dryrun = outcome({ postId: 'dryrun-tiktok-old', views: 999_999 });
    const outcomesPath = join(dir, 'outcomes.jsonl');
    await writeFile(
      outcomesPath,
      `${JSON.stringify(zero)}\n${JSON.stringify(real)}\n${JSON.stringify(dryrun)}\n`,
    );

    const summary = await getLearningSummary();
    assert.match(summary, /Historical performance \(1 recorded posts, 2\.5k avg views\/post\)/);
    assert.match(summary, /'real-domain' 2\.5k/);
    assert.doesNotMatch(summary, /zero-domain/);

    await writeFile(outcomesPath, `${JSON.stringify(zero)}\n${JSON.stringify(dryrun)}\n`);
    assert.equal(await getLearningSummary(), NO_HISTORY_SUMMARY);
  });
});
