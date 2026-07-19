/**
 * Shared plumbing for the platform publishing adapters.
 *
 * Every adapter follows the same discipline:
 *   1. DRY_RUN → return a mocked `published` result. No network, no fs, no creds.
 *   2. Missing credentials → return a `skipped` result naming exactly what is
 *      missing. Never throw for missing creds — one unconfigured platform must
 *      not block the rest of a run.
 *   3. Real API errors → throw. The publisher agent catches and converts to an
 *      `error` result per platform.
 */

import { readFile } from 'node:fs/promises';

import { config } from '../config.js';
import type { ClipDraft, Platform, PublishResult } from '../types.js';

/** The mocked result used for every platform when `config.dryRun` is true. */
export function dryRunResult(platform: Platform, draft: ClipDraft): PublishResult {
  return {
    platform,
    status: 'published',
    postId: `dryrun-${platform}-${draft.id}`,
    url: `https://${platform}.example/mock`,
  };
}

/** A `skipped` result naming the credentials that are not configured. */
export function skippedResult(platform: Platform, missing: string[]): PublishResult {
  return {
    platform,
    status: 'skipped',
    error: `missing credentials: ${missing.join(', ')} — set in .env to enable live publishing`,
  };
}

/**
 * Read the env vars an adapter needs. Returns the resolved values plus the
 * names of any that are unset/blank, so the adapter can skip with a precise
 * message instead of failing mid-upload.
 */
export function readCreds<const K extends readonly string[]>(
  names: K,
): { values: Record<K[number], string>; missing: string[] } {
  const values = {} as Record<K[number], string>;
  const missing: string[] = [];
  for (const name of names) {
    const v = process.env[name]?.trim();
    if (v) values[name as K[number]] = v;
    else missing.push(name);
  }
  return { values, missing };
}

/** Load the rendered clip from disk. Throws (→ `error` result) if unreadable. */
export async function loadVideo(path: string): Promise<{ bytes: Uint8Array; size: number }> {
  const buf = await readFile(path);
  // Re-wrap so the value is a plain Uint8Array over a plain ArrayBuffer —
  // exactly what fetch/Blob BodyInit typings expect in strict mode.
  const bytes = new Uint8Array(buf.byteLength);
  bytes.set(buf);
  return { bytes, size: bytes.byteLength };
}

/**
 * Parse a JSON response, throwing a rich error (status + response body) on any
 * non-2xx so failures surface *which* API call failed and why.
 */
export async function expectJson<T>(res: Response, context: string): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${context} failed: HTTP ${res.status} ${res.statusText} — ${truncate(text, 500)}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${context} returned non-JSON response: ${truncate(text, 200)}`);
  }
}

/** Throw a rich error on any non-2xx response (for calls whose body we ignore). */
export async function expectOk(res: Response, context: string): Promise<void> {
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${context} failed: HTTP ${res.status} ${res.statusText} — ${truncate(text, 500)}`);
  }
}

/** Caption + hashtags composed into one string, hard-capped at `limit` chars. */
export function composeCaption(caption: string, hashtags: string[], limit: number): string {
  const tags = hashtags
    .map((h) => `#${h.replace(/^#/, '')}`)
    .filter((h) => h.length > 1)
    .join(' ');
  const full = tags ? `${caption}\n\n${tags}` : caption;
  return truncate(full, limit);
}

export function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, Math.max(0, max - 1))}…`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll `check` until it returns a value, up to `attempts` times, waiting
 * `intervalMs` (or the check's own suggested delay) between tries.
 * Never used in DRY_RUN — adapters return before any polling starts.
 */
export async function poll<T>(
  context: string,
  attempts: number,
  intervalMs: number,
  check: () => Promise<{ done?: T; retryInMs?: number }>,
): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    const r = await check();
    if (r.done !== undefined) return r.done;
    await sleep(r.retryInMs ?? intervalMs);
  }
  throw new Error(`${context}: still not complete after ${attempts} status checks`);
}

/** Guard: adapters must never be reachable in DRY_RUN via a code path that could touch the network. */
export function isDryRun(): boolean {
  return config.dryRun;
}
