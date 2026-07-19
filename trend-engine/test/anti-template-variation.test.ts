import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { after, test } from 'node:test';

import { draftOriginal } from '../src/agents/editor.js';
import { config } from '../src/config.js';
import { resetLLM, setLLM, type LLM, type StructuredRequest } from '../src/llm.js';
import { buildTimedAss } from '../src/media/captions.js';
import type { SourceClipCandidate, Topic } from '../src/types.js';
import {
  CAPTION_PRESETS,
  appendFingerprint,
  applyCaptionPreset,
  captionPresetFor,
  deriveStructure,
  fingerprintCount,
  isTooSimilar,
  loadRecentFingerprints,
  similarity,
  type FingerprintRecord,
} from '../src/variation.js';

const temporaryDirs: string[] = [];

function temporaryDir(): string {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? '/tmp', 'trend-engine-variation-'));
  temporaryDirs.push(dir);
  return `${dir}${sep}`;
}

function redirectDataDir(dir: string): () => void {
  const mutableConfig = config as unknown as { dataDir: string };
  const previous = mutableConfig.dataDir;
  mutableConfig.dataDir = dir;
  return () => {
    mutableConfig.dataDir = previous;
  };
}

function record(index: number): FingerprintRecord {
  return {
    v: 1,
    at: new Date(index * 1_000).toISOString(),
    draftId: `draft-${index}`,
    videoIndex: index,
    hookType: 'statement',
    openingHash: `hash-${index}`,
    openingNgrams: [`opening phrase ${index}`],
    captionPattern: `pattern-${index}`,
    brollCount: 1,
  };
}

const topic: Topic = {
  id: 'variation-topic',
  title: 'A deterministic variation topic',
  summary: 'Used to exercise one-shot copy regeneration.',
  whyTrending: 'The test needs stable editor inputs.',
  momentum: 'rising',
  longevity: 'evergreen',
  stage: 'rising',
  leadTimeDays: 3,
  postWindow: 'this week',
  catalyst: null,
  recommendation: 'prepare',
  domains: ['testing'],
  suggestedAngle: 'Explain variation without changing the facts.',
  saturationRisk: 'low',
  opportunityScore: 80,
  contributingSources: ['mock'],
};

const broll: SourceClipCandidate = {
  id: 'variation-broll',
  provider: 'test-stock',
  title: 'Variation b-roll',
  url: 'https://example.invalid/variation.mp4',
  durationSec: 12,
  pageUrl: 'https://example.invalid/assets/variation',
  license: {
    type: 'stock',
    requiresAttribution: false,
    commercialUse: true,
    sourceUrl: 'https://example.invalid/licenses/variation',
  },
};

