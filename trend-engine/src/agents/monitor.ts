/**
 * Monitor agent — closes the loop.
 *
 * After publishing, it periodically pulls per-post metrics from each platform's
 * analytics API and appends them to local run state. Those numbers are the
 * feedback signal that makes the Trend Scout smarter over time: which domains,
 * angles, and momentum profiles actually converted into views.
 *
 * Live analytics clients query each platform; DRY_RUN uses stable mock metrics
 * so local runs exercise the learning path without adding noise.
 */

import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../config.js';
import { deriveContentFeatures } from '../learning.js';
import { expectJson, getFetch, requireEnv, sleep } from '../publish/http.js';
import type {
  ClipDraft,
  ContentFeatures,
  Platform,
  PostMetrics,
  PublishResult,
  Recommendation,
  Topic,
  TrendStage,
} from '../types.js';

export interface TopicOutcome extends PostMetrics {
  topicId: string;
  topicTitle: string;
  domains: string[];
  stage: TrendStage;
  recommendation: Recommendation;
  opportunityScore: number;
  contentFeatures?: ContentFeatures;
}

type EngagementStats = Pick<PostMetrics, 'views' | 'likes' | 'comments' | 'shares'>;

interface YouTubeTokenResponse {
  access_token?: string;
}

interface YouTubeStatsResponse {
  items?: Array<{
    statistics?: {
      viewCount?: string | number;
      likeCount?: string | number;
      commentCount?: string | number;
    };
  }>;
}

interface TikTokStatsResponse {
  data?: {
    videos?: Array<{
      view_count?: number | string;
      like_count?: number | string;
      comment_count?: number | string;
      share_count?: number | string;
    }>;
  };
}

interface InstagramStatsResponse {
  data?: Array<{
    name?: string;
    values?: Array<{ value?: number | string }>;
  }>;
}

interface XStatsResponse {
  data?: {
    public_metrics?: {
      impression_count?: number | string;
      like_count?: number | string;
      reply_count?: number | string;
      retweet_count?: number | string;
    };
  };
}

async function fetchJsonWithRetry<T>(
  request: () => Promise<Response>,
  context: string,
): Promise<T> {
  let firstResponse: Response;
  try {
    firstResponse = await request();
  } catch {
    await sleep(1_000);
    return expectJson<T>(await request(), context);
  }

  const retryableStatus = firstResponse.status === 429 || firstResponse.status >= 500;
  if (!retryableStatus) {
    try {
      return await expectJson<T>(firstResponse, context);
    } catch (err) {
      if (!firstResponse.ok) throw err;
      await sleep(1_000);
      return expectJson<T>(await request(), context);
    }
  }

  await sleep(1_000);
  return expectJson<T>(await request(), context);
}

function count(value: unknown): number {
  return Number(value) || 0;
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function mockMetrics(postId: string, platform: Platform, capturedAt: string): PostMetrics {
  const hash = fnv1a(`${platform}:${postId}`);
  const views = 500 + (hash % 9500);
  return {
    postId,
    platform,
    views,
    likes: Math.floor(views * (0.03 + ((hash >>> 8) % 50) / 1000)),
    comments: Math.floor(views * (0.002 + ((hash >>> 16) % 10) / 1000)),
    shares: Math.floor(views * (0.001 + ((hash >>> 24) % 8) / 1000)),
    capturedAt,
  };
}

async function fetchYouTubeStats(postId: string): Promise<EngagementStats | null> {
  const fetch = getFetch();
  const apiKey = config.apiKeys.youtube.trim();
  let authorization: string | undefined;

  if (!apiKey) {
    // requireEnv's publishing-oriented wording is shared with every live API adapter.
    const env = requireEnv('YouTube analytics', [
      'YOUTUBE_CLIENT_ID',
      'YOUTUBE_CLIENT_SECRET',
      'YOUTUBE_REFRESH_TOKEN',
    ]);
    const tokenBody = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: env.YOUTUBE_CLIENT_ID!,
      client_secret: env.YOUTUBE_CLIENT_SECRET!,
      refresh_token: env.YOUTUBE_REFRESH_TOKEN!,
    });
    const tokenJson = await fetchJsonWithRetry<YouTubeTokenResponse>(
      () =>
        fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: tokenBody,
        }),
      '[monitor:youtube-shorts] token refresh',
    );
    if (!tokenJson.access_token) {
      throw new Error('[monitor:youtube-shorts] token refresh response missing access_token');
    }
    authorization = `Bearer ${tokenJson.access_token}`;
  }

  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part', 'statistics');
  url.searchParams.set('id', postId);
  if (apiKey) url.searchParams.set('key', apiKey);

  const json = await fetchJsonWithRetry<YouTubeStatsResponse>(
    () =>
      fetch(url, {
        ...(authorization ? { headers: { Authorization: authorization } } : {}),
      }),
    '[monitor:youtube-shorts] stats fetch',
  );
  const statistics = json.items?.[0]?.statistics;
  if (!statistics) return null;

  const views = count(statistics.viewCount);
  if (views <= 0) return null;
  return {
    views,
    likes: count(statistics.likeCount),
    comments: count(statistics.commentCount),
    shares: 0,
  };
}

