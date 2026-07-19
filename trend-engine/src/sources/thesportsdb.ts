import { readFile } from 'node:fs/promises';

import { config } from '../config.js';
import type { TrendSignal } from '../types.js';
import { fetchT, type SourcesFetch } from './index.js';

const UA = `trend-engine/0.1 (personal research; contact: ${process.env.CONTACT_EMAIL ?? 'unset'})`;
const now = () => new Date().toISOString();
const DAY_MS = 24 * 60 * 60 * 1000;
const LEAGUE_IDS = ['4391', '4387', '4424', '4380', '4346'] as const;

const SRC = 'thesportsdb' as const;

interface SportsDbEvent {
  idEvent?: string;
  strLeague?: string;
  strEvent?: string;
  dateEvent?: string;
  strSport?: string;
}

async function fixture(name: string): Promise<TrendSignal[]> {
  const path = new URL(`../../fixtures/${name}.json`, import.meta.url);
  return JSON.parse(await readFile(path, 'utf8')) as TrendSignal[];
}

function utcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function mapEvent(event: SportsDbEvent, today: Date): TrendSignal | null {
  if (!event.idEvent || !event.dateEvent) return null;

  const eventTime = Date.parse(`${event.dateEvent}T00:00:00Z`);
  if (!Number.isFinite(eventTime)) return null;
  const daysUntil = Math.round((eventTime - utcDay(today)) / DAY_MS);
  if (daysUntil < 0 || daysUntil > 30) return null;

  const league = event.strLeague?.trim() || 'Sports';
  const eventName = event.strEvent?.trim() || 'Upcoming event';
  return {
    source: SRC,
    externalId: `tsdb-${event.idEvent}`,
    title: `${league}: ${eventName} (${event.dateEvent})`,
    url: `https://www.thesportsdb.com/event/${event.idEvent}`,
    score: Math.max(1, 100 - daysUntil * 3),
    category: event.strSport?.trim() || league,
    capturedAt: now(),
  };
}

async function collectLeague(
  leagueId: string,
  today: Date,
  fetcher: SourcesFetch,
): Promise<TrendSignal[]> {
  const res = await fetcher(
    `https://www.thesportsdb.com/api/v1/json/3/eventsnextleague.php?id=${leagueId}`,
    { headers: { 'User-Agent': UA } },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { events?: SportsDbEvent[] | null };
  return (json.events ?? [])
    .map((event) => mapEvent(event, today))
    .filter((event): event is TrendSignal => event != null);
}

/** Scheduled major-league events in the next 30 days. */
export async function collectTheSportsDB(
  today = new Date(),
  fetcher: SourcesFetch = fetchT,
): Promise<TrendSignal[]> {
  if (config.dryRun) return fixture('thesportsdb');

  const results = await Promise.allSettled(
    LEAGUE_IDS.map((leagueId) => collectLeague(leagueId, today, fetcher)),
  );
  const failures = results.filter((result) => result.status === 'rejected');
  if (results.length > 0 && failures.length === results.length) {
    throw failures.at(-1)?.reason;
  }
  return results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
}
