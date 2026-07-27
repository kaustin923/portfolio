import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { discoverTopics } from '../src/agents/trendScout.js';
import { config } from '../src/config.js';
import { resetLLM, setLLM, type StructuredRequest } from '../src/llm.js';
import { collectGdelt } from '../src/sources/gdelt.js';
import { collectGoogleNews } from '../src/sources/googleNews.js';
import { collectSignals, harvestTerms } from '../src/sources/index.js';
import { collectTheSportsDB } from '../src/sources/thesportsdb.js';
import { collectWikipedia } from '../src/sources/wikipedia.js';
import { FORECASTS } from '../src/testing/mockLlm.js';
import type { TrendSignal } from '../src/types.js';

const mutableConfig = config as unknown as { dryRun: boolean };

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

function textResponse(body: string, ok = true): Response {
  return { ok, text: async () => body } as Response;
}

test('DRY_RUN leading sources use fixtures without fetch', async () => {
  assert.equal(config.dryRun, true);
  const savedFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls++;
    throw new Error('DRY_RUN attempted a network request');
  }) as typeof globalThis.fetch;

  try {
    const signals = await collectSignals();
    const sources = new Set(signals.map((signal) => String(signal.source)));
    assert.equal(fetchCalls, 0);
    for (const source of ['thesportsdb', 'wikipedia', 'gdelt', 'google-news']) {
      assert.ok(sources.has(source), `includes ${source} fixture signals`);
    }
  } finally {
    globalThis.fetch = savedFetch;
  }
});

test('new leading-signal fixtures have the TrendSignal shape', async () => {
  for (const name of ['thesportsdb', 'wikipedia', 'gdelt', 'google-news']) {
    const path = new URL(`../fixtures/${name}.json`, import.meta.url);
    const entries = JSON.parse(await readFile(path, 'utf8')) as unknown[];
    assert.ok(entries.length >= 3, `${name} has at least three entries`);
    for (const entry of entries) {
      const signal = entry as Record<string, unknown>;
      assert.equal(signal.source, name);
      assert.equal(typeof signal.externalId, 'string');
      assert.equal(typeof signal.title, 'string');
      assert.equal(typeof signal.score, 'number');
      assert.equal(typeof signal.capturedAt, 'string');
    }
  }
});

test('harvestTerms ranks, sanitizes, deduplicates, and caps candidate terms', () => {
  const signal = (title: string, score: number): TrendSignal => ({
    source: 'mock',
    externalId: `${score}-${title}`,
    title,
    score,
    capturedAt: '2026-07-19T09:00:00Z',
  });
  const signals = [
    signal('Lower-ranked: first candidate!', 20),
    signal('Alpha, Beta! launch arrives today', 100),
    signal('Alpha Beta launch arrives today', 99),
    signal('Single', 98),
    ...Array.from({ length: 12 }, (_, index) => signal(`Topic ${index} extra words`, 80 - index)),
  ];

  const terms = harvestTerms(signals);
  assert.equal(terms.length, 10);
  assert.equal(terms[0], 'Alpha Beta launch arrives');
  assert.equal(terms.filter((term) => term === 'Alpha Beta launch arrives').length, 1);
  assert.ok(!terms.some((term) => /[,:!?]/.test(term)));
  assert.deepEqual(terms.slice(1, 3), ['Topic 0 extra words', 'Topic 1 extra words']);
});

test('TheSportsDB maps only events in the injected 30-day window', async () => {
  const savedFetch = globalThis.fetch;
  const savedDryRun = mutableConfig.dryRun;
  mutableConfig.dryRun = false;
  let fetchCalls = 0;
  globalThis.fetch = (async (input: string | URL | Request) => {
    fetchCalls++;
    const events = String(input).includes('id=4391')
      ? [
          { idEvent: 'today', strLeague: 'NFL', strEvent: 'Opening Day', dateEvent: '2026-07-19', strSport: 'Football' },
          { idEvent: 'edge', strLeague: 'NFL', strEvent: 'Thirty Days Out', dateEvent: '2026-08-18', strSport: 'Football' },
          { idEvent: 'late', strLeague: 'NFL', strEvent: 'Too Late', dateEvent: '2026-08-19', strSport: 'Football' },
          { idEvent: 'past', strLeague: 'NFL', strEvent: 'Already Played', dateEvent: '2026-07-18', strSport: 'Football' },
        ]
      : [];
    return jsonResponse({ events });
  }) as typeof globalThis.fetch;

  try {
    const signals = await collectTheSportsDB(new Date('2026-07-19T15:30:00Z'));
    assert.equal(fetchCalls, 5);
    assert.deepEqual(signals.map((signal) => signal.externalId), ['tsdb-today', 'tsdb-edge']);
    assert.deepEqual(signals.map((signal) => signal.score), [100, 10]);
    assert.match(signals[0]?.title ?? '', /^NFL: Opening Day \(2026-07-19\)$/);
  } finally {
    mutableConfig.dryRun = savedDryRun;
    globalThis.fetch = savedFetch;
  }
});

