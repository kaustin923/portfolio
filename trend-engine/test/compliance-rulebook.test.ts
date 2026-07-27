import assert from 'node:assert/strict';
import { test } from 'node:test';

import { checkCompliance } from '../src/agents/compliance.js';
import { assertRenderableAudio } from '../src/agents/editor.js';
import {
  applySourcingFilters,
  findClips,
  flagEditorialOnly,
  isSocialPlatformCdn,
} from '../src/agents/sourcing.js';
import type {
  AudioProvenance,
  ClipDraft,
  LicenseType,
  SourceClipCandidate,
  Topic,
} from '../src/types.js';

function draft(
  licenseType: LicenseType = 'original',
  overrides: Partial<ClipDraft> = {},
): ClipDraft {
  return {
    id: 'rulebook-draft',
    topicId: 'rulebook-topic',
    sourceCandidateId: 'rulebook-source',
    outputPath: '/tmp/rulebook.mp4',
    aspectRatio: '9:16',
    caption: 'A compliant caption',
    hashtags: ['rulebook'],
    targetPlatforms: ['youtube-shorts'],
    license: {
      type: licenseType,
      requiresAttribution: false,
      commercialUse: true,
      sourceUrl: 'https://example.com/license',
    },
    audioProvenance: { kind: 'source-native', licenseRef: 'https://example.com/license' },
    ...overrides,
  };
}

function candidate(
  id: string,
  overrides: Partial<SourceClipCandidate> = {},
): SourceClipCandidate {
  return {
    id,
    provider: 'test-stock',
    title: 'Clean generic landscape b-roll',
    url: `https://media.example.com/${id}.mp4`,
    durationSec: 12,
    pageUrl: `https://example.com/assets/${id}`,
    license: {
      type: 'stock',
      requiresAttribution: false,
      commercialUse: true,
      sourceUrl: 'https://example.com/stock-license',
    },
    ...overrides,
  };
}

function topic(title: string): Topic {
  return {
    id: 'rulebook-topic',
    title,
    summary: 'Offline sourcing-filter test',
    whyTrending: 'The test exercises sourcing metadata',
    momentum: 'rising',
    longevity: 'sustained',
    stage: 'rising',
    leadTimeDays: 1,
    postWindow: 'now',
    catalyst: null,
    recommendation: 'post-now',
    domains: ['testing'],
    suggestedAngle: 'Explain the sourcing guard',
    saturationRisk: 'low',
    opportunityScore: 80,
    contributingSources: ['mock'],
  };
}

function assertTiered(result: ReturnType<typeof checkCompliance>): void {
  assert.ok(result.tier, 'every compliance result has a tier');
  assert.ok(result.tierReasons?.length, 'every compliance result has tier reasons');
}

test('music gate blocks missing, unresolved, and undocumented licensed audio', () => {
  for (const audioProvenance of [
    undefined,
    { kind: 'unknown' } as const,
    { kind: 'licensed' } as const,
    { kind: 'licensed', licenseRef: '   ' } as const,
  ]) {
    const result = checkCompliance(draft('original', { audioProvenance }));
    assert.equal(result.approved, false);
    assert.equal(result.requiresHumanReview, false);
    assert.equal(result.tier, 'red');
    assert.ok(result.reasons.every((reason) => reason.startsWith('[red]')));
    assertTiered(result);
  }
});

test('TTS, source-native, and documented licensed audio provenance pass', () => {
  const cases: Array<AudioProvenance> = [
    { kind: 'tts', generator: 'macos-say' },
    { kind: 'source-native', licenseRef: 'https://example.com/asset-license' },
    { kind: 'licensed', licenseRef: 'order-123' },
  ];

  for (const audioProvenance of cases) {
    const result = checkCompliance(draft('original', { audioProvenance }));
    assert.equal(result.approved, true);
    assert.equal(result.tier, 'green');
    assertTiered(result);
  }
});

test('assertRenderableAudio enforces the renderer allowlist', () => {
  for (const provenance of [
    { kind: 'tts', generator: 'macos-say' } as const,
    { kind: 'source-native' } as const,
    { kind: 'none' } as const,
    { kind: 'licensed', licenseRef: 'receipt-456' } as const,
  ]) {
    assert.doesNotThrow(() => assertRenderableAudio(provenance));
  }

  for (const provenance of [
    undefined,
    { kind: 'unknown' } as AudioProvenance,
    { kind: 'licensed' } as AudioProvenance,
    { kind: 'licensed', licenseRef: '  ' } as AudioProvenance,
    { kind: 'platform-library' } as unknown as AudioProvenance,
  ]) {
    assert.throws(() => assertRenderableAudio(provenance), /audio|license/i);
  }
});

test('social CDN recognition is suffix-safe and malformed URLs fail open', () => {
  assert.equal(isSocialPlatformCdn('https://v16.tiktokcdn.com/video.mp4'), true);
  assert.equal(isSocialPlatformCdn('https://scontent.cdninstagram.com/video.mp4'), true);
  assert.equal(isSocialPlatformCdn('https://fbcdn.net/video.mp4'), true);
  assert.equal(isSocialPlatformCdn('https://evil-tiktokcdn.com/video.mp4'), false);
  assert.equal(isSocialPlatformCdn('not a URL'), false);
});

