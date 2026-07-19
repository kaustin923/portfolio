import { readFile } from 'node:fs/promises';

import { config } from '../config.js';
import type { TrendSignal } from '../types.js';


const fetchWithTimeout = (url: string | URL, init: RequestInit = {}): Promise<Response> =>
  fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });

const UA = 'trend-engine/0.1 (personal research; contact: you@example.com)';
const now = () => new Date().toISOString();
const DAY_MS = 24 * 60 * 60 * 1000;

// This cast becomes a no-op once types.ts adds the wikipedia SignalSource member.
const SRC = 'wikipedia' as TrendSignal['source'];

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

async function collectTerm(
  term: string,
  range: { start: string; end: string },
): Promise<TrendSignal[]> {
  const title = term.trim().replace(/\s+/g, '_');
  const encodedTitle = encodeURIComponent(title);
  const endpoint =
    `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/` +
    `en.wikipedia/all-access/user/${encodedTitle}/daily/${range.start}/${range.end}`;

  try {
    const res = await fetchWithTimeout(endpoint, { headers: { 'User-Agent': UA } });
    if (!res.ok) return [];
    const json = (await res.json()) as { items?: PageviewItem[] };
    const values = (json.items ?? [])
      .map((item) => Number(item.views))
      .filter((value) => Number.isFinite(value))
      .slice(-9);
    if (values.length !== 9) return [];

    const prior = mean(values.slice(0, 7));
    const recent = mean(values.slice(7));
    if (prior === 0 || recent <= prior) return [];

    return [{
      source: SRC,
      externalId: `wiki-${title}`,
      title: term,
      url: `https://en.wikipedia.org/wiki/${encodedTitle}`,
      score: Math.round(recent),
      velocity: Math.min(1, recent / prior - 1),
      category: 'wiki-pageviews',
      capturedAt: now(),
    }];
  } catch {
    return [];
  }
}

/** Wikipedia attention acceleration over the last nine complete UTC days. */
export async function collectWikipedia(
  terms: string[],
  today = new Date(),
): Promise<TrendSignal[]> {
  if (config.dryRun) return fixture('wikipedia');

  const range = dateRange(today);
  const results = await Promise.allSettled(
    candidateTerms(terms).map((term) => collectTerm(term, range)),
  );
  return results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
}