after(() => {
  resetLLM();
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

test('deriveStructure is deterministic and classifies pure-code hook types', () => {
  const input = {
    script: 'Why does this work? A second sentence should not change the hook.',
    caption: 'Answer in 3 steps!\nSave this.',
    brollCount: 2,
    videoIndex: 7,
  };
  const first = deriveStructure(input);
  const second = deriveStructure(input);

  assert.deepEqual(first, second);
  assert.equal(first.hookType, 'question');
  assert.equal(first.openingHash.length, 64);
  assert.deepEqual(first.openingNgrams.slice(0, 2), [
    'why does this',
    'does this work',
  ]);
  assert.equal(first.captionPattern, 'w w # w!\nw w.|lines:2');
  assert.equal(first.brollCount, 2);
  assert.equal(first.videoIndex, 7);

  const hookType = (script: string) =>
    deriveStructure({ script, caption: 'Caption', brollCount: 1, videoIndex: 0 }).hookType;
  assert.equal(hookType('The answer is here? Yes.'), 'question');
  assert.equal(hookType('42 discoveries changed the field.'), 'stat');
  assert.equal(hookType('Growth reached 73% last year.'), 'stat');
  assert.equal(hookType('Watch the edge of the sky.'), 'imperative');
  assert.equal(hookType('Never assume the obvious answer.'), 'negation');
  assert.equal(hookType('Stop believing this common myth.'), 'negation');
  assert.equal(hookType('The result follows from the evidence.'), 'statement');
});

test('similarity uses opening Jaccard, caption bonus, and inclusive thresholds', () => {
  const identicalA = { openingNgrams: ['a b c', 'b c d'], captionPattern: 'one' };
  const identicalB = { openingNgrams: ['a b c', 'b c d'], captionPattern: 'two' };
  const disjoint = { openingNgrams: ['x y z'], captionPattern: 'three' };
  assert.equal(similarity(identicalA, identicalB), 1);
  assert.equal(similarity(identicalA, disjoint), 0);

  const matchingPattern = { openingNgrams: ['x y z'], captionPattern: 'one' };
  assert.equal(similarity(identicalA, matchingPattern), 0.2);

  const boundaryA = { openingNgrams: ['a', 'b', 'c'], captionPattern: 'left' };
  const boundaryB = { openingNgrams: ['a'], captionPattern: 'right' };
  const boundary = 1 / 3;
  assert.equal(isTooSimilar(boundaryA, [boundaryB], boundary), true);
  assert.equal(isTooSimilar(boundaryA, [boundaryB], boundary + 0.001), false);
});

test('fingerprint loading windows valid JSONL and tolerates corrupt lines', async () => {
  const dataDir = temporaryDir();
  const restoreDataDir = redirectDataDir(dataDir);
  const lines = [
    ...Array.from({ length: 12 }, (_, index) => JSON.stringify(record(index))),
    '{not valid json',
    JSON.stringify({ v: 1, draftId: 'incomplete' }),
    ...Array.from({ length: 13 }, (_, offset) => JSON.stringify(record(offset + 12))),
  ];
  writeFileSync(join(dataDir, 'fingerprints.jsonl'), `${lines.join('\n')}\n`);

  try {
    const recent = await loadRecentFingerprints();
    assert.equal(recent.length, 20);
    assert.deepEqual(
      recent.map((item) => item.videoIndex),
      Array.from({ length: 20 }, (_, index) => index + 5),
    );
    assert.equal(await fingerprintCount(), 25);
  } finally {
    restoreDataDir();
  }
});

test('caption presets cycle and only rewrite the Caption ASS style', () => {
  assert.ok(CAPTION_PRESETS.length >= 3);
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5].map((index) => captionPresetFor(index).name),
    [
      'bottom-classic',
      'center-bold',
      'upper-third',
      'bottom-classic',
      'center-bold',
      'upper-third',
    ],
  );

  const original = buildTimedAss(
    [
      { startSec: 0, endSec: 1, text: 'First caption' },
      { startSec: 1, endSec: 2, text: 'Second caption' },
    ],
    'Source: Example',
    2,
  );
  const preset = captionPresetFor(1);
  const transformed = applyCaptionPreset(original, preset);
  const originalCaptionStyle = original.match(/^Style: Caption,.*$/m)?.[0];
  const transformedCaptionStyle = transformed.match(/^Style: Caption,.*$/m)?.[0];
  assert.ok(originalCaptionStyle);
  assert.ok(transformedCaptionStyle);
  assert.equal(transformed.replace(transformedCaptionStyle, originalCaptionStyle), original);

  const fields = transformedCaptionStyle.slice('Style: '.length).split(',');
  assert.equal(fields[2], String(preset.fontSize));
  assert.equal(fields[18], String(preset.alignment));
  assert.equal(fields[21], String(preset.marginV));
  assert.equal(
    transformed.match(/^Style: Attribution,.*$/m)?.[0],
    original.match(/^Style: Attribution,.*$/m)?.[0],
  );
  assert.deepEqual(
    transformed.match(/^Dialogue: .*$/gm),
    original.match(/^Dialogue: .*$/gm),
  );
});

