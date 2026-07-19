/**
 * Upcoming catalysts — the forward-looking input.
 *
 * Reactive sources (Reddit/Trends/YouTube/HN) tell you what's loud *now*.
 * This tells you what will be loud *soon*: scheduled tournaments, elections,
 * product / movie / game launches, holidays, notable anniversaries. Combining
 * the two is what lets the forecaster recommend posting BEFORE the wave.
 *
 * Live mode uses Fable's web-search research to surface real dated events.
 * DRY_RUN uses a fixture so the pipeline (and tests) run offline.
 */

import { readFile } from 'node:fs/promises';
import { config } from '../config.js';
import { research, structured } from '../llm.js';
import type { UpcomingCatalyst } from '../types.js';

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    catalysts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          date: { type: 'string' },
          daysUntil: { type: 'integer' },
          category: { type: 'string' },
          confidence: { type: 'number' },
          source: { type: 'string' },
        },
        required: ['id', 'title', 'date', 'daysUntil', 'category', 'confidence', 'source'],
      },
    },
  },
  required: ['catalysts'],
} as const;

async function fixture(): Promise<UpcomingCatalyst[]> {
  const path = new URL('../../fixtures/upcoming.json', import.meta.url);
  return JSON.parse(await readFile(path, 'utf8')) as UpcomingCatalyst[];
}

/**
 * @param today ISO date used as "now" so lead times are deterministic in tests.
 */
export async function collectUpcoming(today: string): Promise<UpcomingCatalyst[]> {
  if (config.dryRun) return fixture();

  // Live: research real upcoming events, then structure them.
  const notes = await research(
    `Today is ${today}. List concrete, scheduled events in the next 2–8 weeks in ${config.trendScout.geo} ` +
      `and globally that will drive a spike in public attention and short-form video: sports tournaments/finals, ` +
      `major product/movie/game launches, elections, holidays, and notable anniversaries. ` +
      `For each, give the event name and its date. Focus on events that have NOT peaked yet.`,
  );

  const { catalysts } = await structured<{ catalysts: UpcomingCatalyst[] }>({
    system:
      `Extract upcoming events into structured records. "daysUntil" is whole days from ${today} to the event ` +
      `date (>= 0 for future). "confidence" (0–1) is how sure the event will actually drive attention. ` +
      `Drop anything already past or already saturated.`,
    user: notes,
    schema: SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 4000,
  });

  return catalysts.filter((c) => c.daysUntil >= 0);
}
