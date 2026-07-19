/**
 * Editor agent tests.
 *
 * `buildFfmpegArgs` is pure, so the render command — scaling, cropping,
 * trimming, caption burn-in, attribution card, and drawtext escaping — is
 * verified without ffmpeg installed. `draftClip` is exercised in DRY_RUN with
 * the mock brain, proving the agent produces a well-formed ClipDraft offline.
 *
 *   node --import tsx --test test/editor.test.ts
 */

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { setLLM, resetLLM } from '../src/llm.js';
import { makeMockLLM } from '../src/testing/mockLlm.js';
import { buildFfmpegArgs, draftClip, MAX_CLIP_SECONDS } from '../src/agents/editor.js';
import { config } from '../src/config.js';
import type { LicenseInfo, SourceClipCandidate, Topic } from '../src/types.js';

before(() => setLLM(makeMockLLM()));
after(() => resetLLM());

// ── Fixtures ────────────────────────────────────────────────────────────────

const stockLicense: LicenseInfo = {
  type: 'stock',
  requiresAttribution: false,
  commercialUse: true,
  sourceUrl: 'https://www.pexels.com/video/123/',
};

const ccByLicense: LicenseInfo = {
  type: 'cc-by',
  requiresAttribution: true,
  attributionText: 'Video: NASA (public archive)',
  commercialUse: true,
  sourceUrl: 'https://images.nasa.gov/details/xyz',
};

const topic: Topic = {
  id: 'meteor',
  title: 'Perseid meteor shower — how/when to watch',
  summary: 'Peak viewing is ~3 weeks out.',
  whyTrending: 'Annual, predictable spike with a clear pre-event window.',
  momentum: 'rising',
  longevity: 'spike',
  stage: 'emerging',
  leadTimeDays: 22,
  postWindow: 'post 2–5 days before the Aug 12 peak',
  catalyst: 'Perseid meteor shower peak',
  recommendation: 'prepare',
  domains: ['science', 'educational'],
  suggestedAngle: 'A 45s explainer: best time, direction, and no-gear viewing tips.',
  saturationRisk: 'low',
  opportunityScore: 84,
  contributingSources: ['hackernews', 'google-trends'],
};

const candidate: SourceClipCandidate = {
  id: 'cand-1',
  provider: 'generated',
  title: 'Original explainer b-roll',
  url: 'generated://meteor-explainer',
  durationSec: 45,
  license: {
    type: 'original',
    requiresAttribution: false,
    commercialUse: true,
    sourceUrl: 'self',
  },
};

/** The `-vf` filtergraph out of a built argv (single source of truth in tests). */
function vfOf(args: string[]): string {
  const i = args.indexOf('-vf');
  assert.ok(i >= 0, 'argv contains -vf');
  const vf = args[i + 1];
  assert.ok(vf, '-vf has a value');
  return vf;
}

// ── buildFfmpegArgs: geometry per aspect ratio ──────────────────────────────

test('buildFfmpegArgs scales+crops to 1080x1920 for 9:16', () => {
  const vf = vfOf(
    buildFfmpegArgs('in.mp4', 'out.mp4', {
      aspectRatio: '9:16',
      caption: 'hello',
      license: stockLicense,
    }),
  );
  assert.ok(vf.includes('scale=1080:1920:force_original_aspect_ratio=increase'));
  assert.ok(vf.includes('crop=1080:1920'));
});

test('buildFfmpegArgs scales+crops to 1080x1080 for 1:1', () => {
  const vf = vfOf(
    buildFfmpegArgs('in.mp4', 'out.mp4', {
      aspectRatio: '1:1',
      caption: 'hello',
      license: stockLicense,
    }),
  );
  assert.ok(vf.includes('scale=1080:1080:force_original_aspect_ratio=increase'));
  assert.ok(vf.includes('crop=1080:1080'));
});

