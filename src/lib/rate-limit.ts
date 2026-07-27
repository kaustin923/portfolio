/**
 * Fixed-window rate limiter backed by an in-memory map.
 *
 * The state is per server instance, not global. That is the right trade here:
 * the job is to stop one visitor hammering the chat endpoint, not to enforce a
 * hard account-wide quota. Two things keep the map from growing without bound:
 * a periodic sweep of expired windows, and a hard ceiling on tracked keys.
 */

interface Window {
  count: number;
  resetTime: number;
}

const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = process.env.E2E_TESTING ? 200 : 20;

/** Most keys we will ever hold. Roughly 60 bytes each, so a few hundred KB. */
const MAX_TRACKED_KEYS = 5_000;
/** Don't sweep more often than this. */
const SWEEP_INTERVAL_MS = 60 * 1000;

const windows = new Map<string, Window>();
let lastSweep = 0;

function sweep(now: number): void {
  lastSweep = now;

  for (const [key, window] of windows) {
    if (now > window.resetTime) windows.delete(key);
  }

  // Everything is still live, so nothing expired. Drop the entries closest to
  // resetting, since those visitors lose the least by being forgotten.
  if (windows.size > MAX_TRACKED_KEYS) {
    const oldestFirst = [...windows.entries()].sort(
      (a, b) => a[1].resetTime - b[1].resetTime
    );
    const excess = windows.size - MAX_TRACKED_KEYS;
    for (let i = 0; i < excess; i++) windows.delete(oldestFirst[i][0]);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the window resets. Zero when the request was allowed. */
  retryAfter: number;
  /** Requests left in the current window. */
  remaining: number;
}

export function checkRateLimit(key: string): RateLimitResult {
  const now = Date.now();

  if (now - lastSweep > SWEEP_INTERVAL_MS) sweep(now);

  const existing = windows.get(key);

  if (!existing || now > existing.resetTime) {
    // A burst of never-seen keys would otherwise grow the map between sweeps.
    if (!existing && windows.size >= MAX_TRACKED_KEYS) sweep(now);
    windows.set(key, { count: 1, resetTime: now + WINDOW_MS });
    return { allowed: true, retryAfter: 0, remaining: MAX_REQUESTS - 1 };
  }

  if (existing.count >= MAX_REQUESTS) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((existing.resetTime - now) / 1000)),
      remaining: 0,
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    retryAfter: 0,
    remaining: MAX_REQUESTS - existing.count,
  };
}