async function fetchTikTokStats(postId: string): Promise<EngagementStats | null> {
  // requireEnv's publishing-oriented wording is shared with every live API adapter.
  const env = requireEnv('TikTok analytics', ['TIKTOK_ACCESS_TOKEN']);
  const fetch = getFetch();
  const json = await fetchJsonWithRetry<TikTokStatsResponse>(
    () => fetch(
      'https://open.tiktokapis.com/v2/video/query/?fields=id,view_count,like_count,comment_count,share_count',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.TIKTOK_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filters: { video_ids: [postId] } }),
      },
    ),
    '[monitor:tiktok] stats fetch',
  );
  const video = json.data?.videos?.[0];
  if (!video) return null;

  const views = count(video.view_count);
  if (views <= 0) return null;
  return {
    views,
    likes: count(video.like_count),
    comments: count(video.comment_count),
    shares: count(video.share_count),
  };
}

async function fetchInstagramStats(postId: string): Promise<EngagementStats | null> {
  // requireEnv's publishing-oriented wording is shared with every live API adapter.
  const env = requireEnv('Instagram analytics', ['IG_ACCESS_TOKEN']);
  const fetch = getFetch();
  const url =
    `https://graph.facebook.com/v23.0/${encodeURIComponent(postId)}/insights` +
    '?metric=views,likes,comments,shares';
  const json = await fetchJsonWithRetry<InstagramStatsResponse>(
    () => fetch(url, { headers: { Authorization: `Bearer ${env.IG_ACCESS_TOKEN}` } }),
    '[monitor:instagram-reels] stats fetch',
  );
  if (!json.data || json.data.length === 0) return null;

  const values = new Map(
    json.data.map((metric) => [metric.name, metric.values?.[0]?.value]),
  );
  const views = count(values.get('views'));
  if (views <= 0) return null;
  return {
    views,
    likes: count(values.get('likes')),
    comments: count(values.get('comments')),
    shares: count(values.get('shares')),
  };
}

async function fetchXStats(postId: string): Promise<EngagementStats | null> {
  // requireEnv's publishing-oriented wording is shared with every live API adapter.
  const env = requireEnv('X analytics', ['X_ACCESS_TOKEN']);
  const fetch = getFetch();
  const json = await fetchJsonWithRetry<XStatsResponse>(
    () => fetch(
      `https://api.x.com/2/tweets/${encodeURIComponent(postId)}?tweet.fields=public_metrics`,
      { headers: { Authorization: `Bearer ${env.X_ACCESS_TOKEN}` } },
    ),
    '[monitor:x] stats fetch',
  );
  const publicMetrics = json.data?.public_metrics;
  if (!publicMetrics) return null;

  const views = count(publicMetrics.impression_count);
  if (views <= 0) return null;
  return {
    views,
    likes: count(publicMetrics.like_count),
    comments: count(publicMetrics.reply_count),
    shares: count(publicMetrics.retweet_count),
  };
}

