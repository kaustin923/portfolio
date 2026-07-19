/**
 * Unit tests for the learning loop's pure aggregation.
 *
 *   node --import tsx --test test/learning.test.ts
 *
 * `summarizeOutcomes` is pure, so these tests need no filesystem, no network,
 * and no LLM — hand-crafted outcome records in, summary string out.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { NO_HISTORY_SUMMARY, summarizeOutcomes } from '../src/learning.js';
import type { TopicOutcome } from '../src/agents/monitor.js';

let seq = 0;
function outcome(overrides: Partial<TopicOutcome>): TopicOutcome {
  seq += 1;
  return {
    postId: `post-${seq}`,
    platform: 'youtube-shorts',
    views: 1000,
    likes: 40,
    comments: 5,
    shares: 2,
    capturedAt: '2026-07-19T00:00:00.000Z',
    topicId: `topic-${seq}`,
    topicTitle: `Topic ${seq}`,
    domains: ['science'],
    stage: 'emerging',
    recommendation: 'prepare',
    opportunityScore: 80,
    ...overrides,
  };
}

test('summarizeOutcomes names the clearly best-performing domain and stage', () => {
  // 'science'/'emerging'/'prepare' massively outperforms 'lifestyle'/'rising'/'post-now'.
  const records: TopicOutcome[] = [
    outcome({ domains: ['science'], stage: 'emerging', recommendation: 'prepare', views: 9000 }),
    outcome({ domains: ['science'], stage: 'emerging', recommendation: 'prepare', views: 7000 }),
    outcome({ domains: ['lifestyle'], stage: 'rising', recommendation: 'post-now', views: 400 }),
    outcome({ domains: ['lifestyle'], stage: 'rising', recommendation: 'post-now', views: 200 }),
  ];

  const summary = summarizeOutcomes(records);

  assert.ok(summary.length > 0, 'summary is non-empty');
  assert.notEqual(summary, NO_HISTORY_SUMMARY);

  // Every segment of the hand-crafted dataset is mentioned.
  for (const needle of ['science', 'lifestyle', 'emerging', 'rising', 'prepare', 'post-now']) {
    assert.ok(summary.includes(needle), `summary mentions '${needle}'`);
  }

  // The winner is ranked ahead of the loser in each dimension...
  assert.ok(summary.indexOf("'science'") < summary.indexOf("'lifestyle'"), 'best domain first');
  assert.ok(summary.indexOf("'emerging'") < summary.indexOf("'rising'"), 'best stage first');
  assert.ok(summary.indexOf("'prepare'") < summary.indexOf("'post-now'"), 'best rec first');

  // ...and the takeaway explicitly favors the winning domain + stage.
  assert.match(summary, /Favor 'science' topics at the 'emerging' stage/);
  assert.match(summary, /'lifestyle' has underperformed/);
});

test('a post with multiple domains contributes to each of them', () => {
  const records: TopicOutcome[] = [
    outcome({ domains: ['science', 'educational'], views: 6000 }),
    outcome({ domains: ['gaming'], views: 1000 }),
  ];

  const summary = summarizeOutcomes(records);
  assert.ok(summary.includes("'science'"), 'first domain counted');
  assert.ok(summary.includes("'educational'"), 'second domain counted');
  assert.ok(summary.includes("'gaming'"), 'other record counted');
  // science and educational share the 6k average and both beat gaming (1k).
  assert.ok(summary.indexOf("'educational'") < summary.indexOf("'gaming'"));
});

test('summary is deterministic for the same input', () => {
  const records: TopicOutcome[] = [
    outcome({ domains: ['science'], views: 5000 }),
    outcome({ domains: ['lifestyle'], stage: 'rising', recommendation: 'post-now', views: 500 }),
  ];
  assert.equal(summarizeOutcomes(records), summarizeOutcomes(records));
});

test('empty input returns the "no history" string', () => {
  const summary = summarizeOutcomes([]);
  assert.equal(summary, NO_HISTORY_SUMMARY);
  assert.match(summary, /no performance history/i);
});
