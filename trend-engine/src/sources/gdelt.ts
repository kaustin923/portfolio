import { readFile } from 'node:fs/promises';

import { config } from '../config.js';
import type { TrendSignal } from '../types.js';


const fetchWithTimeout = (url: string | URL, init: RequestInit = {}): Promise<Response> =>
  fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });

const UA = 'trend-engine/0.1 (personal research; contact: you@example.com)';
const now = () => new Date().toISOString();

// This cast becomes a no-op once types.ts adds the gdelt SignalSource member.
const SRC = 'gdelt' as TrendSignal['source'];

interface GdeltPoint {
  date?: string;
  value?: number;
}

async function fixture(name: string): Promise<TrendSignal[]> {
  const path = new URL(`../../fixtures/${name}.json`, import.meta.url);
  return JSON.parse(await readFile(path, 'utf8')) as TrendSignal[];
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function candidateTerms(terms: string[]): string[] {
  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const raw of terms) {
    const term = raw.trim();
    const key = term.toLocaleLowerCase();
    if (!term || seen.has(key)) continue;
    seen.add(key);
    candidates.push(term);
    if (candidates.length === 10) break;
  }
  return candidates;
}

async function collectTerm(term: string): Promise<TrendSignal[]> {
  const endpoint = new URL('https://api.gdeltproject.org/api/v2/doc/doc');
  endpoint.searchParams.set('query', term);
  endpoint.searchParams.set('mode', 'timelinevol');
  endpoint.searchParams.set('timespan', '7d');
  endpoint.searchParams.set('format', 'json');

  try {
    const res = await fetchWithTimeout(endpoint, { headers: { 'User-Agent': UA } });
    if (!res.ok) return [];
    const json = (await res.json()) as { timeline?: Array<{ data?: GdeltPoint[] }> };
    const values = (json.timeline?.[0]?.data ?? [])
      .map((point) => Number(point.value))
      .filter((value) => Number.isFinite(value));
    if (values.length < 3) return [];

    const prior = mean(values.slice(0, -2));
    const recent = mean(values.slice(-2));
    if (prior <= 0 || recent <= prior) return [];

    const lastValue = values.at(-1);
    if (lastValue == null) return [];
    return [{
      source: SRC,
      externalId: `gdelt-${term.toLocaleLowerCase().replace(/\s+/g, '-')}`,
      title: term,
      url: endpoint.toString(),
      score: Math.round(lastValue * 100),
      velocity: Math.min(1, recent / prior - 1),
      category: 'news-velocity',
      capturedAt: now(),
    }];
  } catch {
    return [];
  }
}

/** GDELT seven-day timeline acceleration for harvested candidate terms. */
export async function collectGdelt(terms: string[]): Promise<TrendSignal[]> {
  if (config.dryRun) return fixture('gdelt');

  const results = await Promise.allSettled(candidateTerms(terms).map(collectTerm));
  return results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
}
