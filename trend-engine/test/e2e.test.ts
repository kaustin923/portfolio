/**
 * End-to-end tests — proof the pipeline actually works.
 *
 * These run the WHOLE system in DRY_RUN with a mock brain (no API key), so they
 * exercise real control flow: forecasting → sourcing → editing → compliance →
 * approval → publishing → monitoring. If these are green, the wiring is sound.
 *
 *   npm test
 */

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { setLLM, resetLLM } from '../src/llm.js';
import { makeMockLLM } from '../src/testing/mockLlm.js';
import { discoverTopics } from '../src/agents/trendScout.js';
import { checkCompliance } from '../src/agents/compliance.js';
import { runOnce } from '../src/orchestrator.js';
import { config } from '../src/config.js';
import type { ClipDraft } from '../src/types.js';

before(() => setLLM(makeMockLLM()));
after(() => resetLLM());

test('DRY_RUN is the default so tests never touch live services', () => {
  assert.equal(config.dryRun, true);
});

test('forecaster fuses reactive signals + upcoming catalysts', async () => {
  const r = await discoverTopics('2026-07-19');
  // 27 = reddit(4) + google-trends(4) + youtube(3) + hackernews(2)
  //    + leading sources: thesportsdb(4) + google-news(4) + wikipedia(3) + gdelt(3)
  assert.equal(r.rawSignalCount, 27, 'loads all reactive fixture signals');
  assert.ok(r.upcomingCount > 0, 'loads upcoming catalysts');
});

test('forecaster SKIPS saturated topics and only returns actionable ones', async () => {
  const r = await discoverTopics('2026-07-19');

  // The World Cup topic is saturated → must not be actionable.
  const actionableTitles = r.topics.map((t) => t.title);
  assert.ok(
    !actionableTitles.some((t) => /world cup/i.test(t)),
    'saturated World Cup topic must not be in the actionable set',
  );
  assert.ok(
    r.skipped.some((s) => /world cup/i.test(s.title) && s.recommendation === 'skip-saturated'),
    'saturated World Cup topic must appear in skipped with skip-saturated',
  );

  // Everything returned is genuinely actionable, not too-late.
  for (const t of r.topics) {
    assert.ok(['post-now', 'prepare'].includes(t.recommendation), `${t.title} is actionable`);
    assert.ok(t.stage !== 'saturated' && t.stage !== 'peaking', `${t.title} is not past its window`);
    assert.ok(t.leadTimeDays >= 0, `${t.title} has non-negative lead time`);
  }
});

test('forecaster ranks by opportunity (highest first)', async () => {
  const { topics } = await discoverTopics('2026-07-19');
  const scores = topics.map((t) => t.opportunityScore);
  const sorted = [...scores].sort((a, b) => b - a);
  assert.deepEqual(scores, sorted, 'topics come back ranked by opportunityScore desc');
});

test('compliance gate: original content passes clean, no human review', () => {
  const draft: ClipDraft = {
    id: 'd', topicId: 't', sourceCandidateId: 's', outputPath: '/x.mp4',
    aspectRatio: '9:16', caption: 'c', hashtags: [], targetPlatforms: ['tiktok'],
    license: { type: 'original', requiresAttribution: false, commercialUse: true, sourceUrl: 'self' },
    audioProvenance: { kind: 'tts', generator: 'macos-say' },
  };
  const r = checkCompliance(draft);
  assert.equal(r.approved, true);
  assert.equal(r.requiresHumanReview, false);
});

test('compliance gate: unknown provenance is HARD-BLOCKED', () => {
  const draft: ClipDraft = {
    id: 'd', topicId: 't', sourceCandidateId: 's', outputPath: '/x.mp4',
    aspectRatio: '9:16', caption: 'c', hashtags: [], targetPlatforms: ['tiktok'],
    license: { type: 'unknown', requiresAttribution: false, commercialUse: 'unknown', sourceUrl: '' },
  };
  const r = checkCompliance(draft);
  assert.equal(r.approved, false);
  assert.match(r.reasons[0] ?? '', /provenance/i);
});

test('full pipeline runs end-to-end and publishes only actionable topics', async () => {
  const report = await runOnce();

  assert.equal(report.blocked, 0, 'nothing blocked (sourcing prefers original content)');
  assert.equal(report.rejected, 0, 'nothing rejected in DRY_RUN auto-approve');

  // Sourced + original drafts × N platforms, all "published" in DRY_RUN.
  const expected =
    (report.topicsConsidered + report.originals) * config.publishing.defaultPlatforms.length;
  assert.equal(report.published, expected, 'published = (topics + originals) × platforms');
  assert.ok(report.topicsConsidered > 0, 'at least one actionable topic was processed');
  assert.ok(
    report.metrics.some((metric) => metric.postId.includes('draft-original-')),
    'at least one original draft flowed through publishing and monitoring',
  );
  assert.equal(report.metrics.length, report.published, 'monitor recorded metrics for each post');
});
