import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { test } from 'node:test';

import { config } from '../src/config.js';
import { collectEventsCalendar } from '../src/sources/eventsCalendar.js';
import { collectGdelt } from '../src/sources/gdelt.js';
import {
  collectSignals,
  getSourcesFetch,
  resetSourcesFetch,
  setSourcesFetch,
} from '../src/sources/index.js';
import { collectWikipedia } from '../src/sources/wikipedia.js';

interface MutableConfig {
  dryRun: boolean;
  dataDir: string;
  trendScout: { geo: string; subreddits: string[] };
  apiKeys: { youtube: string };
}

const mutableConfig = config as unknown as MutableConfig;

async function withConfig<T>(
  changes: Partial<Pick<MutableConfig, 'dryRun' | 'dataDir'>> & {
    geo?: string;
    youtube?: string;
  },
  run: () => Promise<T>,
): Promise<T> {
  const original = {
    dryRun: mutableConfig.dryRun,
    dataDir: mutableConfig.dataDir,
    geo: mutableConfig.trendScout.geo,
    youtube: mutableConfig.apiKeys.youtube,
  };
  if (changes.dryRun != null) mutableConfig.dryRun = changes.dryRun;
  if (changes.dataDir != null) mutableConfig.dataDir = changes.dataDir;
  if (changes.geo != null) mutableConfig.trendScout.geo = changes.geo;
  if (changes.youtube != null) mutableConfig.apiKeys.youtube = changes.youtube;
  try {
    return await run();
  } finally {
    resetSourcesFetch();
    mutableConfig.dryRun = original.dryRun;
    mutableConfig.dataDir = original.dataDir;
    mutableConfig.trendScout.geo = original.geo;
    mutableConfig.apiKeys.youtube = original.youtube;
  }
}