test('sourcing drops social-CDN and conservative re-export candidates', () => {
  const candidates = [
    candidate('tiktok-cdn', { url: 'https://v16.tiktokcdn.com/video.mp4' }),
    candidate('instagram-cdn', { url: 'https://scontent.cdninstagram.com/video.mp4' }),
    candidate('repost', { title: 'This clip was reposted from TikTok' }),
    candidate('bare-reel', { title: 'A fishing reel beside a lake' }),
    candidate('clean'),
  ];
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(' '));

  try {
    const surviving = applySourcingFilters(candidates);
    assert.deepEqual(
      surviving.map(({ id }) => id),
      ['bare-reel', 'clean'],
    );
    assert.equal(warnings.length, 3);
    assert.ok(
      warnings.every((warning) =>
        warning.startsWith('[sourcing] rejected platform re-export/watermark candidate:'),
      ),
    );
  } finally {
    console.warn = originalWarn;
  }
});

test('findClips applies the metadata rejection after provider collection', async () => {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(' '));

  try {
    assert.deepEqual(await findClips(topic('Reposted from TikTok')), []);
    assert.equal(warnings.length, 4);
  } finally {
    console.warn = originalWarn;
  }
});

test('editorial-stock filter flags recognizable brands and events only', () => {
  const flagged = flagEditorialOnly(
    candidate('editorial', {
      title: 'Nike logo at the Super Bowl',
      description: 'A celebrity arrives on the red carpet',
      tags: ['stadium crowd'],
    }),
  );
  assert.equal(flagged.editorialOnly, true);
  assert.ok(flagged.editorialReasons?.length);
  assert.ok(
    flagged.editorialReasons?.includes("title mentions 'super bowl' (live event)"),
  );
  assert.ok(flagged.editorialReasons?.some((reason) => /nike.*brand/i.test(reason)));

  const generic = flagEditorialOnly(candidate('generic'));
  assert.equal(generic.editorialOnly, undefined);
  assert.equal(generic.editorialReasons, undefined);
});

test('compliance assigns green, yellow, and red tiers in rulebook order', () => {
  const original = checkCompliance(draft('original'));
  assert.equal(original.tier, 'green');
  assert.equal(original.requiresHumanReview, false);
  assert.deepEqual(original.tierReasons, ['green: owner-original content']);

  const stock = checkCompliance(draft('stock'));
  assert.equal(stock.tier, 'green');
  assert.equal(stock.requiresHumanReview, true);

  const ccBy = checkCompliance(draft('cc-by'));
  assert.equal(ccBy.tier, 'yellow');
  assert.equal(ccBy.approved, true);
  assert.equal(ccBy.requiresHumanReview, true);
  assert.ok(ccBy.tierReasons?.some((reason) => /original creator/i.test(reason)));
  assert.ok(ccBy.tierReasons?.some((reason) => /embedded music/i.test(reason)));
  assert.ok(ccBy.tierReasons?.some((reason) => /attribution.*rendered/i.test(reason)));
  assert.ok(ccBy.tierReasons?.some((reason) => /verification note.*provenance ledger/i.test(reason)));

  const licensed = checkCompliance(draft('licensed'));
  assert.equal(licensed.tier, 'yellow');
  assert.ok(licensed.tierReasons?.some((reason) => /all target platforms/i.test(reason)));
  assert.ok(licensed.tierReasons?.some((reason) => /receipt\/order ID/i.test(reason)));
  assert.ok(licensed.tierReasons?.some((reason) => /transformation bar/i.test(reason)));
  assert.ok(licensed.tierReasons?.some((reason) => /expected-value note/i.test(reason)));

  const editorial = checkCompliance(draft('stock', { editorialOnly: true }));
  assert.equal(editorial.tier, 'yellow');
  assert.equal(editorial.approved, true);

  const editorialAd = checkCompliance(
    draft('stock', { editorialOnly: true, adAdjacent: true }),
  );
  assert.equal(editorialAd.tier, 'red');
  assert.equal(editorialAd.approved, false);
  assert.equal(editorialAd.requiresHumanReview, false);

  const unknown = checkCompliance(
    draft('unknown', {
      license: {
        type: 'unknown',
        requiresAttribution: false,
        commercialUse: 'unknown',
        sourceUrl: '',
      },
    }),
  );
  assert.equal(unknown.tier, 'red');
  assert.equal(unknown.approved, false);

  const templated = checkCompliance(
    draft('original', { complianceFlags: ['template-similarity'] }),
  );
  assert.equal(templated.tier, 'yellow');
  assert.equal(templated.requiresHumanReview, true);
  assert.ok(
    templated.tierReasons?.includes(
      'template-similarity: vary hook/structure before posting',
    ),
  );

  const watermarkBackstop = checkCompliance(
    draft('stock', {
      license: {
        type: 'stock',
        requiresAttribution: false,
        commercialUse: true,
        sourceUrl: 'https://v16.tiktokcdn.com/source.mp4',
      },
    }),
  );
  assert.equal(watermarkBackstop.tier, 'red');
  assert.equal(watermarkBackstop.approved, false);

  for (const result of [
    original,
    stock,
    ccBy,
    licensed,
    editorial,
    editorialAd,
    unknown,
    templated,
    watermarkBackstop,
  ]) {
    assertTiered(result);
  }
});

test('existing commercial-use, attribution, and source URL checks remain enforced', () => {
  const failures = [
    draft('stock', {
      license: {
        type: 'stock',
        requiresAttribution: false,
        commercialUse: false,
        sourceUrl: 'https://example.com/license',
      },
    }),
    draft('cc-by', {
      license: {
        type: 'cc-by',
        requiresAttribution: true,
        commercialUse: true,
        sourceUrl: 'https://example.com/license',
      },
    }),
    draft('stock', {
      license: {
        type: 'stock',
        requiresAttribution: false,
        commercialUse: true,
        sourceUrl: '',
      },
    }),
  ];

  for (const input of failures) {
    const result = checkCompliance(input);
    assert.equal(result.approved, false);
    assertTiered(result);
  }
});
