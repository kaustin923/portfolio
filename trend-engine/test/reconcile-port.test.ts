import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { test } from 'node:test';

import { trackResults, type TopicOutcome } from '../src/agents/monitor.js';
import { config } from '../src/config.js';
import {
  getLearningSummary,
  NO_HISTORY_SUMMARY,
  summarizeOutcomes,
} from '../src/learning.js';
import { composeCaption, expectJson } from '../src/publish/http.js';
import type { Topic } from '../src/types.js';

let sequence = 0;

function outcome(overrides: Partial<TopicOutcome> = {}): TopicOutcome {
  sequence += 1;
  return {
    postId: `post-${sequence}`,
    platform: 'youtube-shorts',
    views: 1000,
    likes: 50,
    comments: 10,
    shares: 5,
    capturedAt: '2026-07-19T12:00:00.000Z',
    topicId: `topic-${sequence}`,
    topicTitle: `Topic ${sequence}`,
    domains: ['science'],
    stage: 'emerging',
    recommendation: 'prepare',
    opportunityScore: 80,
    ...overrides,
  };
}

test('summarizeOutcomes ranks domains, stages, and recommendations by average views', () => {
  const records = [
    outcome({ views: 9000 }),
    outcome({ views: 7000 }),
    outcome({ domains: ['lifestyle'], stage: 'rising', recommendation: 'post-now', views: 400 }),
    outcome({ domains: ['lifestyle'], stage: 'rising', recommendation: 'post-now', views: 200 }),
  ];
  const summary = summarizeOutcomes(records);

  for (const segment of [
    'science',
    'lifestyle',
    'emerging',
    'rising',
    'prepare',
    'post-now',
  ]) {
    assert.match(summary, new RegExp(segment));
  }
  assert.ok(summary.indexOf("'science'") < summary.indexOf("'lifestyle'"));
  assert.ok(summary.indexOf("'emerging'") < summary.indexOf("'rising'"));
  assert.ok(summary.indexOf("'prepare'") < summary.indexOf("'post-now'"));
  assert.match(summary, /Favor 'science' topics at the 'emerging' stage/);
  assert.match(summary, /'lifestyle' has underperformed/);
});

test('summarizeOutcomes counts a multi-domain post in every domain', () => {
  const summary = summarizeOutcomes([
    outcome({ domains: ['science', 'educational'], views: 6000 }),
    outcome({ domains: ['gaming'], views: 1000 }),
  ]);

  assert.ok(summary.indexOf("'science'") < summary.indexOf("'gaming'"));
  assert.ok(summary.indexOf("'educational'") < summary.indexOf("'gaming'"));
});

test('summarizeOutcomes is deterministic for the same records', () => {
  const records = [
    outcome({ domains: ['zeta'], views: 2000 }),
    outcome({ domains: ['alpha'], views: 2000 }),
  ];
  assert.equal(summarizeOutcomes(records), summarizeOutcomes(records));
});

test('summarizeOutcomes reports a graceful cold start', () => {
  assert.equal(summarizeOutcomes([]), NO_HISTORY_SUMMARY);
  assert.match(summarizeOutcomes([]), /no performance history/i);
});

test('composeCaption normalizes hashtags, drops empties, and caps the result', () => {
  assert.equal(
    composeCaption('Caption', [' news ', '#today', ' ', '#', '##double'], 100),
    'Caption\n\n#news #today ##double',
  );
  assert.equal(composeCaption('Caption', ['', '   '], 100), 'Caption');
  assert.equal(composeCaption('1234567890', ['tag'], 8), '12345678');
  assert.equal(composeCaption('Caption', ['a-very-long-hashtag'], 15), 'Caption');
});

test('expectJson reports contextual HTTP and non-JSON failures', async () => {
  assert.deepEqual(
    await expectJson<{ ok: boolean }>(new Response('{"ok":true}'), 'Example request'),
    { ok: true },
  );
  await assert.rejects(
    expectJson(new Response('<html>busy</html>'), 'Example request'),
    /Example request returned non-JSON response: <html>busy<\/html>/,
  );
  await assert.rejects(
    expectJson(
      new Response('rate limited', { status: 429, statusText: 'Too Many Requests' }),
      'Example request',
    ),
    /Example request failed: HTTP 429 Too Many Requests — rate limited/,
  );
});

test('trackResults creates deterministic mock metrics and joined topic outcomes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trend-engine-learning-'));
  const mutableConfig = config as unknown as { dataDir: string; dryRun: boolean };
  const originalDataDir = mutableConfig.dataDir;
  const originalDryRun = mutableConfig.dryRun;
  mutableConfig.dataDir = `${dir}${sep}`;
  mutableConfig.dryRun = true;
  const topic: Topic = {
    id: 'learning-topic',
    title: 'Learning topic',
    summary: 'Summary',
    whyTrending: 'Because',
    momentum: 'rising',
    longevity: 'sustained',
    stage: 'emerging',
    leadTimeDays: 5,
    postWindow: 'this week',
    catalyst: null,
    recommendation: 'prepare',
    domains: ['science', 'educational'],
    suggestedAngle: 'Explain it',
    saturationRisk: 'low',
    opportunityScore: 88,
    contributingSources: ['mock'],
  };
  const results = [
    { platform: 'tiktok', status: 'published', postId: 'dryrun-one' },
    { platform: 'x', status: 'published', postId: 'dryrun-two' },
  ] as const;

  try {
    const first = await trackResults([...results], topic);
    const second = await trackResults([...results], topic);
    assert.equal(first[0]?.capturedAt, first[1]?.capturedAt);
    assert.deepEqual(
      first.map(({ capturedAt: _capturedAt, ...metric }) => metric),
      second.map(({ capturedAt: _capturedAt, ...metric }) => metric),
    );

    const persisted = (await readFile(join(dir, 'outcomes.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as TopicOutcome);
    assert.equal(persisted.length, 4);
    assert.equal(persisted[0]?.topicId, topic.id);
    assert.deepEqual(persisted[0]?.domains, topic.domains);
    assert.equal(await getLearningSummary(), NO_HISTORY_SUMMARY);

    const live = outcome({ postId: 'live-post', domains: ['science'], views: 4321 });
    await writeFile(join(dir, 'outcomes.jsonl'), `malformed\n${JSON.stringify(live)}\n`);
    assert.match(await getLearningSummary(), /'science' 4\.3k/);
  } finally {
    mutableConfig.dataDir = originalDataDir;
    mutableConfig.dryRun = originalDryRun;
    await rm(dir, { recursive: true, force: true });
  }
});