test('buildFfmpegArgs scales+crops to 1920x1080 for 16:9', () => {
  const vf = vfOf(
    buildFfmpegArgs('in.mp4', 'out.mp4', {
      aspectRatio: '16:9',
      caption: 'hello',
      license: stockLicense,
    }),
  );
  assert.ok(vf.includes('scale=1920:1080:force_original_aspect_ratio=increase'));
  assert.ok(vf.includes('crop=1920:1080'));
});

// ── buildFfmpegArgs: trimming ───────────────────────────────────────────────

test('buildFfmpegArgs trims long sources to the 30s ceiling', () => {
  const args = buildFfmpegArgs('in.mp4', 'out.mp4', {
    aspectRatio: '9:16',
    caption: 'hello',
    license: stockLicense,
    sourceDurationSec: 300,
  });
  const i = args.indexOf('-t');
  assert.ok(i >= 0, 'argv contains -t');
  assert.equal(args[i + 1], String(MAX_CLIP_SECONDS));
});

test('buildFfmpegArgs keeps a shorter source at its own duration', () => {
  const args = buildFfmpegArgs('in.mp4', 'out.mp4', {
    aspectRatio: '9:16',
    caption: 'hello',
    license: stockLicense,
    sourceDurationSec: 12,
  });
  const i = args.indexOf('-t');
  assert.equal(args[i + 1], '12');
});

// ── buildFfmpegArgs: attribution card ───────────────────────────────────────

test('attribution drawtext appears ONLY when the license requires it', () => {
  const base = { aspectRatio: '9:16' as const, caption: 'hello' };

  const withAttr = vfOf(buildFfmpegArgs('in.mp4', 'out.mp4', { ...base, license: ccByLicense }));
  const withoutAttr = vfOf(
    buildFfmpegArgs('in.mp4', 'out.mp4', { ...base, license: stockLicense }),
  );

  const count = (s: string) => s.split('drawtext=').length - 1;
  assert.equal(count(withAttr), 2, 'caption + attribution drawtext when attribution required');
  assert.equal(count(withoutAttr), 1, 'caption drawtext only when no attribution required');
  assert.ok(withAttr.includes('Video: NASA (public archive)'), 'attribution text is burned in');
});

// ── buildFfmpegArgs: drawtext escaping ──────────────────────────────────────

test('drawtext escaping handles colons, apostrophes, %, and backslashes', () => {
  const vf = vfOf(
    buildFfmpegArgs('in.mp4', 'out.mp4', {
      aspectRatio: '9:16',
      caption: "It's alive: 100% \\ wild",
      license: stockLicense,
    }),
  );

  // Full escaped form: filtergraph-level single quotes with the apostrophe
  // spliced out as '\'' ; drawtext-level \% and \\ for literal % and \.
  assert.ok(
    vf.includes("text='It'\\''s alive: 100\\% \\\\ wild'"),
    `caption escaped correctly in: ${vf}`,
  );
  // The raw unescaped forms must NOT leak through.
  assert.ok(!vf.includes('100% '), 'bare % must not survive escaping');
});

// ── draftClip in DRY_RUN ────────────────────────────────────────────────────

test('DRY_RUN draftClip returns a well-formed ClipDraft without exec-ing ffmpeg', async () => {
  assert.equal(config.dryRun, true, 'tests must run in DRY_RUN');

  const draft = await draftClip(topic, candidate);

  assert.ok(draft.caption.length > 0, 'caption is non-empty (mock LLM copy)');
  assert.ok(draft.hashtags.length > 0, 'hashtags are present');
  assert.equal(draft.id, `draft-${candidate.id}`);
  assert.equal(draft.topicId, topic.id);
  assert.equal(draft.sourceCandidateId, candidate.id);
  assert.equal(draft.aspectRatio, '9:16');
  assert.ok(draft.outputPath.endsWith(`${candidate.id}.mp4`), 'planned outputPath is set');
  assert.deepEqual(draft.license, candidate.license, 'license travels with the draft');
  assert.deepEqual(draft.targetPlatforms, config.publishing.defaultPlatforms);
});
