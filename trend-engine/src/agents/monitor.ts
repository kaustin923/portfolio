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

import { appendFile, mkdir } from 'node:fs/promises';
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
  } catch {
    /* best-effort logging */
  }

  return metrics;
}