test('Wikipedia emits acceleration and skips a zero prior mean', async () => {
  const savedFetch = globalThis.fetch;
  const savedDryRun = mutableConfig.dryRun;
  const savedWatchTerms = process.env.WIKI_WATCH_TERMS;
  mutableConfig.dryRun = false;
  delete process.env.WIKI_WATCH_TERMS;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const zeroPrior = String(input).includes('Zero_Prior');
    const views = zeroPrior
      ? [0, 0, 0, 0, 0, 0, 0, 10, 20]
      : [10, 10, 10, 10, 10, 10, 10, 15, 25];
    return jsonResponse({ items: views.map((value) => ({ views: value })) });
  }) as typeof globalThis.fetch;

  try {
    const signals = await collectWikipedia(
      ['Rising Topic', 'Zero Prior'],
      new Date('2026-07-19T12:00:00Z'),
    );
    assert.equal(signals.length, 1);
    assert.equal(signals[0]?.title, 'Rising Topic');
    assert.equal(signals[0]?.score, 20);
    assert.equal(signals[0]?.velocity, 1);
    assert.equal(signals[0]?.category, 'wiki-pageviews');
  } finally {
    mutableConfig.dryRun = savedDryRun;
    globalThis.fetch = savedFetch;
    if (savedWatchTerms == null) delete process.env.WIKI_WATCH_TERMS;
    else process.env.WIKI_WATCH_TERMS = savedWatchTerms;
  }
});

test('GDELT emits only a rising timeline and scores its last value', async () => {
  const savedFetch = globalThis.fetch;
  const savedDryRun = mutableConfig.dryRun;
  mutableConfig.dryRun = false;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const values = String(input).includes('Falling+Topic') ? [4, 4, 2, 1] : [1, 1, 2, 4];
    return jsonResponse({
      timeline: [{ data: values.map((value, index) => ({ date: String(index), value })) }],
    });
  }) as typeof globalThis.fetch;

  try {
    const signals = await collectGdelt(['Rising Topic', 'Falling Topic']);
    assert.equal(signals.length, 1);
    assert.equal(signals[0]?.title, 'Rising Topic');
    assert.equal(signals[0]?.score, 400);
    assert.equal(signals[0]?.velocity, 1);
    assert.equal(signals[0]?.category, 'news-velocity');
  } finally {
    mutableConfig.dryRun = savedDryRun;
    globalThis.fetch = savedFetch;
  }
});

test('Google News parses at most 25 headlines with rank scoring', async () => {
  const savedFetch = globalThis.fetch;
  const savedDryRun = mutableConfig.dryRun;
  mutableConfig.dryRun = false;
  const items = Array.from(
    { length: 27 },
    (_, index) =>
      `<item><title>${index === 0 ? '<![CDATA[Lead headline]]>' : `Headline ${index}`}</title>` +
      `<link>https://news.example/${index}</link></item>`,
  ).join('');
  globalThis.fetch = (async () => textResponse(`<rss><channel>${items}</channel></rss>`)) as typeof globalThis.fetch;

  try {
    const signals = await collectGoogleNews();
    assert.equal(signals.length, 25);
    assert.equal(signals[0]?.title, 'Lead headline');
    assert.equal(signals[0]?.score, 25);
    assert.equal(signals[24]?.score, 1);
    assert.equal(signals[24]?.externalId, 'gnews-24');
  } finally {
    mutableConfig.dryRun = savedDryRun;
    globalThis.fetch = savedFetch;
  }
});

test('trend scout prompt describes source character and schema admits leading sources', async () => {
  let captured: StructuredRequest | undefined;
  setLLM({
    async structured<T>(request: StructuredRequest): Promise<T> {
      captured = request;
      return { topics: FORECASTS } as T;
    },
    async research(): Promise<string> {
      return '';
    },
  });

  try {
    await discoverTopics('2026-07-19');
    const request = captured;
    assert.ok(request);
    assert.match(request.user, /SIGNAL SOURCE CHARACTER/);
    const schema = request.schema as any;
    const sourceEnum = schema.properties.topics.items.properties.contributingSources.items.enum;
    assert.ok(Array.isArray(sourceEnum));
    assert.ok(sourceEnum.includes('thesportsdb'));
  } finally {
    resetLLM();
  }
});
