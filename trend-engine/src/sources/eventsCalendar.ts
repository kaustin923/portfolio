import { readFile } from 'node:fs/promises';

import { config } from '../config.js';
import { parseEventPeg } from '../pitchVerify.js';
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
  /** When this page was added to the month category (MediaWiki cmprop=timestamp). */
  timestamp?: string;
  /** Supported by fixtures/injected fetchers when the source exposes an event date. */
  date?: string;
  eventDate?: string;
}

const DAY_MS = 86_400_000;
const UNKNOWN_DATE = /\b(?:date\s+(?:pending|unknown|unconfirmed)|pending\s+date|tbd|to\s+be\s+(?:determined|announced|dated)|unscheduled)\b/i;

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

function startOfUtcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function explicitDate(title: string, suppliedDate?: string): string | null {
  if (suppliedDate && UNKNOWN_DATE.test(suppliedDate)) return null;
  return parseEventPeg(suppliedDate ? `${title} on ${suppliedDate}` : title)?.date ?? null;
}

function shouldKeep(
  title: string,
  suppliedDate: string | undefined,
  sourceTimestamp: string | undefined,
  today: Date,
): { keep: boolean; date: string | null } {
  if (UNKNOWN_DATE.test(title) || (suppliedDate != null && UNKNOWN_DATE.test(suppliedDate))) {
    return { keep: false, date: null };
  }

  const date = explicitDate(title, suppliedDate);
  const todayMillis = startOfUtcDay(today);
  if (date) {
    const eventMillis = Date.parse(`${date}T00:00:00.000Z`);
    return { keep: eventMillis > todayMillis, date };
  }

  // An undated page is only a fresh reactive lead, never a dated catalyst.
  // MediaWiki's category-add timestamp gives us a bounded freshness signal.
  const timestampMillis = sourceTimestamp == null ? today.getTime() : Date.parse(sourceTimestamp);
  if (Number.isNaN(timestampMillis) || timestampMillis < todayMillis - (14 * DAY_MS)) {
    return { keep: false, date: null };
  }
  return { keep: true, date: null };
}

function filterFixtureSignals(signals: TrendSignal[], today: Date): TrendSignal[] {
  return signals.flatMap((signal) => {
    const suppliedDate = /\bdate=(\d{4}-\d{2}-\d{2})\b/i.exec(signal.category ?? '')?.[1];
    const decision = shouldKeep(signal.title, suppliedDate, signal.capturedAt, today);
    if (!decision.keep) return [];
    return [{
      ...signal,
      category: decision.date
        ? `events-calendar:date=${decision.date}`
        : 'events-calendar:undated',
    }];
  });
}

async function collectMonth(
  date: Date,
  score: number,
  fetcher: SourcesFetch,
  today: Date,
): Promise<TrendSignal[]> {
  const endpoint = new URL('https://en.wikipedia.org/w/api.php');
  endpoint.searchParams.set('action', 'query');
  endpoint.searchParams.set('list', 'categorymembers');
  endpoint.searchParams.set('cmtitle', monthCategory(date));
  endpoint.searchParams.set('cmlimit', '50');
  endpoint.searchParams.set('cmprop', 'title|timestamp');
  endpoint.searchParams.set('format', 'json');
  const res = await fetcher(endpoint, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { query?: { categorymembers?: CategoryMember[] } };
  return (json.query?.categorymembers ?? []).flatMap((member) => {
    const title = member.title?.trim();
    if (!title || !isEventTitle(title)) return [];
    const decision = shouldKeep(
      title,
      member.eventDate ?? member.date,
      member.timestamp,
      today,
    );
    if (!decision.keep) return [];
    return [{
      source: 'events-calendar' as const,
      externalId: `evcal-${slug(title)}`,
      title,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
      score,
      category: decision.date
        ? `events-calendar:date=${decision.date}`
        : 'events-calendar:undated',
      capturedAt: new Date().toISOString(),
    }];
  });
}

/** Current- and next-month US events from Wikipedia's keyless MediaWiki API. */
export async function collectEventsCalendar(
  today = new Date(),
  fetcher: SourcesFetch = fetchT,
): Promise<TrendSignal[]> {
  if (config.dryRun) return filterFixtureSignals(await fixture(), today);
  if (config.trendScout.geo !== 'US') return [];

  const currentMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const nextMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
  const results = await Promise.allSettled([
    collectMonth(currentMonth, 60, fetcher, today),
    collectMonth(nextMonth, 40, fetcher, today),
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
