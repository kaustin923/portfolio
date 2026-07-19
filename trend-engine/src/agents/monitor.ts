/**
 * Monitor agent — closes the loop.
 *
 * After publishing, it periodically pulls per-post metrics from each platform's
 * analytics API and appends them to local run state. Those numbers are the
 * feedback signal that makes the Trend Scout smarter over time: which domains,
 * angles, and momentum profiles actually converted into views.
 *
 * Stubbed for now — returns mock metrics in DRY_RUN and records them to disk.
 */

import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../config.js';
import type { PostMetrics, PublishResult } from '../types.js';

export async function trackResults(results: PublishResult[]): Promise<PostMetrics[]> {
  const published = results.filter((r) => r.status === 'published' && r.postId);

  const metrics: PostMetrics[] = published.map((r) => ({
    postId: r.postId!,
    platform: r.platform,
    // DRY_RUN placeholders. Live: call each platform's analytics endpoint.
    views: config.dryRun ? Math.floor(Math.random() * 10000) : 0,
    likes: 0,
    comments: 0,
    shares: 0,
    capturedAt: new Date().toISOString(),
  }));

  // Persist so the Trend Scout can learn from what actually performed.
  try {
    await mkdir(config.dataDir, { recursive: true });
    for (const m of metrics) {
      await appendFile(`${config.dataDir}metrics.jsonl`, JSON.stringify(m) + '\n');
    }
  } catch (err) {
    console.warn('[monitor] failed to persist metrics:', err);
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