async function runEditorVariationCase(secondScript: string, secondCaption: string) {
  assert.equal(config.dryRun, true, 'editor variation tests must stay offline in DRY_RUN');
  const dataDir = temporaryDir();
  const restoreDataDir = redirectDataDir(dataDir);
  const previousThreshold = process.env.VARIATION_SIMILARITY_THRESHOLD;
  process.env.VARIATION_SIMILARITY_THRESHOLD = '0.6';

  const firstCopy = {
    script: 'Why do meteor showers glow above quiet cities tonight? The answer is orbital debris.',
    caption: 'A concise meteor answer',
    hashtags: ['science', 'space'],
  };
  const seed = deriveStructure({
    script: firstCopy.script,
    caption: firstCopy.caption,
    brollCount: 1,
    videoIndex: 0,
  });
  await appendFingerprint({
    v: 1,
    at: new Date(0).toISOString(),
    draftId: 'seed-draft',
    videoIndex: seed.videoIndex,
    hookType: seed.hookType,
    openingHash: seed.openingHash,
    openingNgrams: seed.openingNgrams,
    captionPattern: seed.captionPattern,
    brollCount: seed.brollCount,
  });

  const requests: StructuredRequest[] = [];
  const responses = [
    firstCopy,
    { script: secondScript, caption: secondCaption, hashtags: ['fresh', 'format'] },
  ];
  const llm: LLM = {
    async structured<T>(request: StructuredRequest): Promise<T> {
      requests.push(request);
      const response = responses[requests.length - 1];
      assert.ok(response, 'editor made more than one regeneration call');
      return response as T;
    },
    async research(): Promise<string> {
      return '';
    },
  };
  setLLM(llm);
  const originalLog = console.log;
  console.log = () => {};

  try {
    const draft = await draftOriginal(topic, [broll]);
    return { draft, requests };
  } finally {
    console.log = originalLog;
    resetLLM();
    restoreDataDir();
    if (previousThreshold === undefined) {
      delete process.env.VARIATION_SIMILARITY_THRESHOLD;
    } else {
      process.env.VARIATION_SIMILARITY_THRESHOLD = previousThreshold;
    }
  }
}

test('editor regenerates exactly once and flags copy that remains too similar', async () => {
  const sameScript =
    'Why do meteor showers glow above quiet cities tonight? The answer is orbital debris.';
  const { draft, requests } = await runEditorVariationCase(
    sameScript,
    'A concise meteor answer',
  );

  assert.equal(requests.length, 2);
  assert.match(requests[1]?.user ?? '', /VARY INSTRUCTION:/);
  assert.match(requests[1]?.user ?? '', /Recent hook types:/);
  assert.match(requests[1]?.user ?? '', /Recent openings to avoid:/);
  assert.ok(draft.complianceFlags?.includes('template-similarity'));
  assert.ok(draft.structure);
  assert.equal(draft.structure.videoIndex, 1);
});

test('editor keeps a genuinely different regeneration without a similarity flag', async () => {
  const { draft, requests } = await runEditorVariationCase(
    'Imagine ancient oceans moving beneath a frozen moon tonight. New evidence maps their tides.',
    'Frozen moon oceans!\nA new map',
  );

  assert.equal(requests.length, 2);
  assert.match(requests[1]?.user ?? '', /VARY INSTRUCTION:/);
  assert.equal(draft.complianceFlags?.includes('template-similarity') ?? false, false);
  assert.ok(draft.structure);
  assert.equal(draft.structure.hookType, 'imperative');
});

test('appendFingerprint writes one valid JSONL record', async () => {
  const dataDir = temporaryDir();
  const restoreDataDir = redirectDataDir(dataDir);
  const expected = record(9);

  try {
    await appendFingerprint(expected);
    const lines = readFileSync(join(dataDir, 'fingerprints.jsonl'), 'utf8')
      .trim()
      .split('\n');
    assert.equal(lines.length, 1);
    assert.deepEqual(JSON.parse(lines[0] ?? ''), expected);
  } finally {
    restoreDataDir();
  }
});