test('DRY_RUN uses every fixture, including events-calendar, without network', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trend-source-health-dry-'));
  try {
    await withConfig({ dryRun: true, dataDir: `${dir}${sep}` }, async () => {
      let fetchCalls = 0;
      setSourcesFetch(async () => {
        fetchCalls++;
        throw new Error('DRY_RUN attempted network access');
      });
      assert.equal(getSourcesFetch() instanceof Function, true);

      const calendar = await collectEventsCalendar();
      assert.ok(calendar.length > 0);
      assert.ok(calendar.every((signal) => signal.source === 'events-calendar'));
      assert.ok(calendar.every((signal) => signal.capturedAt === '2026-07-19T12:00:00.000Z'));

      const collected = await collectSignals();
      assert.equal(fetchCalls, 0);
      assert.ok(collected.signals.some((signal) => signal.source === 'events-calendar'));
      assert.ok(collected.health.every((source) => source.status === 'fixture'));
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Wikipedia resolves canonical titles and accepts a rising seven-day pageview window', async () => {
  const savedWatchTerms = process.env.WIKI_WATCH_TERMS;
  delete process.env.WIKI_WATCH_TERMS;
  try {
    await withConfig({ dryRun: false }, async () => {
      const urls: string[] = [];
      setSourcesFetch(async (input) => {
        const url = new URL(String(input));
        urls.push(url.toString());
        if (url.searchParams.get('action') === 'opensearch') {
          assert.equal(url.searchParams.get('search'), 'raw multi word fragment');
          return Response.json([
            'raw multi word fragment',
            ['Canonical Article'],
            [''],
            ['https://en.wikipedia.org/wiki/Canonical_Article'],
          ]);
        }
        assert.match(url.pathname, /Canonical_Article/);
        return Response.json({
          items: [10, 10, 10, 10, 10, 30, 40].map((views) => ({ views })),
        });
      });

      const signals = await collectWikipedia(
        ['raw multi word fragment'],
        new Date('2026-07-19T12:00:00Z'),
      );
      assert.equal(urls.length, 2);
      assert.equal(signals.length, 1);
      assert.equal(signals[0]?.title, 'Canonical Article');
      assert.equal(signals[0]?.score, 35);
      assert.equal(signals[0]?.source, 'wikipedia');
    });
  } finally {
    if (savedWatchTerms == null) delete process.env.WIKI_WATCH_TERMS;
    else process.env.WIKI_WATCH_TERMS = savedWatchTerms;
  }
});

test('GDELT quotes phrases, keeps partial successes, and exposes non-JSON bodies', async () => {
  await withConfig({ dryRun: false }, async () => {
    const queries: string[] = [];
    setSourcesFetch(async (input) => {
      const url = new URL(String(input));
      const query = url.searchParams.get('query') ?? '';
      queries.push(query);
      if (query.includes('broken response')) {
        return new Response('upstream overloaded: please retry later', {
          status: 503,
          headers: { 'content-type': 'text/plain' },
        });
      }
      return Response.json({
        timeline: [{ data: [1, 1, 2, 4].map((value) => ({ value })) }],
      });
    });

    const partial = await collectGdelt(['two word phrase', 'broken response']);
    assert.equal(partial.length, 1);
    assert.ok(queries.includes('"two word phrase"'));
    assert.ok(queries.includes('"broken response"'));

    await assert.rejects(
      collectGdelt(['broken response']),
      /upstream overloaded: please retry later/,
    );
  });
});

test('events calendar builds UTC month categories, filters non-events, and caps at 20', async () => {
  await withConfig({ dryRun: false, geo: 'US' }, async () => {
    const categories: string[] = [];
    const rejected = [
      'List of July observances',
      'Killing of Example Person',
      'Category:July 2026 events',
      'Timeline of summer 2026',
      'Deaths in July 2026',
      'Death of Example Person',
      'Federal law enforcement actions in 2026',
    ];
    setSourcesFetch(async (input) => {
      const url = new URL(String(input));
      const category = url.searchParams.get('cmtitle') ?? '';
      categories.push(category);
      const month = category.includes('July') ? 'July' : 'August';
      const titles = month === 'July'
        ? ['Metro Comic-Con 2026', ...rejected, ...Array.from({ length: 24 }, (_, i) => `Film Festival ${i}`)]
        : ['National Awards Show'];
      return Response.json({
        query: { categorymembers: titles.map((title) => ({ title })) },
      });
    });

    const signals = await collectEventsCalendar(new Date('2026-07-19T23:30:00Z'));
    assert.deepEqual(categories, [
      'Category:July 2026 in the United States',
      'Category:August 2026 in the United States',
    ]);
    assert.equal(signals.length, 20);
    assert.ok(signals.some((signal) => signal.title === 'Metro Comic-Con 2026'));
    assert.ok(signals.every((signal) => !rejected.includes(signal.title)));
    assert.ok(signals.every((signal) => signal.source === 'events-calendar'));
    assert.equal(signals[0]?.score, 60);
    assert.equal(signals[0]?.externalId, 'evcal-metro-comic-con-2026');
  });
});

test('collectSignals reports every health status, keeps healthy signals, and appends JSONL', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trend-source-health-live-'));
  try {
    await withConfig(
      { dryRun: false, dataDir: `${dir}${sep}`, geo: 'US', youtube: '' },
      async () => {
        const seenUrls: string[] = [];
        setSourcesFetch(async (input, init) => {
          const url = new URL(String(input));
          seenUrls.push(url.toString());
          assert.ok(init?.signal, `timeout signal supplied for ${url.hostname}`);

          if (url.hostname === 'www.reddit.com') return new Response('', { status: 403 });
          if (url.hostname === 'trends.google.com') {
            return new Response(
              '<rss><channel><item><title>Breakout Topic</title>' +
              '<ht:approx_traffic>2000+</ht:approx_traffic></item></channel></rss>',
            );
          }
          if (url.hostname === 'hn.algolia.com') return Response.json({ hits: [] });
          if (url.hostname === 'www.thesportsdb.com') {
            throw new DOMException('request timed out', 'TimeoutError');
          }
          if (url.hostname === 'news.google.com') {
            return new Response(
              '<rss><channel><item><title>Healthy Headline</title>' +
              '<link>https://news.example/healthy</link></item></channel></rss>',
            );
          }
          if (url.hostname === 'en.wikipedia.org' && url.searchParams.get('list') === 'categorymembers') {
            return Response.json({
              query: { categorymembers: [{ title: 'Regional Comic-Con' }] },
            });
          }
          if (url.hostname === 'en.wikipedia.org' && url.searchParams.get('action') === 'opensearch') {
            return Response.json([url.searchParams.get('search'), [], [], []]);
          }
          if (url.hostname === 'api.gdeltproject.org') {
            return Response.json({ timeline: [{ data: [1, 1, 1].map((value) => ({ value })) }] });
          }
          throw new Error(`unexpected URL: ${url}`);
        });

        const { signals, health } = await collectSignals();
        const bySource = new Map(health.map((source) => [source.source, source]));
        assert.equal(bySource.get('google-trends')?.status, 'ok');
        assert.equal(bySource.get('hackernews')?.status, 'empty');
        assert.equal(
          bySource.get('hackernews')?.detail,
          'fetched OK but rising-set/filter produced 0',
        );
        assert.equal(bySource.get('reddit')?.status, 'error');
        assert.equal(
          bySource.get('reddit')?.detail,
          'HTTP 403 - Reddit blocks datacenter/non-browser clients; set REDDIT_UA or accept degraded coverage',
        );
        assert.equal(bySource.get('thesportsdb')?.status, 'timeout');
        assert.equal(bySource.get('youtube')?.status, 'disabled');
        assert.match(bySource.get('youtube')?.detail ?? '', /restart the daemon after adding keys/);
        assert.ok(health.every((source) => source.count >= 0 && source.ms >= 0));

        assert.ok(signals.some((signal) => signal.source === 'google-trends' && signal.score === 2000));
        assert.ok(signals.some((signal) => signal.source === 'google-news'));
        assert.ok(signals.some((signal) => signal.source === 'events-calendar'));
        assert.ok(seenUrls.some((url) => url.startsWith('https://trends.google.com/trending/rss?')));
        assert.ok(!seenUrls.some((url) => url.includes('/trendingsearches/daily/rss')));
        assert.ok(!seenUrls.some((url) => url.includes('googleapis.com/youtube')));

        const lines = (await readFile(join(dir, 'source-health.jsonl'), 'utf8'))
          .trim()
          .split('\n');
        assert.equal(lines.length, 1);
        const record = JSON.parse(lines[0] ?? '{}') as {
          at?: string;
          dryRun?: boolean;
          sources?: unknown[];
        };
        assert.equal(record.dryRun, false);
        assert.equal(record.sources?.length, 9);
        assert.ok(Number.isFinite(Date.parse(record.at ?? '')));
      },
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
