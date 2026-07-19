/**
 * Deterministic mock brain for tests.
 *
 * Implements the same {@link LLM} interface as the real Fable-backed client, so
 * the entire pipeline can run end-to-end offline with zero API keys. It returns
 * fixed, schema-correct objects keyed off which schema it's asked to fill.
 *
 * The forecast set deliberately includes a SATURATED World Cup topic to prove
 * the forecaster skips it (the whole point of the redesign) and actionable
 * emerging/rising topics to prove the happy path publishes.
 */

import type { LLM, StructuredRequest } from '../llm.js';
import type { Topic } from '../types.js';

const FORECASTS: Topic[] = [
  {
    id: 'wc-saturated',
    title: 'World Cup 2026 — general highlights',
    summary: 'The tournament is already underway; highlight reels are everywhere.',
    whyTrending: 'Massive live audience right now.',
    momentum: 'exploding',
    longevity: 'spike',
    stage: 'saturated',
    leadTimeDays: -38,
    postWindow: 'window closed — feed already flooded',
    catalyst: 'FIFA World Cup 2026',
    recommendation: 'skip-saturated',
    domains: ['sports'],
    suggestedAngle: 'n/a — too late',
    saturationRisk: 'high',
    opportunityScore: 12,
    contributingSources: ['reddit', 'google-trends', 'youtube'],
  },
  {
    id: 'meteor',
    title: 'Perseid meteor shower — how/when to watch',
    summary: 'Peak viewing is ~3 weeks out; interest builds in the days before.',
    whyTrending: 'Annual, predictable spike with a clear pre-event window.',
    momentum: 'rising',
    longevity: 'spike',
    stage: 'emerging',
    leadTimeDays: 22,
    postWindow: 'post 2–5 days before the Aug 12 peak',
    catalyst: 'Perseid meteor shower peak',
    recommendation: 'prepare',
    domains: ['science', 'educational'],
    suggestedAngle: 'A 45s explainer: best time, direction, and no-gear viewing tips.',
    saturationRisk: 'low',
    opportunityScore: 84,
    contributingSources: ['hackernews', 'google-trends'],
  },
  {
    id: 'back-to-school',
    title: 'Back-to-school study/productivity setups',
    summary: 'Seasonal demand ramps over the next 3 weeks.',
    whyTrending: 'Predictable seasonal catalyst with broad reach.',
    momentum: 'rising',
    longevity: 'sustained',
    stage: 'rising',
    leadTimeDays: 22,
    postWindow: 'post now through late August, front-load early',
    catalyst: 'Back-to-school season',
    recommendation: 'post-now',
    domains: ['educational', 'lifestyle'],
    suggestedAngle: 'Original explainer: 3 evidence-based study techniques in 30s.',
    saturationRisk: 'medium',
    opportunityScore: 71,
    contributingSources: ['reddit'],
  },
  {
    id: 'console-showcase',
    title: 'Console studio summer showcase — predictions',
    summary: 'Showcase ~2 weeks out; speculation is climbing but not flooded.',
    whyTrending: 'Scheduled reveal event with rising pre-event chatter.',
    momentum: 'rising',
    longevity: 'spike',
    stage: 'emerging',
    leadTimeDays: 14,
    postWindow: 'post 3–7 days before the showcase',
    catalyst: 'Console studio summer showcase',
    recommendation: 'prepare',
    domains: ['gaming'],
    suggestedAngle: 'Original take: 5 realistic predictions with reasoning.',
    saturationRisk: 'low',
    opportunityScore: 68,
    contributingSources: ['reddit', 'youtube'],
  },
];

function props(schema: StructuredRequest['schema']): Record<string, unknown> {
  return (schema as any).properties ?? {};
}

export function makeMockLLM(overrides: Partial<{ forecasts: Topic[] }> = {}): LLM {
  return {
    async structured<T>(req: StructuredRequest): Promise<T> {
      const p = props(req.schema);
      if ('topics' in p) {
        return { topics: overrides.forecasts ?? FORECASTS } as T;
      }
      if ('script' in p) {
        return {
          script: 'Mock narration sentence one. Mock narration sentence two.',
          caption: 'Mock original caption',
          hashtags: ['test', 'original'],
        } as T;
      }
      if ('caption' in p) {
        return { caption: 'Mock caption for tests', hashtags: ['test', 'mock'] } as T;
      }
      if ('catalysts' in p) {
        return { catalysts: [] } as T;
      }
      throw new Error('mockLLM: unrecognized schema');
    },
    async research(): Promise<string> {
      return 'Mock research: no live events in test mode.';
    },
  };
}

export { FORECASTS };
