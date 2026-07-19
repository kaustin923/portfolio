import { readFile } from 'node:fs/promises';

import { config } from '../config.js';
import type { TrendSignal } from '../types.js';
import { fetchT, getSourcesFetch, type SourcesFetch } from './index.js';

const UA = `trend-engine/0.1 (personal research; contact: ${process.env.CONTACT_EMAIL ?? 'unset'})`;
const now = () => new Date().toISOString();

const SRC = 'gdelt' as const;

export const GDELT_TIMEOUT_MS = 15_000;

const gdeltFetchT: SourcesFetch = (input, init = {}) =>
  getSourcesFetch()(input, {
    ...init,
    signal: AbortSignal.timeout(GDELT_TIMEOUT_MS),
  });

interface GdeltPoint {
  date?: string;
  value?: number;
}

interface GdeltResponse {
  timeline?: Array<{ data?: GdeltPoint[] }>;
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
    if (candidates.length === 5) break;
  }
  return candidates;
}

async function parseResponse(res: Response): Promise<GdeltResponse> {
  // Real Response objects expose text(); the fallback keeps older JSON-only
  // injected fetch doubles working without weakening live error reporting.
  if (typeof res.text !== 'function') {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json() as GdeltResponse;
  }

  const body = await res.text();
  const snippet = body.slice(0, 120);
  if (!res.ok) throw new Error(`HTTP ${res.status}${snippet ? ` - ${snippet}` : ''}`);
  try {
    return JSON.parse(body) as GdeltResponse;
  } catch {
    throw new Error(`GDELT non-JSON response: ${snippet}`);
  }
}

async function collectTerm(term: string, fetcher: SourcesFetch): Promise<TrendSignal[]> {
  const endpoint = new URL('https://api.gdeltproject.org/api/v2/doc/doc');
  endpoint.searchParams.set('query', /\s/.test(term) ? `"${term}"` : term);
  endpoint.searchParams.set('mode', 'timelinevol');
  endpoint.searchParams.set('timespan', '3d');
  endpoint.searchParams.set('format', 'json');

  const res = await fetcher(endpoint, { headers: { 'User-Agent': UA } });
  const json = await parseResponse(res);
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
}

/** GDELT three-day timeline acceleration for harvested candidate terms. */
export async function collectGdelt(
  terms: string[],
  fetcher: SourcesFetch = fetchT,
): Promise<TrendSignal[]> {
  if (config.dryRun) return fixture('gdelt');
  if (fetcher === fetchT) fetcher = gdeltFetchT;

  const candidates = candidateTerms(terms);
  const results = await Promise.allSettled(
    candidates.map((term) => collectTerm(term, fetcher)),
  );
  const failures = results.filter((result) => result.status === 'rejected');
  if (results.length > 0 && failures.length === results.length) {
    throw failures.at(-1)?.reason;
  }
  return results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
}
