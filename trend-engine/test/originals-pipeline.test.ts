import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, sep } from 'node:path';
import { after, test } from 'node:test';

import { draftClip, draftOriginal } from '../src/agents/editor.js';
import { config } from '../src/config.js';
import { resetLLM, setLLM, type LLM, type StructuredRequest } from '../src/llm.js';
import {
  buildTimedAss,
  proportionalCues,
  whisperCues,
} from '../src/media/captions.js';
import {
  captionTextfileFilter,
  getCapabilityProbeCount,
  resetCapabilitiesCache,
} from '../src/media/ffmpeg.js';
import type { SourceClipCandidate, Topic } from '../src/types.js';

const temporaryDirs: string[] = [];

function temporaryDir(): string {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? '/tmp', 'trend-engine-originals-'));
  temporaryDirs.push(dir);
  return `${dir}${sep}`;
}

function redirectDataDir(dir: string): () => void {
  const mutableConfig = config as unknown as { dataDir: string };
  const original = mutableConfig.dataDir;
  mutableConfig.dataDir = dir;
  return () => {
    mutableConfig.dataDir = original;
  };
}

function installCopyLlm(): { requests: StructuredRequest[] } {
  const requests: StructuredRequest[] = [];
  const llm: LLM = {
    async structured<T>(request: StructuredRequest): Promise<T> {
      requests.push(request);
      return {
        script: 'The first fact sets the scene. The second fact explains why it matters.',
        caption: 'A concise original caption',
        hashtags: ['original', 'explainer'],
      } as T;
    },
    async research(): Promise<string> {
      return '';
    },
  };
  setLLM(llm);
  return { requests };
}

const topic: Topic = {
  id: 'original-topic',
  title: 'A testable original story',
  summary: 'A deterministic topic for the original editor path.',
  whyTrending: 'It tests a new production workflow.',
  momentum: 'rising',
  longevity: 'evergreen',
  stage: 'rising',
  leadTimeDays: 4,
  postWindow: 'this week',
  catalyst: null,
  recommendation: 'prepare',
  domains: ['testing'],
  suggestedAngle: 'Explain the workflow clearly.',
  saturationRisk: 'low',
  opportunityScore: 82,
  contributingSources: ['mock'],
};

function candidate(
  id: string,
  overrides: Partial<SourceClipCandidate['license']> = {},
): SourceClipCandidate {
  return {
    id,
    provider: 'test-stock',
    title: `B-roll ${id}`,
    url: `https://example.invalid/${id}.mp4`,
    durationSec: 12,
    pageUrl: `https://example.invalid/assets/${id}`,
    license: {
      type: 'stock',
      requiresAttribution: false,
      commercialUse: true,
      sourceUrl: `https://example.invalid/licenses/${id}`,
      ...overrides,
    },
  };
}

