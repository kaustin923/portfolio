/**
 * Monitor agent — closes the loop.
 *
 * After publishing, it pulls per-post metrics from each platform's analytics
 * API and appends them to local run state. Those numbers are the feedback
 * signal that makes the Trend Scout smarter over time: which domains, stages,
 * and recommendations actually converted into views.
 *
 * Two files are written under `config.dataDir` (one JSON object per line):
 *
 *   metrics.jsonl   — raw {@link PostMetrics}, exactly as captured.
 *   outcomes.jsonl  — {@link TopicOutcome}: the same metrics ENRICHED with the
 *                     forecast context (`domains`, `stage`, `recommendation`,
 *                     `opportunityScore`) so a metric line can be joined back
 *                     to what the forecaster believed when it picked the topic.
 *                     `src/learning.ts` aggregates this file into a summary
 *                     that gets injected into the forecaster's prompt.
 *
 * DRY_RUN returns deterministic mock metrics (hash-derived from the post id,
 * no `Math.random`) so tests are stable and fully offline. Live analytics
 * fetches are clearly-marked stubs guarded by `!config.dryRun`.
 */

import { appendFile, mkdir } from 'node:fs/promises';
import { config } from '../config.js';
import type {
  Platform,
  PostMetrics,
  PublishResult,
  Recommendation,
  Topic,
  TrendStage,
} from '../types.js';

// ────────────────────────────────────────────────────────────────────────────
// Outcome schema — the join between performance and forecast
// ────────────────────────────────────────────────────────────────────────────

/**
 * One published post's metrics tied back to the topic forecast that produced
 * it. This is the unit the learning loop aggregates over.
 */
export interface TopicOutcome extends PostMetrics {
  topicId: string;
  topicTitle: string;
  /** Content verticals the forecaster assigned (a post can count toward several). */
  domains: string[];
  /** Where on the hype curve the forecaster believed the topic was. */
  stage: TrendStage;
  /** What the forecaster told us to do about it. */
  recommendation: Recommendation;
  /** The forecaster's 0–100 composite score at publish time. */
  opportunityScore: number;
}

const metricsFile = (): string => `${config.dataDir}metrics.jsonl`;
const outcomesFile = (): string => `${config.dataDir}outcomes.jsonl`;

async function appendJsonl(file: string, records: readonly unknown[]): Promise<void> {
  if (records.length === 0) return;
  try {
    await mkdir(config.dataDir, { recursive: true });
    await appendFile(file, records.map((r) => JSON.stringify(r) + '\n').join(''));
  } catch {
    /* best-effort logging — analytics must never crash the pipeline */
  }
}

// ────────────────────────────────────────────────────────────────────────────
// DRY_RUN — deterministic mock metrics
// ────────────────────────────────────────────────────────────────────────────

/** FNV-1a 32-bit hash — tiny, dependency-free, stable across runs. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Deterministic mock metrics: every number is derived from a hash of
 * `platform:postId`, so the same post always yields the same metrics.
 * Engagement counts are realistic fractions of views (likes ≈ 3–8%,
 * comments ≈ 0.2–1.2%, shares ≈ 0.1–0.9%).
 */
