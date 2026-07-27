/**
 * Signal sources for the Trend Scout.
 *
 * Each adapter returns a flat list of {@link TrendSignal}. All live requests
 * share one injectable fetch seam and a hard timeout. In DRY_RUN every adapter
 * returns a fixture before reaching that seam, so collection remains offline.
 */

import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { config } from '../config.js';
import type { TrendSignal } from '../types.js';
import { collectEventsCalendar } from './eventsCalendar.js';
import { collectGdelt } from './gdelt.js';
import { collectGoogleNews } from './googleNews.js';
import { collectTheSportsDB } from './thesportsdb.js';
import { collectWikipedia } from './wikipedia.js';

const UA = `trend-engine/0.1 (personal research; contact: ${process.env.CONTACT_EMAIL ?? 'unset'})`;
const now = () => new Date().toISOString();

export type SourcesFetch = typeof globalThis.fetch;

let sourcesFetch: SourcesFetch = (input, init) => globalThis.fetch(input, init);

/** Fetch indirection so source tests never need to replace the global. */
export function getSourcesFetch(): SourcesFetch {
  return sourcesFetch;
}

export function setSourcesFetch(fetchImpl: SourcesFetch): void {
  sourcesFetch = fetchImpl;
}

export function resetSourcesFetch(): void {
  sourcesFetch = (input, init) => globalThis.fetch(input, init);
}

/** All live signal fetches share a hard timeout so one hung source can never stall a run. */
export const fetchT: SourcesFetch = (input, init = {}) =>
  sourcesFetch(input, { ...init, signal: AbortSignal.timeout(10_000) });

export interface SourceHealth {
  source: string;
  status: 'ok' | 'empty' | 'error' | 'timeout' | 'disabled' | 'fixture';
  count: number;
  ms: number;
  detail?: string;
}

export interface CollectedSignals {
  signals: TrendSignal[];
  health: SourceHealth[];
  /** @deprecated Compatibility for callers written against the former array return value. */
  map: TrendSignal[]['map'];
}

interface HealthOptions {
  disabled?: boolean;
  disabledDetail?: string;
  emptyDetail?: string;
}

async function fixture(name: string): Promise<TrendSignal[]> {
  const path = new URL(`../../fixtures/${name}.json`, import.meta.url);
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw) as TrendSignal[];
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isTimeout(error: unknown): boolean {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) return true;
  if (typeof error !== 'object' || error == null || !('name' in error)) return false;
  return error.name === 'TimeoutError' || error.name === 'AbortError';
}

async function withHealth(
  source: string,
  collect: () => Promise<TrendSignal[]>,
  options: HealthOptions = {},
): Promise<{ signals: TrendSignal[]; health: SourceHealth }> {
  const startedAt = Date.now();
  try {
    const signals = await collect();
    const ms = Date.now() - startedAt;
    if (config.dryRun) {
      return { signals, health: { source, status: 'fixture', count: signals.length, ms } };
    }
    if (options.disabled) {
      return {
        signals,
        health: {
          source,
          status: 'disabled',
          count: signals.length,
          ms,
          ...(options.disabledDetail ? { detail: options.disabledDetail } : {}),
        },
      };
    }
    if (signals.length > 0) {
      return { signals, health: { source, status: 'ok', count: signals.length, ms } };
    }
    return {
      signals,
      health: {
        source,
        status: 'empty',
        count: 0,
        ms,
        detail: options.emptyDetail ?? 'fetched OK but rising-set/filter produced 0',
      },
    };
  } catch (error) {
    return {
      signals: [],
      health: {
        source,
        status: isTimeout(error) ? 'timeout' : 'error',
        count: 0,
        ms: Date.now() - startedAt,
        detail: errorDetail(error),
      },
    };
  }
}

/** Reddit — public JSON endpoints, with an honest overridable user agent. */
async function fromReddit(): Promise<TrendSignal[]> {
  if (config.dryRun) return fixture('reddit');
  const out: TrendSignal[] = [];
  for (const sub of config.trendScout.subreddits) {
    const res = await fetchT(`https://www.reddit.com/r/${sub}/rising.json?limit=25`, {
      headers: { 'User-Agent': process.env.REDDIT_UA ?? UA },
    });
    if (!res.ok) {
      if (res.status === 403) {
        throw new Error(
          'HTTP 403 - Reddit blocks datacenter/non-browser clients; set REDDIT_UA or accept degraded coverage',
        );
      }
      throw new Error(`HTTP ${res.status}`);
    }
    const json = (await res.json()) as any;
    for (const c of json?.data?.children ?? []) {
      try {
        const d = c.data;
        out.push({
          source: 'reddit',
          externalId: d.id,
          title: d.title,
          url: `https://reddit.com${d.permalink}`,
          score: d.score ?? 0,
          // Upvotes-per-hour-ish proxy, normalized softly to 0–1.
          velocity: Math.min(1, (d.score ?? 0) / Math.max(1, (Date.now() / 1000 - d.created_utc) / 3600) / 500),
          category: d.subreddit,
          capturedAt: now(),
        });
      } catch {
        // A malformed item should not discard valid siblings from the listing.
      }
    }
  }
  return out;
}

