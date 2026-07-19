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
}

function freshState(): RunState {
  return { version: 1, publishedTopics: {}, runCount: 0 };
}

function filePath(dir: string | undefined, name: string): string {
  return join(dir ?? config.dataDir, name);
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
    (state.lastRunAt != null && typeof state.lastRunAt !== 'string')
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

export function saveState(state: RunState, dir?: string): void {
  const targetDir = dir ?? config.dataDir;
  mkdirSync(targetDir, { recursive: true });
  const temporary = filePath(targetDir, 'state.tmp');
  writeFileSync(temporary, JSON.stringify(state, null, 2));
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
