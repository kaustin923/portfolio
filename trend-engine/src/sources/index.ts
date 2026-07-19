/**
 * Signal sources for the Trend Scout.
 *
 * Each adapter returns a flat list of {@link TrendSignal}. All of these are free
 * and (for the read paths used here) require no paid API key — Reddit and
 * Hacker News are fully open, Google Trends is a public RSS feed, and YouTube
 * needs only a free Data API key. In DRY_RUN we return small fixtures so the
 * pipeline runs offline.
 */

import { readFile } from 'node:fs/promises';
import { config } from '../config.js';
import type { TrendSignal } from '../types.js';
import { collectGdelt } from './gdelt.js';
import { collectGoogleNews } from './googleNews.js';
import { collectTheSportsDB } from './thesportsdb.js';
import { collectWikipedia } from './wikipedia.js';

const UA = `trend-engine/0.1 (personal research; contact: ${process.env.CONTACT_EMAIL ?? 'unset'})`;
const now = () => new Date().toISOString();

/** All live signal fetches share a hard timeout so one hung source can never stall a run. */
const fetchT = (url: string | URL, init: RequestInit = {}): Promise<Response> =>
  fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });

async function fixture(name: string): Promise<TrendSignal[]> {
  const path = new URL(`../../fixtures/${name}.json`, import.meta.url);
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw) as TrendSignal[];
}

/** Reddit — public JSON endpoints, no auth needed for read-only listings. */
async function fromReddit(): Promise<TrendSignal[]> {
  if (config.dryRun) return fixture('reddit');
  const out: TrendSignal[] = [];
  for (const sub of config.trendScout.subreddits) {
    const res = await fetchT(`https://www.reddit.com/r/${sub}/rising.json?limit=25`, {
      headers: { 'User-Agent': UA },
    });
    if (!res.ok) continue;
    const json = (await res.json()) as any;
    for (const c of json?.data?.children ?? []) {
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
    }
  }
  return out;
}

/** Google Trends daily trending searches — public RSS. */
async function fromGoogleTrends(): Promise<TrendSignal[]> {
  if (config.dryRun) return fixture('google-trends');
  const res = await fetchT(
    `https://trends.google.com/trends/trendingsearches/daily/rss?geo=${config.trendScout.geo}`,
    { headers: { 'User-Agent': UA } },
  );
  if (!res.ok) return [];
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
  if (!res.ok) return [];
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
  if (!res.ok) return [];
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

/** Gather every source in two stages; a failing source never sinks the run. */
export async function collectSignals(): Promise<TrendSignal[]> {
  const firstResults = await Promise.allSettled([
    fromReddit(),
    fromGoogleTrends(),
    fromYouTube(),
    fromHackerNews(),
    collectTheSportsDB(),
    collectGoogleNews(),
  ]);
  const firstStage = firstResults.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  const terms = harvestTerms(firstStage);
  const secondResults = await Promise.allSettled([
    collectWikipedia(terms),
    collectGdelt(terms),
  ]);
  const secondStage = secondResults.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  return [...firstStage, ...secondStage];
}
