import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.js';

export interface RunState {
  version: 1;
  publishedTopics: Record<
    string,
    { title: string; lastPublishedAt: string; platforms: string[] }
  >;
  lastRunAt?: string;
  runCount: number;
  dailyPublishCounts?: Record<string, Record<string, number>>;
  youtubeQuota?: { date: string; unitsUsed: number };
}

function freshState(): RunState {
  return { version: 1, publishedTopics: {}, runCount: 0 };
}

function filePath(dir: string | undefined, name: string): string {
  return join(dir ?? config.dataDir, name);
}

function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isDailyPublishCounts(
  value: unknown,
): value is Record<string, Record<string, number>> {
  return (
    isRecord(value) &&
    Object.entries(value).every(
      ([date, counts]) =>
        isDateKey(date) &&
        isRecord(counts) &&
        Object.values(counts).every(
          (count) => Number.isInteger(count) && (count as number) >= 0,
        ),
    )
  );
}

function isYouTubeQuota(value: unknown): value is NonNullable<RunState['youtubeQuota']> {
  return (
    isRecord(value) &&
    typeof value.date === 'string' &&
    isDateKey(value.date) &&
    Number.isInteger(value.unitsUsed) &&
    (value.unitsUsed as number) >= 0
  );
}

function isRunState(value: unknown): value is RunState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<RunState>;
  if (
    state.version !== 1 ||
    typeof state.publishedTopics !== 'object' ||
    state.publishedTopics === null ||
    Array.isArray(state.publishedTopics) ||
    !Number.isInteger(state.runCount) ||
    state.runCount == null ||
    state.runCount < 0 ||
    (state.lastRunAt != null && typeof state.lastRunAt !== 'string') ||
    (state.dailyPublishCounts !== undefined &&
      !isDailyPublishCounts(state.dailyPublishCounts)) ||
    (state.youtubeQuota !== undefined && !isYouTubeQuota(state.youtubeQuota))
  ) {
    return false;
  }

  return Object.values(state.publishedTopics).every(
    (published) =>
      published !== null &&
      typeof published === 'object' &&
      typeof published.title === 'string' &&
      typeof published.lastPublishedAt === 'string' &&
      Array.isArray(published.platforms) &&
      published.platforms.every((platform) => typeof platform === 'string'),
  );
}

function envNumber(name: string, fallback: number): number {
  const value = process.env[name];
  if (value == null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isErrno(err: unknown, code: string): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === code;
}

export function topicKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function utcDateKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function pacificDateKey(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function getDailyPublishCount(
  state: RunState,
  platform: string,
  dateKey: string,
): number {
  return state.dailyPublishCounts?.[dateKey]?.[platform] ?? 0;
}

export function recordDailyPublish(
  state: RunState,
  platform: string,
  dateKey: string,
): void {
  const nextCount = getDailyPublishCount(state, platform, dateKey) + 1;
  const countsForToday = state.dailyPublishCounts?.[dateKey] ?? {};
  state.dailyPublishCounts = {
    [dateKey]: {
      ...countsForToday,
      [platform]: nextCount,
    },
  };
}

export function getYouTubeUnits(state: RunState, dateKey: string): number {
  return state.youtubeQuota?.date === dateKey ? state.youtubeQuota.unitsUsed : 0;
}

export function recordYouTubeUnits(
  state: RunState,
  units: number,
  dateKey: string,
): void {
  state.youtubeQuota = {
    date: dateKey,
    unitsUsed: getYouTubeUnits(state, dateKey) + units,
  };
}

export function loadState(dir?: string): RunState {
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath(dir, 'state.json'), 'utf8'));
    if (!isRunState(parsed)) throw new Error('state.json has an unsupported shape');
    return parsed;
  } catch (err) {
    console.warn('[state] failed to load state; using a fresh state:', err);
    return freshState();
  }
}

function mergeDailyPublishCounts(
  outgoing: RunState['dailyPublishCounts'],
  persisted: RunState['dailyPublishCounts'],
): RunState['dailyPublishCounts'] {
  if (outgoing === undefined && persisted === undefined) return undefined;

  const merged: Record<string, Record<string, number>> = {};
  for (const source of [persisted, outgoing]) {
    if (!source) continue;
    for (const [date, counts] of Object.entries(source)) {
      const mergedCounts = (merged[date] ??= {});
      for (const [platform, count] of Object.entries(counts)) {
        mergedCounts[platform] = Math.max(mergedCounts[platform] ?? 0, count);
      }
    }
  }

  // Daily counters retain only the newest UTC date, matching recordDailyPublish pruning.
  const newestDate = Object.keys(merged).sort().at(-1);
  return newestDate ? { [newestDate]: merged[newestDate]! } : {};
}

