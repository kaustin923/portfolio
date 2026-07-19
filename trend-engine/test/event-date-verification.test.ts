import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { afterEach, test } from 'node:test';

import { discoverTopics } from '../src/agents/trendScout.js';
import {
  renderPitchBatch,
  runPitchGate,
} from '../src/approval/pitchGate.js';
import {
  resetTelegramFetch,
  setTelegramFetch,
} from '../src/approval/telegram.js';
import { config } from '../src/config.js';
import {
  resetLLM,
  setLLM,
  type StructuredRequest,
} from '../src/llm.js';
import { collectEventsCalendar } from '../src/sources/eventsCalendar.js';
import type { Pitch, Topic } from '../src/types.js';

interface MutableConfig {
  dryRun: boolean;
  dataDir: string;
  trendScout: { geo: string };
}

const mutableConfig = config as unknown as MutableConfig;
const originalConfig = {
  dryRun: mutableConfig.dryRun,
  dataDir: mutableConfig.dataDir,
  geo: mutableConfig.trendScout.geo,
};

function pitch(overrides: Partial<Pitch> = {}): Pitch {
  return {
    id: 'pitch-event-date',
    createdAt: '2026-07-19T00:00:00.000Z',
    topicId: 'topic-event-date',
    topicTitle: 'Flagship product launch',
    headline: 'The Launch Bet Nobody Priced',
    stakes: 'The attention window opens before launch day.',
    angle: 'Follow the supply-chain money behind the reveal.',
    eventPeg: 'Flagship product launch on 2026-07-31',
    vertical: 'tech',
    format: 'analysis',
    status: 'pending',
    ...overrides,
  };
}

function jsonl(contents: string): Array<Record<string, unknown>> {
  return contents
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

afterEach(() => {
  mutableConfig.dryRun = originalConfig.dryRun;
  mutableConfig.dataDir = originalConfig.dataDir;
  mutableConfig.trendScout.geo = originalConfig.geo;
  resetLLM();
  resetTelegramFetch();
});

test('events-calendar drops stale, pending, and past-only entries', async () => {
  mutableConfig.dryRun = false;
  mutableConfig.trendScout.geo = 'US';

  const calendar = await collectEventsCalendar(
    new Date('2026-07-19T12:00:00.000Z'),
    async () => Response.json({
      query: {
        categorymembers: [
          {
            title: 'Swift-Kelce wedding on July 3, 2026',
            timestamp: '2026-07-04T00:00:00.000Z',
          },
          {
            title: 'Stale undated awards entry',
            timestamp: '2026-07-01T00:00:00.000Z',
          },
          {
            title: 'Mystery gala — date pending',
            timestamp: '2026-07-18T00:00:00.000Z',
          },
          {
            title: 'Creator Expo on July 31, 2026',
            timestamp: '2026-06-01T00:00:00.000Z',
          },
        ],
      },
    }),
  );

  assert.deepEqual(calendar.map((signal) => signal.title), [
    'Creator Expo on July 31, 2026',
  ]);
  assert.equal(calendar[0]?.category, 'events-calendar:date=2026-07-31');
});

test('forecaster prompt permits past-dated catalysts only as labeled aftermath', async () => {
  mutableConfig.dryRun = true;
  let request: StructuredRequest | undefined;
  const aftermath: Topic = {
    id: 'swift-kelce-aftermath',
    title: 'AFTERMATH — the celebrity wedding attention cycle',
    summary: 'AFTERMATH — the event is over and only retrospective analysis remains.',
    whyTrending: 'Post-event coverage is still circulating.',
    momentum: 'fading',
    longevity: 'spike',
    stage: 'declining',
    leadTimeDays: -16,
    postWindow: 'retrospective only',
    catalyst: null,
    recommendation: 'skip-saturated',
    domains: ['culture'],
    suggestedAngle: 'AFTERMATH — audit the economics of the coverage cycle.',
    saturationRisk: 'high',
    opportunityScore: 5,
    contributingSources: ['events-calendar'],
  };
  setLLM({
    async structured<T>(next: StructuredRequest): Promise<T> {
      request = next;
      return { topics: [aftermath] } as T;
    },
    async research(): Promise<string> {
      throw new Error('DRY_RUN must not research');
    },
  });

  const result = await discoverTopics('2026-07-19');

  assert.match(request?.system ?? '', /catalyst may be non-null ONLY.*explicit full calendar date/is);
  assert.match(request?.system ?? '', /past event may be retained ONLY.*AFTERMATH\/RETROSPECTIVE/is);
  assert.match(request?.system ?? '', /catalyst=null, use stage=declining/is);
  assert.deepEqual(result.topics, []);
  assert.deepEqual(result.skipped, [{
    title: aftermath.title,
    stage: 'declining',
    recommendation: 'skip-saturated',
  }]);
});

test('verification blocks an already-happened event and logs the reason before Telegram', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trend-event-verify-block-'));
  mutableConfig.dryRun = false;
  mutableConfig.dataDir = `${dir}${sep}`;
  let researchCalls = 0;
  let telegramCalls = 0;
  setLLM({
    async structured<T>(): Promise<T> {
      throw new Error('pitch verification must use research()');
    },
    async research(prompt): Promise<string> {
      researchCalls++;
      assert.match(prompt, /Verify: is Flagship product launch scheduled for 2026-07-31/);
      assert.match(prompt, /already happened as of 2026-07-19/);
      return 'VERDICT: ALREADY_OCCURRED\nThe event already happened on July 3, 2026.';
    },
  });
  setTelegramFetch(async () => {
    telegramCalls++;
    throw new Error('blocked pitches must never reach Telegram');
  });

  try {
    const result = await runPitchGate([pitch()], { dir, today: '2026-07-19' });
    assert.equal(researchCalls, 1);
    assert.equal(telegramCalls, 0);
    assert.equal(result[0]?.status as string, 'blocked-verification');

    const records = jsonl(await readFile(join(dir, 'pitches.jsonl'), 'utf8'));
    assert.equal(records.length, 1);
    assert.equal(records[0]?.status, 'blocked-verification');
    assert.equal(records[0]?.verificationStatus, 'blocked');
    assert.match(String(records[0]?.verificationReason), /already/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('pitch cards render an explicit server-computed date and countdown', () => {
  const card = renderPitchBatch([pitch()], '2026-07-19');
  assert.match(card, /Flagship product launch \\\(event: Jul 31, 2026 — 12 days away\\\)/);
  assert.doesNotMatch(card, /\bupcoming\b/i);
});

test('DRY_RUN skips event verification with an audit record and zero network', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trend-event-verify-dry-'));
  mutableConfig.dryRun = true;
  mutableConfig.dataDir = `${dir}${sep}`;
  let llmCalls = 0;
  let telegramCalls = 0;
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
  setTelegramFetch(async () => {
    telegramCalls++;
    throw new Error('DRY_RUN must not call Telegram');
  });
  const originalLog = console.log;
  console.log = () => {};

  try {
    const result = await runPitchGate([pitch()], { dir, today: '2026-07-19' });
    assert.equal(llmCalls, 0);
    assert.equal(telegramCalls, 0);
    assert.equal(result[0]?.status, 'approved');
    const records = jsonl(await readFile(join(dir, 'pitches.jsonl'), 'utf8'));
    assert.equal(records[0]?.verificationStatus, 'skipped');
    assert.match(String(records[0]?.verificationReason), /DRY_RUN/);
    assert.equal(records.at(-1)?.status, 'approved');
  } finally {
    console.log = originalLog;
    await rm(dir, { recursive: true, force: true });
  }
});
