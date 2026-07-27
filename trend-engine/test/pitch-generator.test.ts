import assert from 'node:assert/strict';
import { appendFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { test } from 'node:test';

import { config } from '../src/config.js';
import { resetLLM, setLLM, type StructuredRequest } from '../src/llm.js';
import { generatePitches, loadPitches } from '../src/pitcher.js';
import type { Topic } from '../src/types.js';

const mutableConfig = config as unknown as { dataDir: string; dryRun: boolean };

function topic(index: number, overrides: Partial<Topic> = {}): Topic {
  return {
    id: `topic-${index}`,
    title: `Forecast Topic ${index}`,
    summary: `Summary ${index}`,
    whyTrending: 'A scheduled catalyst is approaching.',
    momentum: 'rising',
    longevity: 'sustained',
    stage: 'emerging',
    leadTimeDays: index + 3,
    postWindow: 'post this week',
    catalyst: `Event ${index} on 2026-07-${20 + index}`,
    recommendation: 'prepare',
    domains: ['technology'],
    suggestedAngle: 'Follow the money behind the attention shift.',
    saturationRisk: 'low',
    opportunityScore: 90 - index,
    contributingSources: ['mock'],
    ...overrides,
  };
}

function draft(
  headline: string,
  vertical: 'finance' | 'sports' | 'tech' | 'culture',
  format: string,
  topicIndex = 1,
): Record<string, unknown> {
  return {
    topicId: `topic-${topicIndex}`,
    topicTitle: `Forecast Topic ${topicIndex}`,
    headline,
    stakes: 'The opportunity window closes today.',
    angle: 'The incentives behind the shift matter more than the announcement.',
    eventPeg: 'Event on 2026-07-22',
    vertical,
    format,
  };
}

test('regenerates once, filters retry violations, reads taste history, and persists pending pitches', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trend-engine-pitch-generator-'));
  const previous = { dataDir: mutableConfig.dataDir, dryRun: mutableConfig.dryRun };
  mutableConfig.dataDir = `${dir}${sep}`;
  mutableConfig.dryRun = false;

  const feedback = Array.from({ length: 21 }, (_, index) => ({
    at: `2026-07-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
    pitchId: `old-pitch-${index}`,
    headline: `History ${index}`,
    vertical: index % 2 === 0 ? 'tech' : 'finance',
    decision: index % 3 === 0 ? 'approved' : 'rejected',
    feedback: index === 20 ? 'More incentive-driven cross-domain angles.' : `Feedback ${index}`,
  }));
  await writeFile(
    join(dir, 'pitch-feedback.jsonl'),
    `${feedback.map((record) => JSON.stringify(record)).join('\n')}\n`,
  );
  await appendFile(join(dir, 'pitch-feedback.jsonl'), '{malformed feedback\n');

  const requests: StructuredRequest[] = [];
  setLLM({
    async structured<T>(request: StructuredRequest): Promise<T> {
      requests.push(request);
      if (requests.length === 1) {
        return {
          pitches: [
            draft('This Headline Has Far Too Many Words To Ever Pass Today', 'finance', 'analysis'),
            draft('Cloud Spending Explained', 'tech', 'deep dive', 2),
            draft('The Stadium Bet Nobody Priced', 'sports', 'timeline', 3),
            draft('A Second Money Collision', 'finance', 'analysis', 4),
          ],
        } as T;
      }
      return {
        pitches: [
          draft('The Quiet Bet Behind AI Demand', 'finance', 'analysis'),
          draft('Why Stadium Screens Became Scoreboards', 'sports', 'timeline', 2),
          draft('Chips Found Their Hollywood Moment', 'tech', 'deep dive', 3),
          draft('Streaming Economics Explained', 'culture', 'profile', 4),
          draft('Money Follows The Hidden Queue', 'finance', 'ANALYSIS', 5),
        ],
      } as T;
    },
    async research(): Promise<string> {
      return '';
    },
  });

  try {
    const pitches = await generatePitches(
      { topics: [topic(1), topic(2), topic(3), topic(4), topic(5), topic(6)] },
      '2026-07-19',
    );

    assert.equal(requests.length, 2, 'quality failures must cause exactly one regeneration');
    assert.match(requests[0]?.system ?? '', /curiosity-gap headline/);
    assert.match(requests[0]?.system ?? '', /WHO CARES/);
    assert.match(requests[0]?.user ?? '', /OWNER TASTE HISTORY/);
    assert.match(requests[0]?.user ?? '', /More incentive-driven cross-domain angles/);
    assert.doesNotMatch(requests[0]?.user ?? '', /"feedback":"Feedback 0"/);
    assert.doesNotMatch(requests[0]?.user ?? '', /Forecast Topic 6/);
    assert.match(requests[1]?.user ?? '', /maximum 9/);
    assert.match(requests[1]?.user ?? '', /forbidden generic pattern/);
    assert.match(requests[1]?.user ?? '', /vertical\+format pair/);

    assert.equal(pitches.length, 3);
    assert.ok(pitches.every((pitch) => pitch.status === 'pending'));
    assert.ok(pitches.every((pitch) => /^pitch-20260719-\d+-[a-z0-9-]+$/.test(pitch.id)));
    assert.ok(pitches.every((pitch) => !/\bexplained\b/i.test(pitch.headline)));
    const pairs = pitches.map((pitch) => `${pitch.vertical}:${pitch.format.toLowerCase()}`);
    assert.equal(new Set(pairs).size, pairs.length);

    const lines = (await readFile(join(dir, 'pitches.jsonl'), 'utf8')).trim().split('\n');
    assert.equal(lines.length, 3);
    assert.ok(lines.every((line) => JSON.parse(line).status === 'pending'));
    assert.deepEqual(await loadPitches(dir), pitches);
  } finally {
    resetLLM();
    mutableConfig.dataDir = previous.dataDir;
    mutableConfig.dryRun = previous.dryRun;
    await rm(dir, { recursive: true, force: true });
  }
});

test('DRY_RUN creates deterministic fixture pitches with zero LLM calls', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trend-engine-pitch-dryrun-'));
  const previous = { dataDir: mutableConfig.dataDir, dryRun: mutableConfig.dryRun };
  mutableConfig.dataDir = `${dir}${sep}`;
  mutableConfig.dryRun = true;

  let llmCalls = 0;
  setLLM({
    async structured<T>(): Promise<T> {
      llmCalls++;
      throw new Error('DRY_RUN must not call structured()');
    },
    async research(): Promise<string> {
      llmCalls++;
      throw new Error('DRY_RUN must not call research()');
    },
  });

  try {
    const pitches = await generatePitches(
      {
        topics: [
          topic(1, {
            title: 'One Two Three Four Five Six Seven Eight Nine Ten Eleven',
          }),
        ],
      },
      '2026-07-19',
    );

    assert.equal(llmCalls, 0);
    assert.equal(pitches.length, 3);
    assert.deepEqual(pitches.map((pitch) => pitch.id), [
      'pitch-dryrun-1',
      'pitch-dryrun-2',
      'pitch-dryrun-3',
    ]);
    assert.ok(pitches.every((pitch) => pitch.headline.split(/\s+/).length <= 9));
    assert.deepEqual(pitches.map((pitch) => pitch.vertical), ['finance', 'sports', 'tech']);
    assert.ok(pitches.every((pitch) => pitch.status === 'pending'));
    assert.deepEqual(await loadPitches(dir), pitches);
  } finally {
    resetLLM();
    mutableConfig.dataDir = previous.dataDir;
    mutableConfig.dryRun = previous.dryRun;
    await rm(dir, { recursive: true, force: true });
  }
});
