import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { config } from '../config.js';

let fetchImpl: typeof globalThis.fetch = (input, init) => globalThis.fetch(input, init);

/** Fetch indirection so provider tests never need to replace the global. */
export function getFetch(): typeof globalThis.fetch {
  return fetchImpl;
}

export function setFetch(fn: typeof globalThis.fetch): void {
  fetchImpl = fn;
}

export function resetFetch(): void {
  fetchImpl = (input, init) => globalThis.fetch(input, init);
}

export function requireEnv(name: string, provider: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name} — required for live ${provider} sourcing`);
  }
  return value;
}

/**
 * Cache provider JSON by a SHA-256 key. Missing, stale, or corrupt entries are
 * treated as misses; a successful fetch replaces them with valid JSON.
 */
export async function cachedJson(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<unknown>,
): Promise<unknown> {
  const cacheDir = join(config.dataDir, 'cache');
  const digest = createHash('sha256').update(key).digest('hex');
  const cachePath = join(cacheDir, `${digest}.json`);

  try {
    const [contents, metadata] = await Promise.all([
      readFile(cachePath, 'utf8'),
      stat(cachePath),
    ]);
    if (Date.now() - metadata.mtimeMs <= ttlMs) {
      return JSON.parse(contents) as unknown;
    }
  } catch {
    // Cache misses and corrupt cache data both fall through to the live fetch.
  }

  const fresh = await fetcher();
  await mkdir(cacheDir, { recursive: true });
  await writeFile(cachePath, JSON.stringify(fresh), 'utf8');
  return fresh;
}
