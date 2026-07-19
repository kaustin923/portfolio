/**
 * Monitor agent — closes the loop.
 *
 * After publishing, it periodically pulls per-post metrics from each platform's
 * analytics API and appends them to local run state. Those numbers are the
 * feedback signal that makes the Trend Scout smarter over time: which domains,
 * angles, and momentum profiles actually converted into views.
 *
 * Live analytics clients are scaffolded per platform; DRY_RUN uses stable mock
 * metrics so local runs exercise the learning path without adding noise.
 */

import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../config.js';
import type {
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
}

type EngagementStats = Pick<PostMetrics, 'views' | 'likes' | 'comments' | 'shares'>;

const EMPTY_STATS: EngagementStats = {
  views: 0,
  likes: 0,
  comments: 0,
  shares: 0,
};

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

async function fetchYouTubeStats(_postId: string): Promise<EngagementStats> {
  // TODO: GET https://www.googleapis.com/youtube/v3/videos?part=statistics&id=<videoId>&key=<apiKey>
  // Map statistics.viewCount/likeCount/commentCount; shares is not exposed.
  console.warn('[monitor:youtube-shorts] analytics not implemented yet — recording zeros');
  return EMPTY_STATS;
}

async function fetchTikTokStats(_postId: string): Promise<EngagementStats> {
  // TODO: Display API POST /v2/video/query/ with view_count, like_count,
  // comment_count, and share_count fields using an OAuth user token.
  console.warn('[monitor:tiktok] analytics not implemented yet — recording zeros');
  return EMPTY_STATS;
}

async function fetchInstagramStats(_postId: string): Promise<EngagementStats> {
  // TODO: Graph API GET /{ig-media-id}/insights with views, likes, comments,
  // and shares metrics using a page access token.
  console.warn('[monitor:instagram-reels] analytics not implemented yet — recording zeros');
  return EMPTY_STATS;
}

async function fetchXStats(_postId: string): Promise<EngagementStats> {
  // TODO: GET /2/tweets/:id?tweet.fields=public_metrics and map
  // impression_count, like_count, reply_count, and retweet_count.
  console.warn('[monitor:x] analytics not implemented yet — recording zeros');
  return EMPTY_STATS;
}

async function fetchLiveStats(postId: string, platform: Platform): Promise<EngagementStats> {
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
): Promise<TopicOutcome[]> {
  const outcomes = metrics.map((metric) => ({
    ...metric,
    topicId: topic.id,
    topicTitle: topic.title,
    domains: [...topic.domains],
    stage: topic.stage,
    recommendation: topic.recommendation,
    opportunityScore: topic.opportunityScore,
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
    let stats: EngagementStats;
    try {
      stats = await fetchLiveStats(postId, result.platform);
    } catch (err) {
      console.warn(`[monitor:${result.platform}] analytics failed — recording zeros:`, err);
      stats = EMPTY_STATS;
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

  if (topic) await recordTopicOutcome(topic, metrics);

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