function mergeYouTubeQuota(
  outgoing: RunState['youtubeQuota'],
  persisted: RunState['youtubeQuota'],
): RunState['youtubeQuota'] {
  if (!outgoing) return persisted;
  if (!persisted) return outgoing;
  if (outgoing.date === persisted.date) {
    return {
      date: outgoing.date,
      unitsUsed: Math.max(outgoing.unitsUsed, persisted.unitsUsed),
    };
  }
  return outgoing.date > persisted.date ? outgoing : persisted;
}

export function saveState(state: RunState, dir?: string): void {
  const targetDir = dir ?? config.dataDir;
  mkdirSync(targetDir, { recursive: true });
  let persisted: RunState | undefined;
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath(targetDir, 'state.json'), 'utf8'));
    if (isRunState(parsed)) persisted = parsed;
  } catch {
    // Absence or corruption is handled by writing the caller's valid state below.
  }

  /*
   * The publisher saves quota attempts during a run, while the orchestrator
   * later saves the RunState object it loaded before publishing. Merge quota
   * maxima from disk so that stale final save cannot clobber attempt counters.
   */
  const dailyPublishCounts = mergeDailyPublishCounts(
    state.dailyPublishCounts,
    persisted?.dailyPublishCounts,
  );
  const youtubeQuota = mergeYouTubeQuota(state.youtubeQuota, persisted?.youtubeQuota);
  const stateToWrite: RunState = {
    ...state,
    ...(dailyPublishCounts !== undefined ? { dailyPublishCounts } : {}),
    ...(youtubeQuota !== undefined ? { youtubeQuota } : {}),
  };
  const temporary = filePath(targetDir, 'state.tmp');
  writeFileSync(temporary, JSON.stringify(stateToWrite, null, 2));
  renameSync(temporary, filePath(targetDir, 'state.json'));
}

export function wasRecentlyPublished(
  state: RunState,
  key: string,
  windowHours = envNumber('DEDUPE_WINDOW_HOURS', 72),
): boolean {
  const published = state.publishedTopics[key];
  if (!published) return false;
  const lastPublishedAt = Date.parse(published.lastPublishedAt);
  if (!Number.isFinite(lastPublishedAt)) return false;
  return lastPublishedAt > Date.now() - windowHours * 60 * 60 * 1000;
}

export function recordPublished(
  state: RunState,
  key: string,
  title: string,
  platforms: string[],
): void {
  state.publishedTopics[key] = {
    title,
    lastPublishedAt: new Date().toISOString(),
    platforms: [...platforms],
  };
}

function lockContents(): string {
  return JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() });
}

export function acquireLock(dir?: string): boolean {
  const targetDir = dir ?? config.dataDir;
  mkdirSync(targetDir, { recursive: true });
  const lockPath = filePath(targetDir, 'run.lock');

  try {
    writeFileSync(lockPath, lockContents(), { flag: 'wx' });
    return true;
  } catch (err) {
    if (!isErrno(err, 'EEXIST')) throw err;
  }

  let stale = false;
  try {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as {
      pid?: unknown;
      startedAt?: unknown;
    };
    const startedAt = typeof lock.startedAt === 'string' ? Date.parse(lock.startedAt) : Number.NaN;
    const staleAfterMs = envNumber('LOCK_STALE_MIN', 120) * 60 * 1000;
    stale = !Number.isFinite(startedAt) || startedAt < Date.now() - staleAfterMs;

    if (!stale) {
      if (typeof lock.pid !== 'number' || !Number.isInteger(lock.pid) || lock.pid <= 0) {
        stale = true;
      } else {
        try {
          process.kill(lock.pid, 0);
        } catch {
          stale = true;
        }
      }
    }
  } catch {
    stale = true;
  }

  if (!stale) return false;
  writeFileSync(lockPath, lockContents());
  return true;
}

export function releaseLock(dir?: string): void {
  try {
    unlinkSync(filePath(dir, 'run.lock'));
  } catch (err) {
    if (!isErrno(err, 'ENOENT')) throw err;
  }
}