function mockMetrics(postId: string, platform: Platform, capturedAt: string): PostMetrics {
  const h = fnv1a(`${platform}:${postId}`);
  const views = 500 + (h % 9500);
  return {
    postId,
    platform,
    views,
    likes: Math.floor(views * (0.03 + ((h >>> 8) % 50) / 1000)),
    comments: Math.floor(views * (0.002 + ((h >>> 16) % 10) / 1000)),
    shares: Math.floor(views * (0.001 + ((h >>> 24) % 8) / 1000)),
    capturedAt,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// LIVE analytics stubs — only reachable when `!config.dryRun`
// ────────────────────────────────────────────────────────────────────────────

type EngagementStats = Pick<PostMetrics, 'views' | 'likes' | 'comments' | 'shares'>;

const EMPTY_STATS: EngagementStats = { views: 0, likes: 0, comments: 0, shares: 0 };

/**
 * LIVE STUB — YouTube Data API v3 `videos.list`.
 *
 * TODO(live): GET https://www.googleapis.com/youtube/v3/videos
 *   ?part=statistics&id=<videoId>&key=<config.apiKeys.youtube>
 * and map `statistics.{viewCount,likeCount,commentCount}` into
 * {@link EngagementStats} (YouTube does not expose shares; keep 0).
 */
async function fetchYouTubeVideoStats(videoId: string): Promise<EngagementStats> {
  void videoId;
  console.warn('  ⚠️ monitor: YouTube analytics not implemented yet — recording zeros');
  return EMPTY_STATS;
}

/**
 * LIVE STUB — TikTok Display API `/v2/video/query/` (fields:
 * view_count,like_count,comment_count,share_count), OAuth user token required.
 */
async function fetchTikTokVideoStats(videoId: string): Promise<EngagementStats> {
  void videoId;
  console.warn('  ⚠️ monitor: TikTok analytics not implemented yet — recording zeros');
  return EMPTY_STATS;
}

/**
 * LIVE STUB — Instagram Graph API `GET /{ig-media-id}/insights`
 * (metrics: views,likes,comments,shares), page access token required.
 */
async function fetchInstagramMediaStats(mediaId: string): Promise<EngagementStats> {
  void mediaId;
  console.warn('  ⚠️ monitor: Instagram analytics not implemented yet — recording zeros');
  return EMPTY_STATS;
}

/**
 * LIVE STUB — X API v2 `GET /2/tweets/:id?tweet.fields=public_metrics`
 * (impression_count,like_count,reply_count,retweet_count).
 */
async function fetchXPostStats(tweetId: string): Promise<EngagementStats> {
  void tweetId;
  console.warn('  ⚠️ monitor: X analytics not implemented yet — recording zeros');
  return EMPTY_STATS;
}

/** Dispatch a live analytics fetch to the right platform stub. */
async function fetchLiveStats(postId: string, platform: Platform): Promise<EngagementStats> {
  switch (platform) {
    case 'youtube-shorts':
      return fetchYouTubeVideoStats(postId);
    case 'tiktok':
      return fetchTikTokVideoStats(postId);
    case 'instagram-reels':
      return fetchInstagramMediaStats(postId);
    case 'x':
      return fetchXPostStats(postId);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

/**
 * Capture metrics for a batch of publish results and append them to
 * `metrics.jsonl`. When the {@link Topic} that produced the posts is passed,
 * the same metrics are also recorded as enriched {@link TopicOutcome} lines
 * (see {@link recordTopicOutcome}) so the learning loop can join performance
 * back to the forecast.
 */
export async function trackResults(
  results: PublishResult[],
  topic?: Topic,
): Promise<PostMetrics[]> {
  const published = results.filter((r) => r.status === 'published' && r.postId);
  const capturedAt = new Date().toISOString();

  const metrics: PostMetrics[] = [];
  for (const r of published) {
    const postId = r.postId as string; // filtered above; strict-safe narrowing
    if (config.dryRun) {
      metrics.push(mockMetrics(postId, r.platform, capturedAt));
    } else {
      const stats = await fetchLiveStats(postId, r.platform);
      metrics.push({ postId, platform: r.platform, ...stats, capturedAt });
    }
  }

  // Persist so the Trend Scout can learn from what actually performed.
  await appendJsonl(metricsFile(), metrics);

  if (topic) await recordTopicOutcome(topic, metrics);

  return metrics;
}

/**
 * Associate captured metrics with the topic forecast that produced them and
 * append the enriched records to `outcomes.jsonl`. Returns the records so
 * callers can use them without re-reading the file.
 */
export async function recordTopicOutcome(
  topic: Topic,
  metrics: PostMetrics[],
): Promise<TopicOutcome[]> {
  const outcomes: TopicOutcome[] = metrics.map((m) => ({
    ...m,
    topicId: topic.id,
    topicTitle: topic.title,
    domains: [...topic.domains],
    stage: topic.stage,
    recommendation: topic.recommendation,
    opportunityScore: topic.opportunityScore,
  }));

  await appendJsonl(outcomesFile(), outcomes);
  return outcomes;
}
