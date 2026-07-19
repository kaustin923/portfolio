import { readFile } from 'node:fs/promises';

import { config } from '../config.js';
import type { TrendSignal } from '../types.js';


const fetchWithTimeout = (url: string | URL, init: RequestInit = {}): Promise<Response> =>
  fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });

const UA = 'trend-engine/0.1 (personal research; contact: you@example.com)';
const now = () => new Date().toISOString();
const DAY_MS = 24 * 60 * 60 * 1000;
const LEAGUE_IDS = ['4391', '4387', '4424', '4380', '4346'] as const;

// This cast becomes a no-op once types.ts adds the thesportsdb SignalSource member.
const SRC = 'thesportsdb' as TrendSignal['source'];

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

async function collectLeague(leagueId: string, today: Date): Promise<TrendSignal[]> {
  try {
    const res = await fetchWithTimeout(
      `https://www.thesportsdb.com/api/v1/json/3/eventsnextleague.php?id=${leagueId}`,
      { headers: { 'User-Agent': UA } },
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { events?: SportsDbEvent[] | null };
    return (json.events ?? [])
      .map((event) => mapEvent(event, today))
      .filter((event): event is TrendSignal => event != null);
  } catch {
    return [];
  }
}

/** Scheduled major-league events in the next 30 days. */
export async function collectTheSportsDB(today = new Date()): Promise<TrendSignal[]> {
  if (config.dryRun) return fixture('thesportsdb');

  const results = await Promise.allSettled(
    LEAGUE_IDS.map((leagueId) => collectLeague(leagueId, today)),
  );
  return results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
}