async function fetchLiveStats(
  postId: string,
  platform: Platform,
): Promise<EngagementStats | null> {
  switch (platform) {
    case 'youtube-shorts':
      return fetchYouTubeStats(postId);
    case 'tiktok':
      return fetchTikTokStats(postId);
    case 'instagram-reels':
      return fetchInstagramStats(postId);
    case 'x':
      return fetchXStats(postId);
  }
}

export async function recordTopicOutcome(
  topic: Topic,
  metrics: PostMetrics[],
  features?: Omit<ContentFeatures, 'platform' | 'postHourLocal'> & { postHourLocal?: number },
): Promise<TopicOutcome[]> {
  const outcomes = metrics.map((metric) => ({
    ...metric,
    topicId: topic.id,
    topicTitle: topic.title,
    domains: [...topic.domains],
    stage: topic.stage,
    recommendation: topic.recommendation,
    opportunityScore: topic.opportunityScore,
    ...(features
      ? {
          contentFeatures: {
            ...features,
            platform: metric.platform,
            // Manual posts carry the kit's registered posting hour; only fall
            // back to the capture hour when the caller supplied none (the
            // automated publish path, where capture happens at post time).
            postHourLocal: features.postHourLocal ?? new Date(metric.capturedAt).getHours(),
          },
        }
      : {}),
  }));

  try {
    await mkdir(config.dataDir, { recursive: true });
    for (const outcome of outcomes) {
      await appendFile(`${config.dataDir}outcomes.jsonl`, `${JSON.stringify(outcome)}\n`);
    }
  } catch (err) {
    console.warn('[monitor] failed to persist topic outcomes:', err);
  }

  return outcomes;
}

export async function trackResults(
  results: PublishResult[],
  topic?: Topic,
  opts?: { draft?: ClipDraft; tier?: string | null },
): Promise<PostMetrics[]> {
  const published = results.filter((result) => result.status === 'published' && result.postId);
  const capturedAt = new Date().toISOString();
  const metrics: PostMetrics[] = [];

  for (const result of published) {
    const postId = result.postId!;
    if (config.dryRun) {
      metrics.push(mockMetrics(postId, result.platform, capturedAt));
      continue;
    }
    let stats: EngagementStats | null;
    try {
      stats = await fetchLiveStats(postId, result.platform);
    } catch (err) {
      console.warn(
        `[monitor:${result.platform}] analytics failed — skipping outcome record:`,
        err,
      );
      continue;
    }
    if (stats === null) {
      console.warn(
        `[monitor:${result.platform}] analytics returned no usable data — skipping outcome record`,
      );
      continue;
    }
    metrics.push({ postId, platform: result.platform, ...stats, capturedAt });
  }

  // Persist so the Trend Scout can learn from what actually performed.
  try {
    await mkdir(config.dataDir, { recursive: true });
    for (const m of metrics) {
      await appendFile(`${config.dataDir}metrics.jsonl`, JSON.stringify(m) + '\n');
    }
  } catch (err) {
    console.warn('[monitor] failed to persist metrics:', err);
  }

  if (topic) {
    const features = opts?.draft && metrics[0]
      ? {
          ...deriveContentFeatures({
            draft: opts.draft,
            tier: opts.tier,
            topicAngle: topic.suggestedAngle,
          }),
          postHourLocal: new Date(metrics[0].capturedAt).getHours(),
        }
      : undefined;
    await recordTopicOutcome(topic, metrics, features);
  }

  return metrics;
}

function isPostMetrics(value: unknown): value is PostMetrics {
  if (!value || typeof value !== 'object') return false;
  const metric = value as Partial<PostMetrics>;
  return (
    typeof metric.postId === 'string' &&
    typeof metric.platform === 'string' &&
    typeof metric.views === 'number' &&
    typeof metric.likes === 'number' &&
    typeof metric.comments === 'number' &&
    typeof metric.shares === 'number' &&
    typeof metric.capturedAt === 'string'
  );
}

