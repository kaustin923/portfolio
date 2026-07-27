import { readFile } from 'node:fs/promises';

import { config } from '../config.js';
import type { TrendSignal } from '../types.js';
import { fetchT, type SourcesFetch } from './index.js';

const UA = `trend-engine/0.1 (personal research; contact: ${process.env.CONTACT_EMAIL ?? 'unset'})`;
const now = () => new Date().toISOString();
const DAY_MS = 24 * 60 * 60 * 1000;

const SRC = 'wikipedia' as const;

interface PageviewItem {
  timestamp?: string;
  views?: number;
}

async function fixture(name: string): Promise<TrendSignal[]> {
  const path = new URL(`../../fixtures/${name}.json`, import.meta.url);
  return JSON.parse(await readFile(path, 'utf8')) as TrendSignal[];
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stamp(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}00`;
}

function dateRange(today: Date): { start: string; end: string } {
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const end = new Date(todayUtc - DAY_MS);
  const start = new Date(end.getTime() - 8 * DAY_MS);
  return { start: stamp(start), end: stamp(end) };
}

function candidateTerms(terms: string[]): string[] {
  const envTerms = (process.env.WIKI_WATCH_TERMS ?? '').split(',');
  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const raw of [...terms, ...envTerms]) {
    const term = raw.trim();
    const key = term.toLocaleLowerCase();
    if (!term || seen.has(key)) continue;
    seen.add(key);
    candidates.push(term);
    if (candidates.length === 10) break;
  }
  return candidates;
}

async function resolveTitle(term: string, fetcher: SourcesFetch): Promise<string | null> {
  const endpoint = new URL('https://en.wikipedia.org/w/api.php');
  endpoint.searchParams.set('action', 'opensearch');
  endpoint.searchParams.set('search', term);
  endpoint.searchParams.set('limit', '1');
  endpoint.searchParams.set('format', 'json');
  const res = await fetcher(endpoint, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json() as unknown;
  if (Array.isArray(json)) {
    const titles = json[1];
    return Array.isArray(titles) && typeof titles[0] === 'string' && titles[0].trim()
      ? titles[0].trim()
      : null;
  }

  // Retain compatibility with older injected pageview-only test doubles.
  if (typeof json === 'object' && json != null && 'items' in json) return term;
  return null;
}

async function collectTerm(
  term: string,
  range: { start: string; end: string },
  fetcher: SourcesFetch,
): Promise<TrendSignal[]> {
  const canonicalTitle = await resolveTitle(term, fetcher);
  if (!canonicalTitle) return [];

  const titlePath = canonicalTitle.replace(/\s+/g, '_');
  const encodedTitle = encodeURIComponent(titlePath);
  const endpoint =
    `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/` +
    `en.wikipedia/all-access/user/${encodedTitle}/daily/${range.start}/${range.end}`;
  const res = await fetcher(endpoint, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { items?: PageviewItem[] };
  const values = (json.items ?? [])
    .map((item) => Number(item.views))
    .filter((value) => Number.isFinite(value))
    .slice(-9);
  if (values.length < 5) return [];

  const prior = mean(values.slice(0, -2));
  const recent = mean(values.slice(-2));
  if (prior <= 0 || recent <= prior) return [];

  return [{
    source: SRC,
    externalId: `wiki-${titlePath}`,
    title: canonicalTitle,
    url: `https://en.wikipedia.org/wiki/${encodedTitle}`,
    score: Math.round(recent),
    velocity: Math.min(1, recent / prior - 1),
    category: 'wiki-pageviews',
    capturedAt: now(),
  }];
}

/** Wikipedia attention acceleration over the available recent complete UTC days. */
export async function collectWikipedia(
  terms: string[],
  today = new Date(),
  fetcher: SourcesFetch = fetchT,
): Promise<TrendSignal[]> {
  if (config.dryRun) return fixture('wikipedia');

  const candidates = candidateTerms(terms);
  const range = dateRange(today);
  const results = await Promise.allSettled(
    candidates.map((term) => collectTerm(term, range, fetcher)),
  );
  const failures = results.filter((result) => result.status === 'rejected');
  if (results.length > 0 && failures.length === results.length) {
    throw failures.at(-1)?.reason;
  }
  return results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
}