after(() => {
  resetLLM();
  resetCapabilitiesCache();
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

test('proportionalCues allocates contiguous sentence timings by character share', () => {
  const cues = proportionalCues('Short. A considerably longer sentence!', 10);
  assert.equal(cues.length, 2);
  assert.equal(cues[0]?.startSec, 0);
  assert.equal(cues[1]?.startSec, cues[0]?.endSec);
  assert.equal(cues[1]?.endSec, 10);

  const totalCharacters = cues.reduce((total, cue) => total + cue.text.length, 0);
  assert.equal(cues[0]?.endSec, 10 * ((cues[0]?.text.length ?? 0) / totalCharacters));

  assert.deepEqual(proportionalCues('One sentence without terminal punctuation', 3), [
    {
      startSec: 0,
      endSec: 3,
      text: 'One sentence without terminal punctuation',
    },
  ]);
});

test('buildTimedAss emits cue timestamps and optional full-length attribution', () => {
  const cues = [
    { startSec: 0, endSec: 1.25, text: 'First cue' },
    { startSec: 1.25, endSec: 3.456, text: 'Second {cue}' },
  ];
  const withAttribution = buildTimedAss(cues, 'Source: Example', 4);
  assert.ok(
    withAttribution.includes(
      'Dialogue: 0,0:00:00.00,0:00:01.25,Caption,,0,0,0,,First cue',
    ),
  );
  assert.ok(
    withAttribution.includes(
      'Dialogue: 0,0:00:01.25,0:00:03.46,Caption,,0,0,0,,Second cue',
    ),
  );
  assert.ok(
    withAttribution.includes(
      'Dialogue: 0,0:00:00.00,0:00:04.00,Attribution,,0,0,0,,Source: Example',
    ),
  );

  const withoutAttribution = buildTimedAss(cues, undefined, 4);
  assert.doesNotMatch(withoutAttribution, /Dialogue: .*Attribution/);
  assert.equal((withoutAttribution.match(/Dialogue: .*Caption/g) ?? []).length, 2);
});

test('whisperCues parses whisper.cpp JSON millisecond offsets', () => {
  const cues = whisperCues(
    JSON.stringify({
      transcription: [
        { offsets: { from: 0, to: 1250 }, text: ' First cue ' },
        { offsets: { from: 1250, to: 2750 }, text: 'Second cue' },
      ],
    }),
  );
  assert.deepEqual(cues, [
    { startSec: 0, endSec: 1.25, text: 'First cue' },
    { startSec: 1.25, endSec: 2.75, text: 'Second cue' },
  ]);
});

test('DRY_RUN draftOriginal has no media, network, or capability-probe side effects', async () => {
  assert.equal(config.dryRun, true, 'this side-effect proof must execute in DRY_RUN');
  const dataDir = temporaryDir();
  const restoreDataDir = redirectDataDir(dataDir);
  const { requests } = installCopyLlm();
  const originalLog = console.log;
  console.log = () => {};
  resetCapabilitiesCache();
  const probesBefore = getCapabilityProbeCount();
  const broll = candidate('never-downloaded');

  try {
    const draft = await draftOriginal(topic, [broll]);
    assert.equal(requests.length, 1);
    const properties = (
      requests[0]?.schema as { properties?: Record<string, unknown> } | undefined
    )?.properties;
    assert.ok(properties && 'script' in properties && 'caption' in properties && 'hashtags' in properties);
    assert.equal(getCapabilityProbeCount(), probesBefore);
    assert.equal(draft.id, `draft-original-${topic.id}`);
    assert.equal(draft.license.type, 'original');
    assert.equal(draft.license.requiresAttribution, false);
    assert.equal(draft.syntheticMedia, true);
    assert.equal(draft.caption, 'A concise original caption');
    assert.equal(existsSync(draft.outputPath), false);
    assert.equal(existsSync(join(dataDir, 'cache', `${broll.id}.mp4`)), false);
  } finally {
    console.log = originalLog;
    resetLLM();
    restoreDataDir();
  }
});

test('draftOriginal rejects attribution-encumbered and cc-by-only b-roll', async () => {
  const attributionRequired = candidate('attribution-required', {
    requiresAttribution: true,
    attributionText: 'Source: Creator',
  });
  const ccByWithoutAttributionFlag = candidate('cc-by', {
    type: 'cc-by',
    requiresAttribution: false,
  });

  await assert.rejects(
    draftOriginal(topic, [attributionRequired]),
    /commercial-use stock, CC0, or public-domain b-roll/,
  );
  await assert.rejects(
    draftOriginal(topic, [ccByWithoutAttributionFlag]),
    /commercial-use stock, CC0, or public-domain b-roll/,
  );
});

test('DRY_RUN draftClip skips capability detection when attribution is not required', async () => {
  assert.equal(config.dryRun, true, 'this side-effect proof must execute in DRY_RUN');
  const restoreDataDir = redirectDataDir(temporaryDir());
  installCopyLlm();
  const originalLog = console.log;
  console.log = () => {};
  resetCapabilitiesCache();
  const probesBefore = getCapabilityProbeCount();

  try {
    await draftClip(topic, candidate('no-attribution'));
    assert.equal(getCapabilityProbeCount(), probesBefore);
  } finally {
    console.log = originalLog;
    resetLLM();
    restoreDataDir();
  }
});

test('vertical platforms reject non-vertical drafts while x honors 16:9', async () => {
  assert.equal(config.dryRun, true, 'this aspect test must execute in DRY_RUN');
  const restoreDataDir = redirectDataDir(temporaryDir());
  installCopyLlm();
  const originalLog = console.log;
  console.log = () => {};

  try {
    await assert.rejects(
      draftClip(topic, candidate('vertical-rejection'), ['tiktok'], '16:9'),
      /require a 9:16 aspect ratio/,
    );
    const accepted = await draftClip(topic, candidate('x-landscape'), ['x'], '16:9');
    assert.equal(accepted.aspectRatio, '16:9');
    assert.deepEqual(accepted.targetPlatforms, ['x']);
  } finally {
    console.log = originalLog;
    resetLLM();
    restoreDataDir();
  }
});

test('caption textfile drawtext disables expansion without changing inline attribution', () => {
  const filter = captionTextfileFilter('/tmp/caption-100%.txt', 1080);
  assert.ok(filter.startsWith('drawtext=expansion=none:textfile='));
  assert.ok(filter.includes(':x=(w-tw)/2:y=h*0.72:fontsize=49:'));
});