export async function readMetrics(dir = config.dataDir): Promise<PostMetrics[]> {
  let raw: string;
  try {
    raw = await readFile(join(dir, 'metrics.jsonl'), 'utf8');
  } catch (err) {
    if (typeof err === 'object' && err !== null && 'code' in err && err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }

  const metrics: PostMetrics[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (isPostMetrics(parsed)) metrics.push(parsed);
    } catch {
      // A partial/corrupt line should not hide the rest of the metrics history.
    }
  }
  return metrics;
}

export function summarizePerformance(metrics: PostMetrics[]): string | null {
  const live = metrics.filter((metric) => !metric.postId.startsWith('dryrun-'));
  if (live.length === 0) return null;

  const byPlatform = new Map<string, { count: number; views: number }>();
  for (const metric of live) {
    const aggregate = byPlatform.get(metric.platform) ?? { count: 0, views: 0 };
    aggregate.count++;
    aggregate.views += metric.views;
    byPlatform.set(metric.platform, aggregate);
  }

  const lines = ['Performance by platform:'];
  for (const [platform, aggregate] of [...byPlatform].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(
      `- ${platform}: ${aggregate.count} posts, ${aggregate.views} total views, ` +
        `${Math.round(aggregate.views / aggregate.count)} avg views`,
    );
  }

  lines.push('Top posts by views:');
  for (const metric of [...live].sort((a, b) => b.views - a.views).slice(0, 3)) {
    lines.push(`- ${metric.platform} ${metric.postId}: ${metric.views} views`);
  }
  return lines.join('\n');
}

// ─── manual-post stats refresh [owned by task manual-era-tracking] ───
export async function refreshManualPostStats(): Promise<{
  refreshed: number;
  skipped: number;
}> {
  if (config.dryRun) {
    throw new Error(
      'refresh requires live mode (DRY_RUN=0) and YOUTUBE_API_KEY — zero network in DRY_RUN',
    );
  }

  const env = requireEnv('YouTube manual-post stats', ['YOUTUBE_API_KEY']);
  const fetch = getFetch();
  const { readManualPosts, recordManualOutcome } = await import('../manualPosts.js');
  const registered = await readManualPosts();
  const candidates = registered.filter(
    (post) => post.platform === 'youtube-shorts' || post.videoId !== null,
  );
  const postsByVideoId = new Map<string, typeof candidates>();
  let skipped = 0;

  for (const post of candidates) {
    if (post.videoId === null) {
      console.warn(`[monitor:manual-post] missing YouTube video id — skipping ${post.postUrl}`);
      skipped += 1;
      continue;
    }
    const posts = postsByVideoId.get(post.videoId) ?? [];
    posts.push(post);
    postsByVideoId.set(post.videoId, posts);
  }

  let refreshed = 0;
  const videoIds = [...postsByVideoId.keys()];
  for (let index = 0; index < videoIds.length; index += 50) {
    const batch = videoIds.slice(index, index + 50);
    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.searchParams.set('part', 'statistics');
    url.searchParams.set('id', batch.join(','));
    url.searchParams.set('key', env.YOUTUBE_API_KEY!);
    const json = await fetchJsonWithRetry<{
      items?: Array<{
        id?: string;
        statistics?: {
          viewCount?: string | number;
          likeCount?: string | number;
          commentCount?: string | number;
        };
      }>;
    }>(
      () => fetch(url),
      '[monitor:manual-post] YouTube public stats fetch',
    );
    const statsByVideoId = new Map(
      (json.items ?? [])
        .filter((item): item is typeof item & { id: string } => typeof item.id === 'string')
        .map((item) => [item.id, item.statistics] as const),
    );

    for (const videoId of batch) {
      const statistics = statsByVideoId.get(videoId);
      const views = count(statistics?.viewCount);
      for (const post of postsByVideoId.get(videoId) ?? []) {
        if (!statistics || views <= 0) {
          console.warn(`[monitor:manual-post] no usable stats — skipping ${post.postUrl}`);
          skipped += 1;
          continue;
        }
        await recordManualOutcome(
          post.postUrl,
          views,
          count(statistics.likeCount),
          count(statistics.commentCount),
        );
        refreshed += 1;
      }
    }
  }

  return { refreshed, skipped };
}
// ─── end manual-post stats refresh ───
