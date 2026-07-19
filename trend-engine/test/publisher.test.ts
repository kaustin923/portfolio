/**
 * Publisher tests — the DRY_RUN contract and the skip-on-missing-creds
 * contract. Fully hermetic: no network, no credentials, and both `config` and
 * `process.env` are restored after every test that patches them.
 *
 *   node --import tsx --test test/publisher.test.ts
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { config } from '../src/config.js';
import { publish } from '../src/agents/publisher.js';
import { publishToInstagram } from '../src/publishers/instagram.js';
import { publishToTikTok } from '../src/publishers/tiktok.js';
import { publishToX } from '../src/publishers/x.js';
import { publishToYouTube } from '../src/publishers/youtube.js';
import type { ClipDraft, Platform, PublishResult } from '../src/types.js';

const ALL_PLATFORMS: Platform[] = ['tiktok', 'youtube-shorts', 'instagram-reels', 'x'];

/** Every credential env var the adapters read. */
const CRED_VARS = [
  'YOUTUBE_OAUTH_TOKEN',
  'TIKTOK_ACCESS_TOKEN',
  'IG_USER_ID',
  'IG_ACCESS_TOKEN',
  'X_ACCESS_TOKEN',
] as const;

function makeDraft(targetPlatforms: Platform[]): ClipDraft {
  return {
    id: 'draft-1',
    topicId: 'topic-1',
    sourceCandidateId: 'src-1',
    // Deliberately nonexistent: any code path that tries to read it (a prelude
    // to an upload) throws instead of silently proceeding.
    outputPath: '/nonexistent/clip.mp4',
    aspectRatio: '9:16',
    caption: 'Test caption',
    hashtags: ['test', 'mock'],
    targetPlatforms,
    license: { type: 'original', requiresAttribution: false, commercialUse: true, sourceUrl: 'self' },
  };
}

/** Force live mode + strip all publishing creds; restores on test teardown. */
function forceLiveWithoutCreds(t: { after: (fn: () => void) => void }): void {
  const cfg = config as { dryRun: boolean };
  const savedDryRun = cfg.dryRun;
  const savedEnv = new Map<string, string | undefined>(CRED_VARS.map((v) => [v, process.env[v]]));

  cfg.dryRun = false;
  for (const v of CRED_VARS) delete process.env[v];

  t.after(() => {
    cfg.dryRun = savedDryRun;
    for (const [name, value] of savedEnv) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
}

test('DRY_RUN: publish returns one mocked published result per target platform', async () => {
  assert.equal(config.dryRun, true, 'tests must run with the DRY_RUN default');

  const draft = makeDraft(ALL_PLATFORMS);
  const results = await publish(draft, { status: 'approved' });

  assert.equal(results.length, ALL_PLATFORMS.length);
  assert.deepEqual(
    results.map((r) => r.platform),
    ALL_PLATFORMS,
    'one result per target platform, in order',
  );
  for (const r of results) {
    assert.equal(r.status, 'published');
    assert.equal(r.postId, `dryrun-${r.platform}-${draft.id}`);
    assert.ok(r.url, 'dry-run result carries a mock url');
    assert.equal(r.error, undefined);
  }
});

test('publisher never posts without an approved decision', async () => {
  const draft = makeDraft(['tiktok', 'x']);
  for (const status of ['rejected', 'timeout'] as const) {
    const results = await publish(draft, { status });
    assert.equal(results.length, 2);
    for (const r of results) {
      assert.equal(r.status, 'skipped');
      assert.match(r.error ?? '', new RegExp(status));
    }
  }
});

test('live mode + missing creds: every adapter returns skipped, never throws', async (t) => {
  forceLiveWithoutCreds(t);
  const draft = makeDraft(ALL_PLATFORMS);

  const cases: Array<{
    adapter: (d: ClipDraft, c: string) => Promise<PublishResult>;
    platform: Platform;
    expectMissing: RegExp;
  }> = [
    { adapter: publishToYouTube, platform: 'youtube-shorts', expectMissing: /YOUTUBE_OAUTH_TOKEN/ },
    { adapter: publishToTikTok, platform: 'tiktok', expectMissing: /TIKTOK_ACCESS_TOKEN/ },
    {
      adapter: publishToInstagram,
      platform: 'instagram-reels',
      expectMissing: /IG_USER_ID.*IG_ACCESS_TOKEN/,
    },
    { adapter: publishToX, platform: 'x', expectMissing: /X_ACCESS_TOKEN/ },
  ];

  for (const { adapter, platform, expectMissing } of cases) {
    // Must resolve (not reject) even with zero credentials configured.
    const r = await adapter(draft, 'caption');
    assert.equal(r.platform, platform);
    assert.equal(r.status, 'skipped', `${platform} adapter must skip, not throw`);
    assert.match(r.error ?? '', expectMissing, `${platform} names what is missing`);
    assert.equal(r.postId, undefined, `${platform} must not fabricate a postId`);
  }
});

test('live mode + missing creds: publish() aggregates skips without blocking the run', async (t) => {
  forceLiveWithoutCreds(t);

  const results = await publish(makeDraft(ALL_PLATFORMS), { status: 'approved' });
  assert.equal(results.length, ALL_PLATFORMS.length);
  for (const r of results) {
    assert.equal(r.status, 'skipped', `${r.platform} skipped when creds are missing`);
    assert.match(r.error ?? '', /missing credentials/);
  }
});

test('blank (whitespace-only) credentials count as missing, not as live creds', async (t) => {
  forceLiveWithoutCreds(t);
  process.env.X_ACCESS_TOKEN = '   ';

  const r = await publishToX(makeDraft(['x']), 'caption');
  assert.equal(r.status, 'skipped');
  assert.match(r.error ?? '', /X_ACCESS_TOKEN/);
});
