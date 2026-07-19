import { readFile } from 'node:fs/promises';

import { config } from '../config.js';
import type { TrendSignal } from '../types.js';
import { fetchT, type SourcesFetch } from './index.js';

const UA = `trend-engine/0.1 (personal research; contact: ${process.env.CONTACT_EMAIL ?? 'unset'})`;
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

interface CategoryMember {
  title?: string;
}

async function fixture(): Promise<TrendSignal[]> {
  const path = new URL('../../fixtures/events-calendar.json', import.meta.url);
  return JSON.parse(await readFile(path, 'utf8')) as TrendSignal[];
}

function slug(title: string): string {
  return title
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function isEventTitle(title: string): boolean {
  return !(
    /^(?:Category:|List of|Timeline of|Deaths in|Killing of|Death of)/i.test(title) ||
    /law enforcement/i.test(title)
  );
}

function monthCategory(date: Date): string {
  return `Category:${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()} in the United States`;
}

async function collectMonth(
  date: Date,
  score: number,
  fetcher: SourcesFetch,
): Promise<TrendSignal[]> {
  const endpoint = new URL('https://en.wikipedia.org/w/api.php');
  endpoint.searchParams.set('action', 'query');
  endpoint.searchParams.set('list', 'categorymembers');
  endpoint.searchParams.set('cmtitle', monthCategory(date));
  endpoint.searchParams.set('cmlimit', '50');
  endpoint.searchParams.set('format', 'json');
  const res = await fetcher(endpoint, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { query?: { categorymembers?: CategoryMember[] } };
  return (json.query?.categorymembers ?? []).flatMap((member) => {
    const title = member.title?.trim();
    if (!title || !isEventTitle(title)) return [];
    return [{
      source: 'events-calendar' as const,
      externalId: `evcal-${slug(title)}`,
      title,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
      score,
      category: 'events-calendar',
      capturedAt: new Date().toISOString(),
    }];
  });
}

/** Current- and next-month US events from Wikipedia's keyless MediaWiki API. */
export async function collectEventsCalendar(
  today = new Date(),
  fetcher: SourcesFetch = fetchT,
): Promise<TrendSignal[]> {
  if (config.dryRun) return fixture();
  if (config.trendScout.geo !== 'US') return [];

  const currentMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const nextMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
  const results = await Promise.allSettled([
    collectMonth(currentMonth, 60, fetcher),
    collectMonth(nextMonth, 40, fetcher),
  ]);
  const failures = results.filter((result) => result.status === 'rejected');
  if (failures.length === results.length) throw failures.at(-1)?.reason;

  const seen = new Set<string>();
  return results
    .flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
    .filter((signal) => {
      const key = signal.title.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20);
}