/** Google Trends trending searches — public RSS. */
async function fromGoogleTrends(): Promise<TrendSignal[]> {
  if (config.dryRun) return fixture('google-trends');
  // The former /trendingsearches/daily/rss endpoint returned HTTP 404 on 2026-07-19.
  const res = await fetchT(
    `https://trends.google.com/trending/rss?geo=${config.trendScout.geo}`,
    { headers: { 'User-Agent': UA } },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  return items.map((m, i) => {
    const block = m[1] ?? '';
    const title = /<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/.exec(block)?.[1] ?? '';
    const traffic = /<ht:approx_traffic>(.*?)<\/ht:approx_traffic>/.exec(block)?.[1] ?? '0';
    return {
      source: 'google-trends' as const,
      externalId: `gt-${i}-${title.slice(0, 24)}`,
      title,
      score: Number(traffic.replace(/[^0-9]/g, '')) || 0,
      category: 'search',
      capturedAt: now(),
    };
  });
}

/** YouTube most-popular — free Data API key required outside DRY_RUN. */
async function fromYouTube(): Promise<TrendSignal[]> {
  if (config.dryRun) return fixture('youtube');
  if (!config.apiKeys.youtube) return [];
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part', 'snippet,statistics');
  url.searchParams.set('chart', 'mostPopular');
  url.searchParams.set('regionCode', config.trendScout.geo);
  url.searchParams.set('maxResults', '25');
  url.searchParams.set('key', config.apiKeys.youtube);
  const res = await fetchT(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as any;
  return (json.items ?? []).map((v: any) => ({
    source: 'youtube' as const,
    externalId: v.id,
    title: v.snippet?.title ?? '',
    url: `https://youtube.com/watch?v=${v.id}`,
    score: Number(v.statistics?.viewCount ?? 0),
    category: v.snippet?.categoryId,
    capturedAt: now(),
  }));
}

/** Hacker News front page via the free Algolia API. */
async function fromHackerNews(): Promise<TrendSignal[]> {
  if (config.dryRun) return fixture('hackernews');
  const res = await fetchT('https://hn.algolia.com/api/v1/search?tags=front_page');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as any;
  return (json.hits ?? []).map((h: any) => ({
    source: 'hackernews' as const,
    externalId: h.objectID,
    title: h.title ?? '',
    url: h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`,
    score: h.points ?? 0,
    category: 'tech',
    capturedAt: now(),
  }));
}

/** Build bounded, useful article/query guesses from the loudest first-stage titles. */
export function harvestTerms(signals: TrendSignal[]): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  const ranked = [...signals].sort((a, b) => b.score - a.score);

  for (const signal of ranked) {
    const words = signal.title
      .replace(/[’']/gu, '')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (words.length < 2) continue;
    const term = words.slice(0, 4).join(' ');
    const key = term.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push(term);
    if (terms.length === 10) break;
  }

  return terms;
}

async function appendHealth(health: SourceHealth[]): Promise<void> {
  try {
    await mkdir(config.dataDir, { recursive: true });
    await appendFile(
      `${config.dataDir}source-health.jsonl`,
      `${JSON.stringify({ at: now(), dryRun: config.dryRun, sources: health })}\n`,
      'utf8',
    );
  } catch (error) {
    console.warn('[trend-scout] failed to append source health:', error);
  }
}

/** Gather every source in two stages; a failing source never sinks the run. */
export async function collectSignals(): Promise<CollectedSignals> {
  const youtubeDisabled = !config.dryRun && !config.apiKeys.youtube;
  const firstResults = await Promise.all([
    withHealth('reddit', fromReddit),
    withHealth('google-trends', fromGoogleTrends),
    withHealth('youtube', fromYouTube, {
      disabled: youtubeDisabled,
      disabledDetail:
        'YOUTUBE_API_KEY unset when the process started - env is read at startup, restart the daemon after adding keys',
    }),
    withHealth('hackernews', fromHackerNews),
    withHealth('thesportsdb', () => collectTheSportsDB(new Date(), fetchT)),
    withHealth('google-news', () => collectGoogleNews(fetchT)),
    withHealth('events-calendar', () => collectEventsCalendar(new Date(), fetchT), {
      emptyDetail: config.trendScout.geo === 'US'
        ? undefined
        : `only US is mapped; TREND_GEO=${config.trendScout.geo}`,
    }),
  ]);
  const firstStage = firstResults.flatMap((result) => result.signals);
  const terms = harvestTerms(firstStage);
  const secondResults = await Promise.all([
    withHealth('wikipedia', () => collectWikipedia(terms, new Date(), fetchT)),
    withHealth('gdelt', () => collectGdelt(terms, fetchT)),
  ]);
  const signals = [...firstStage, ...secondResults.flatMap((result) => result.signals)];
  const health = [
    ...firstResults.map((result) => result.health),
    ...secondResults.map((result) => result.health),
  ];
  await appendHealth(health);

  const result = { signals, health } as CollectedSignals;
  Object.defineProperty(result, 'map', {
    enumerable: false,
    value: signals.map.bind(signals),
  });
  return result;
}
