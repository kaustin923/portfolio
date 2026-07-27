import { readFile } from 'node:fs/promises';

import { config } from '../config.js';
import type { TrendSignal } from '../types.js';
import { fetchT, type SourcesFetch } from './index.js';

const UA = `trend-engine/0.1 (personal research; contact: ${process.env.CONTACT_EMAIL ?? 'unset'})`;
const now = () => new Date().toISOString();

const SRC = 'google-news' as const;

async function fixture(name: string): Promise<TrendSignal[]> {
  const path = new URL(`../../fixtures/${name}.json`, import.meta.url);
  return JSON.parse(await readFile(path, 'utf8')) as TrendSignal[];
}

/** Ranked Google News headlines, used as a lagging saturation signal. */
export async function collectGoogleNews(fetcher: SourcesFetch = fetchT): Promise<TrendSignal[]> {
  if (config.dryRun) return fixture('google-news');

  const res = await fetcher('https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en', {
    headers: { 'User-Agent': UA },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 25);
  return items.map((match, index) => {
    const block = match[1] ?? '';
    const title = /<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/.exec(block)?.[1] ?? '';
    const url = /<link>(.*?)<\/link>/.exec(block)?.[1];
    return {
      source: SRC,
      externalId: `gnews-${index}`,
      title,
      ...(url ? { url } : {}),
      score: 25 - index,
      category: 'headlines',
      capturedAt: now(),
    };
  });
}
