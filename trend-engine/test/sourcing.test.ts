/**
 * Sourcing tests — the license model must be airtight.
 *
 * Two layers:
 *   1. Pure unit tests for `mapWikimediaLicense`, fed realistic Commons
 *      extmetadata shapes (each field is `{ value, source }`), including the
 *      fail-closed paths (garbage → `unknown`).
 *   2. DRY_RUN behavior of `findClips`: offline, no keys, and every candidate
 *      carries a defensible (non-`unknown`) license, ordered best-first.
 *
 *   node --import tsx --test test/sourcing.test.ts
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { config } from '../src/config.js';
import { findClips } from '../src/agents/sourcing.js';
import { mapWikimediaLicense } from '../src/sourcing/wikimedia.js';
import type { Topic } from '../src/types.js';

const FILE_URL = 'https://commons.wikimedia.org/wiki/File:Example_clip.webm';

// ── mapWikimediaLicense ────────────────────────────────────────────────────

test('mapWikimediaLicense: CC0 file → cc0, no attribution, commercial OK', () => {
  const license = mapWikimediaLicense(
    {
      LicenseShortName: { value: 'CC0' },
      License: { value: 'cc0' },
      LicenseUrl: { value: 'https://creativecommons.org/publicdomain/zero/1.0/' },
      UsageTerms: { value: 'Creative Commons Zero, Public Domain Dedication' },
      Artist: { value: '<a href="https://example.org/jane">Jane Doe</a>' },
    },
    FILE_URL,
  );
  assert.equal(license.type, 'cc0');
  assert.equal(license.requiresAttribution, false);
  assert.equal(license.commercialUse, true);
  assert.equal(license.sourceUrl, FILE_URL);
});

test('mapWikimediaLicense: CC BY 4.0 file → cc-by with non-empty attribution', () => {
  const license = mapWikimediaLicense(
    {
      LicenseShortName: { value: 'CC BY 4.0' },
      License: { value: 'cc-by-4.0' },
      LicenseUrl: { value: 'https://creativecommons.org/licenses/by/4.0' },
      UsageTerms: { value: 'Creative Commons Attribution 4.0' },
      Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:AlexF">Alex Filmmaker</a>' },
      AttributionRequired: { value: 'true' },
    },
    FILE_URL,
  );
  assert.equal(license.type, 'cc-by');
  assert.equal(license.requiresAttribution, true);
  assert.ok(license.attributionText, 'attribution text must be attached');
  assert.ok(license.attributionText.length > 0, 'attribution text must be non-empty');
  assert.match(license.attributionText, /Alex Filmmaker/, 'credits the author');
  assert.equal(license.commercialUse, true);
  assert.equal(license.sourceUrl, FILE_URL);
});

test('mapWikimediaLicense: public-domain file → public-domain', () => {
  const license = mapWikimediaLicense(
    {
      LicenseShortName: { value: 'Public domain' },
      License: { value: 'pd-usgov-nasa' },
      UsageTerms: { value: 'Public domain' },
      Artist: { value: 'NASA' },
    },
    FILE_URL,
  );
  assert.equal(license.type, 'public-domain');
  assert.equal(license.requiresAttribution, false);
  assert.equal(license.commercialUse, true);
});

test('mapWikimediaLicense: garbage / empty metadata fails closed to unknown', () => {
  for (const garbage of [
    {},
    { Nonsense: { value: 'lol' } },
    { LicenseShortName: { value: '' }, License: 42 as unknown as string },
    { LicenseShortName: 'Some homebrew license nobody has heard of' },
    null,
    undefined,
  ]) {
    const license = mapWikimediaLicense(garbage as Parameters<typeof mapWikimediaLicense>[0], FILE_URL);
    assert.equal(license.type, 'unknown', `must fail closed for ${JSON.stringify(garbage)}`);
    assert.equal(license.commercialUse, 'unknown');
    assert.equal(license.sourceUrl, FILE_URL, 'still points at where to verify');
  }
});

test('mapWikimediaLicense: CC BY-SA → unknown (no ShareAlike slot; never silently cc-by)', () => {
  const license = mapWikimediaLicense(
    {
      LicenseShortName: { value: 'CC BY-SA 4.0' },
      License: { value: 'cc-by-sa-4.0' },
      LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' },
      Artist: { value: 'Someone' },
    },
    FILE_URL,
  );
  assert.equal(license.type, 'unknown');
});

test('mapWikimediaLicense: NonCommercial variants → unknown with commercialUse false', () => {
  const license = mapWikimediaLicense(
    {
      LicenseShortName: { value: 'CC BY-NC 2.0' },
      License: { value: 'cc-by-nc-2.0' },
      LicenseUrl: { value: 'https://creativecommons.org/licenses/by-nc/2.0' },
    },
    FILE_URL,
  );
  assert.equal(license.type, 'unknown');
  assert.equal(license.commercialUse, false);
});

// ── findClips in DRY_RUN ───────────────────────────────────────────────────

const TOPIC: Topic = {
  id: 'test-topic',
  title: 'Perseid meteor shower — how/when to watch',
  summary: 'Peak viewing is weeks out.',
  whyTrending: 'Annual predictable spike.',
  momentum: 'rising',
  longevity: 'spike',
  stage: 'emerging',
  leadTimeDays: 22,
  postWindow: 'post 2–5 days before peak',
  catalyst: 'Perseid meteor shower peak',
  recommendation: 'prepare',
  domains: ['science'],
  suggestedAngle: '45s explainer',
  saturationRisk: 'low',
  opportunityScore: 84,
  contributingSources: ['google-trends'],
};

test('DRY_RUN: findClips is offline and every candidate has a defensible license', async () => {
  assert.equal(config.dryRun, true, 'tests must run in DRY_RUN');

  const clips = await findClips(TOPIC);
  assert.ok(clips.length >= 1, 'returns at least one candidate');

  for (const clip of clips) {
    assert.ok(clip.license, `${clip.id} carries a LicenseInfo`);
    assert.notEqual(clip.license.type, 'unknown', `${clip.id} must not have unknown provenance`);
    assert.ok(clip.license.sourceUrl.length > 0, `${clip.id} license is verifiable`);
    if (clip.license.requiresAttribution) {
      assert.ok(
        clip.license.attributionText && clip.license.attributionText.length > 0,
        `${clip.id} requires attribution, so text must be attached`,
      );
    }
  }
});

test('DRY_RUN: candidates come back best-licensed first (original → stock → cc)', async () => {
  const clips = await findClips(TOPIC);
  const first = clips[0];
  assert.ok(first, 'has a first candidate');
  assert.equal(first.license.type, 'original', 'safest option leads');

  const stockIdx = clips.findIndex((c) => c.license.type === 'stock');
  const ccIdx = clips.findIndex((c) => c.license.type === 'cc-by');
  assert.ok(stockIdx > 0, 'a stock candidate is present');
  assert.ok(ccIdx > stockIdx, 'CC (attribution-bearing) footage ranks after stock');
});
