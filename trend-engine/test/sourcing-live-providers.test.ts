import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { findClips } from '../src/agents/sourcing.js';
import { config } from '../src/config.js';
import { requireEnv, resetFetch, setFetch } from '../src/clips/http.js';
import { mapNasa } from '../src/clips/nasa.js';
import { mapPexels } from '../src/clips/pexels.js';
import { mapPixabay } from '../src/clips/pixabay.js';
import { mapWikimedia } from '../src/clips/wikimedia.js';
import type { Topic } from '../src/types.js';

const topic: Topic = {
  id: 'fixture-topic',
  title: 'Moon landing',
  summary: 'A test topic',
  whyTrending: 'Tests need a complete Topic contract',
  momentum: 'rising',
  longevity: 'evergreen',
  stage: 'rising',
  leadTimeDays: 3,
  postWindow: 'this week',
  catalyst: null,
  recommendation: 'post-now',
  domains: ['science'],
  suggestedAngle: 'How the footage was made',
  saturationRisk: 'low',
  opportunityScore: 90,
  contributingSources: ['mock'],
};

afterEach(() => resetFetch());

test('DRY_RUN sourcing returns safe fixtures in preference order without fetch', async () => {
  assert.equal(config.dryRun, true);
  let fetchCalls = 0;
  setFetch((async () => {
    fetchCalls++;
    throw new Error('DRY_RUN attempted a network request');
  }) as typeof globalThis.fetch);

  const candidates = await findClips(topic);

  assert.equal(fetchCalls, 0);
  assert.equal(candidates[0]?.provider, 'pexels');
  assert.deepEqual(
    candidates.map((candidate) => candidate.provider),
    ['pexels', 'pixabay', 'nasa', 'wikimedia'],
  );
  assert.ok(!candidates.some((candidate) => candidate.provider === 'generated'));
  assert.ok(
    !candidates.some(
      (candidate) => candidate.license.type === 'original' || candidate.license.type === 'unknown',
    ),
  );
  for (const candidate of candidates) {
    assert.equal(candidate.license.commercialUse, true);
    assert.ok(candidate.license.sourceUrl.trim());
    if (candidate.license.requiresAttribution) {
      assert.ok(candidate.license.attributionText?.trim());
    }
  }
});

test('mapPexels selects the portrait MP4 rendition closest to target height', () => {
  const candidates = mapPexels(
    {
      videos: [
        {
          id: 123,
          duration: 19,
          image: 'https://images.pexels.com/videos/123/preview.jpg',
          url: 'https://www.pexels.com/video/123/',
          user: { name: 'Ada Creator' },
          video_files: [
            {
              file_type: 'video/mp4',
              width: 960,
              height: 540,
              link: 'https://videos.pexels.com/video-files/123/landscape.mp4',
            },
            {
              file_type: 'video/mp4',
              width: 1080,
              height: 1920,
              link: 'https://videos.pexels.com/video-files/123/portrait.mp4',
            },
          ],
        },
      ],
    },
    topic,
  );

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.url, 'https://videos.pexels.com/video-files/123/portrait.mp4');
  assert.equal(candidates[0]?.width, 1080);
  assert.equal(candidates[0]?.height, 1920);
});

test('mapPixabay falls back to medium and prefers a non-empty large rendition', () => {
  const candidates = mapPixabay(
    {
      hits: [
        {
          id: 1,
          duration: 12,
          user: 'Medium User',
          pageURL: 'https://pixabay.com/videos/medium-1/',
          videos: {
            large: { url: '', width: 3840, height: 2160 },
            medium: {
              url: 'https://cdn.pixabay.com/video/medium.mp4',
              width: 1920,
              height: 1080,
            },
          },
        },
        {
          id: 2,
          duration: 14,
          user: 'Large User',
          pageURL: 'https://pixabay.com/videos/large-2/',
          videos: {
            large: {
              url: 'https://cdn.pixabay.com/video/large.mp4',
              width: 3840,
              height: 2160,
            },
            medium: {
              url: 'https://cdn.pixabay.com/video/medium-2.mp4',
              width: 1920,
              height: 1080,
            },
          },
        },
      ],
    },
    topic,
  );

  assert.equal(candidates[0]?.url, 'https://cdn.pixabay.com/video/medium.mp4');
  assert.equal(candidates[1]?.url, 'https://cdn.pixabay.com/video/large.mp4');
});

test('mapWikimedia admits only resolved CC0, public-domain, and plain CC BY licenses', () => {
  const page = (pageid: number, license?: string, artist = '<a>Grace Hopper</a>') => ({
    pageid,
    title: `File:Example ${pageid}.webm`,
    videoinfo: [
      {
        url: `https://upload.wikimedia.org/example-${pageid}.webm`,
        descriptionurl: `https://commons.wikimedia.org/wiki/File:Example_${pageid}.webm`,
        width: 1080,
        height: 1920,
        duration: 12.4,
        ...(license
          ? {
              extmetadata: {
                LicenseShortName: { value: license },
                Artist: { value: artist },
                Credit: { value: 'Archive credit' },
              },
            }
          : {}),
      },
    ],
  });
  const candidates = mapWikimedia(
    {
      query: {
        pages: {
          1: page(1, 'CC BY 4.0'),
          2: page(2, 'CC BY-SA 4.0'),
          3: page(3, 'CC BY-NC 2.0'),
          4: page(4),
          5: page(5, 'CC0'),
          6: page(6, 'Public domain'),
        },
      },
    },
    topic,
  );

  assert.deepEqual(
    candidates.map((candidate) => candidate.license.type),
    ['cc-by', 'cc0', 'public-domain'],
  );
  assert.deepEqual(
    candidates.map((candidate) => candidate.id),
    ['wikimedia-1', 'wikimedia-5', 'wikimedia-6'],
  );
  assert.match(candidates[0]?.license.attributionText ?? '', /Grace Hopper/);
  assert.match(candidates[0]?.license.attributionText ?? '', /— modified$/);
});

test('mapNasa excludes third-party records and selects the original MP4', () => {
  const candidates = mapNasa(
    {
      collection: {
        items: [
          {
            data: [
              {
                nasa_id: 'third-party',
                title: 'Archive package',
                description: 'Courtesy of Getty Images',
              },
            ],
            _renditions: ['https://images-assets.nasa.gov/third-party~orig.mp4'],
          },
          {
            data: [
              {
                nasa_id: 'NASA-123',
                title: 'Apollo footage',
                description: 'Astronauts on the lunar surface',
                duration: 42,
              },
            ],
            _renditions: [
              'https://images-assets.nasa.gov/apollo~large.mp4',
              'https://images-assets.nasa.gov/apollo~orig.mp4',
            ],
          },
        ],
      },
    },
    topic,
  );

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.id, 'nasa-NASA-123');
  assert.equal(candidates[0]?.url, 'https://images-assets.nasa.gov/apollo~orig.mp4');
  assert.equal(candidates[0]?.license.attributionText, 'Video: NASA');
  assert.equal(candidates[0]?.license.requiresAttribution, true);
});

test('requireEnv fails loud with the missing variable name', () => {
  const name = 'TREND_ENGINE_TEST_MISSING_KEY';
  const previous = process.env[name];
  delete process.env[name];
  try {
    assert.throws(
      () => requireEnv(name, 'Example'),
      new Error(`Missing ${name} — required for live Example sourcing`),
    );
  } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
});
