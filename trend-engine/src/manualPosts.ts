import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { recordTopicOutcome, type TopicOutcome } from './agents/monitor.js';
import { readForecasts, type ForecastRecord } from './calibration.js';
import { config } from './config.js';
import type {
  ComplianceTier,
  ContentFeatures,
  Platform,
  PostMetrics,
  Topic,
} from './types.js';

export interface ManualPostRecord {
  v: 1;
  at: string;
  topicId: string;
  draftId: string;
  platform: Platform;
  postUrl: string;
  videoId: string | null;
  tier: ComplianceTier | null;
  syntheticMedia: boolean;
  contentFeatures: Omit<ContentFeatures, 'platform'> | null;
}

const PLATFORMS: readonly Platform[] = [
  'tiktok',
  'youtube-shorts',
  'instagram-reels',
  'x',
];

function isPlatform(value: unknown): value is Platform {
  return typeof value === 'string' && PLATFORMS.includes(value as Platform);
}

function isErrno(err: unknown, code: string): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === code;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isManualPostRecord(value: unknown): value is ManualPostRecord {
  if (!isRecord(value)) return false;
  return (
    value.v === 1 &&
    typeof value.at === 'string' &&
    typeof value.topicId === 'string' &&
    typeof value.draftId === 'string' &&
    isPlatform(value.platform) &&
    typeof value.postUrl === 'string' &&
    (value.videoId === null || typeof value.videoId === 'string') &&
    (value.tier === null || ['green', 'yellow', 'red'].includes(String(value.tier))) &&
    typeof value.syntheticMedia === 'boolean' &&
    (value.contentFeatures === null || isContentFeatures(value.contentFeatures))
  );
}

function isContentFeatures(value: unknown): value is Omit<ContentFeatures, 'platform'> {
  if (!isRecord(value)) return false;
  return (
    typeof value.angleType === 'string' &&
    typeof value.hookStyle === 'string' &&
    (value.durationSec === null || typeof value.durationSec === 'number') &&
    (value.tier === null || typeof value.tier === 'string') &&
    typeof value.syntheticMedia === 'boolean' &&
    typeof value.voice === 'string' &&
    typeof value.postHourLocal === 'number'
  );
}

function registryPath(): string {
  return `${config.dataDir}manual-posts.jsonl`;
}

function validYouTubeId(value: string | null): string | null {
  return value !== null && /^[A-Za-z0-9_-]{11}$/.test(value) ? value : null;
}

export function extractYouTubeVideoId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname === 'youtu.be' || hostname === 'www.youtu.be') {
    return validYouTubeId(parsed.pathname.split('/').filter(Boolean)[0] ?? null);
  }
  if (hostname !== 'youtube.com' && !hostname.endsWith('.youtube.com')) return null;

  if (parsed.pathname === '/watch') {
    return validYouTubeId(parsed.searchParams.get('v'));
  }
  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments[0] === 'shorts') return validYouTubeId(segments[1] ?? null);
  return null;
}

export async function registerManualPost(
  outboxDir: string,
  platform: Platform | string,
  postUrl: string,
): Promise<ManualPostRecord> {
  if (!isPlatform(platform)) {
    throw new Error(
      `invalid platform: ${platform} (expected one of: ${PLATFORMS.join(', ')})`,
    );
  }

  let parsedUrl: URL | null = null;
  try {
    parsedUrl = new URL(postUrl);
  } catch {
    // handled below — new URL() throwing means postUrl is not an absolute URL
  }
  if (!parsedUrl || (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:')) {
    throw new Error(`invalid postUrl: ${postUrl} (expected an absolute http(s) URL)`);
  }

  const metaPath = join(outboxDir, 'meta.json');
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(metaPath, 'utf8')) as unknown;
  } catch (err) {
    throw new Error(`missing or unparseable manual-post kit metadata: ${metaPath}`, {
      cause: err,
    });
  }
  if (!isRecord(parsed)) {
    throw new Error(`invalid manual-post kit metadata in ${metaPath}: expected an object`);
  }
  if (typeof parsed.topicId !== 'string' || parsed.topicId.trim() === '') {
    throw new Error(`invalid manual-post kit metadata in ${metaPath}: missing topicId`);
  }
  if (typeof parsed.draftId !== 'string' || parsed.draftId.trim() === '') {
    throw new Error(`invalid manual-post kit metadata in ${metaPath}: missing draftId`);
  }

  const tier = ['green', 'yellow', 'red'].includes(String(parsed.tier))
    ? parsed.tier as ComplianceTier
    : null;
  const record: ManualPostRecord = {
    v: 1,
    at: new Date().toISOString(),
    topicId: parsed.topicId,
    draftId: parsed.draftId,
    platform,
    postUrl,
    videoId: extractYouTubeVideoId(postUrl),
    tier,
    syntheticMedia: parsed.syntheticMedia === true,
    contentFeatures: isContentFeatures(parsed.contentFeatures)
      ? parsed.contentFeatures
      : null,
  };

  await mkdir(config.dataDir, { recursive: true });
  await appendFile(registryPath(), `${JSON.stringify(record)}\n`);
  return record;
}

export async function readManualPosts(): Promise<ManualPostRecord[]> {
  let raw: string;
  try {
    raw = await readFile(registryPath(), 'utf8');
  } catch (err) {
    if (isErrno(err, 'ENOENT')) return [];
    throw err;
  }

  const latestByUrl = new Map<string, ManualPostRecord>();
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (!isManualPostRecord(parsed)) continue;
      latestByUrl.delete(parsed.postUrl);
      latestByUrl.set(parsed.postUrl, parsed);
    } catch {
      // Corrupt registry lines are isolated so later registrations remain usable.
    }
  }
  return [...latestByUrl.values()];
}

function validateMetric(name: string, value: number): void {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative finite integer`);
  }
}

async function latestForecast(topicId: string): Promise<ForecastRecord | undefined> {
  const forecasts = await readForecasts();
  for (let index = forecasts.length - 1; index >= 0; index -= 1) {
    const forecast = forecasts[index];
    if (forecast?.topicId === topicId) return forecast;
  }
  return undefined;
}

export async function recordManualOutcome(
  postUrl: string,
  views: number,
  likes = 0,
  comments = 0,
): Promise<TopicOutcome[]> {
  validateMetric('views', views);
  validateMetric('likes', likes);
  validateMetric('comments', comments);

  const registration = (await readManualPosts()).find((post) => post.postUrl === postUrl);
  if (!registration) {
    throw new Error(
      `${postUrl} not registered — run: npm run track register <outboxDir> <platform> <postUrl>`,
    );
  }

  const forecast = await latestForecast(registration.topicId);
  // TopicOutcome's reader intentionally accepts strings here. Keeping an honest
  // unknown bucket is better than inventing a trend stage or recommendation.
  const unknownStage = 'unknown' as Topic['stage'];
  const unknownRecommendation = 'unknown' as Topic['recommendation'];
  const topicLike = {
    id: registration.topicId,
    title: forecast?.title ?? registration.topicId,
    domains: forecast?.domains ?? [],
    stage: forecast?.stage ?? unknownStage,
    recommendation: forecast?.recommendation ?? unknownRecommendation,
    opportunityScore: forecast?.scores.opportunity ?? 0,
  } as Topic;
  const metric: PostMetrics = {
    postId: registration.videoId ?? registration.postUrl,
    platform: registration.platform,
    views,
    likes,
    comments,
    shares: 0,
    capturedAt: new Date().toISOString(),
  };

  return recordTopicOutcome(
    topicLike,
    [metric],
    registration.contentFeatures ?? undefined,
  );
}
