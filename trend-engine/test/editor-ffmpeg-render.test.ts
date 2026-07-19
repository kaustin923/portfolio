import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { after, before, test, type TestContext } from 'node:test';

import { draftClip } from '../src/agents/editor.js';
import { config } from '../src/config.js';
import { resetLLM, setLLM } from '../src/llm.js';
import { buildAss, escapeDrawtext, wrapText } from '../src/media/captions.js';
import {
  detectCapabilities,
  dimensionsFor,
  probe,
  renderToVertical,
  runFfmpeg,
} from '../src/media/ffmpeg.js';
import { makeMockLLM } from '../src/testing/mockLlm.js';
import type { SourceClipCandidate, Topic } from '../src/types.js';

let fixtureDir: string;
let landscapeInput: string;
let portraitInput: string;
let ffmpegAvailable = true;

function requireFfmpeg(t: TestContext): boolean {
  if (ffmpegAvailable) return true;
  t.skip('ffmpeg is unavailable in this environment');
  return false;
}

async function makeFixture(filter: string, outputPath: string): Promise<void> {
  await runFfmpeg([
    '-y',
    '-f',
    'lavfi',
    '-i',
    filter,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    outputPath,
  ]);
}

before(async () => {
  fixtureDir = await mkdtemp(join(tmpdir(), 'trend-engine-editor-'));
  landscapeInput = join(fixtureDir, 'landscape.mp4');
  portraitInput = join(fixtureDir, 'portrait.mp4');
  try {
    await makeFixture('testsrc2=size=640x360:duration=2:rate=30', landscapeInput);
    await makeFixture('testsrc2=size=360x640:duration=2:rate=30', portraitInput);
  } catch (error) {
    if (error instanceof Error && /ffmpeg not found/.test(error.message)) {
      ffmpegAvailable = false;
      return;
    }
    throw error;
  }
});

after(async () => {
  await rm(fixtureDir, { recursive: true, force: true });
});

test('renderToVertical reframes landscape input and adds an AAC track', async (t) => {
  if (!requireFfmpeg(t)) return;
  const outputPath = join(fixtureDir, 'landscape-vertical.mp4');
  await renderToVertical({ inputPath: landscapeInput, outputPath, maxSec: 30 });

  const rendered = await probe(outputPath);
  assert.equal(rendered.width, 1080);
  assert.equal(rendered.height, 1920);
  assert.equal(rendered.videoCodec, 'h264');
  assert.equal(rendered.hasAudio, true);
  assert.ok(Math.abs(rendered.durationSec - 2) <= 0.25, `duration was ${rendered.durationSec}s`);
});

test('renderToVertical reframes portrait input to the 9:16 master', async (t) => {
  if (!requireFfmpeg(t)) return;
  const outputPath = join(fixtureDir, 'portrait-vertical.mp4');
  await renderToVertical({ inputPath: portraitInput, outputPath, maxSec: 30 });

  const rendered = await probe(outputPath);
  assert.equal(rendered.width, 1080);
  assert.equal(rendered.height, 1920);
});

test('renderToVertical honors the requested maximum duration', async (t) => {
  if (!requireFfmpeg(t)) return;
  const outputPath = join(fixtureDir, 'clamped.mp4');
  await renderToVertical({ inputPath: landscapeInput, outputPath, maxSec: 1 });

  const rendered = await probe(outputPath);
  assert.ok(rendered.durationSec <= 1.2, `duration was ${rendered.durationSec}s`);
});

test('renderToVertical honors all supported output aspect ratios', async (t) => {
  if (!requireFfmpeg(t)) return;
  const aspects = [
    ['9:16', 1080, 1920],
    ['1:1', 1080, 1080],
    ['16:9', 1920, 1080],
  ] as const;

  for (const [aspectRatio, width, height] of aspects) {
    assert.deepEqual(dimensionsFor(aspectRatio), { width, height });
    const outputPath = join(fixtureDir, `aspect-${aspectRatio.replace(':', '-')}.mp4`);
    await renderToVertical({
      inputPath: landscapeInput,
      outputPath,
      maxSec: 1,
      aspectRatio,
    });
    const rendered = await probe(outputPath);
    assert.equal(rendered.width, width);
    assert.equal(rendered.height, height);
  }
});

test('detectCapabilities reports booleans for the installed ffmpeg', async (t) => {
  if (!requireFfmpeg(t)) return;
  const capabilities = await detectCapabilities();
  assert.equal(typeof capabilities.drawtext, 'boolean');
  assert.equal(typeof capabilities.subtitles, 'boolean');
});

test('caption helpers escape filters and build safe-area ASS content', () => {
  // Escaped for three unescape passes: drawtext expansion, the option
  // tokenizer, and the filtergraph tokenizer (value is embedded unquoted).
  assert.equal(
    escapeDrawtext("A'B:C\\D,100%\nnext"),
    String.raw`A\\\'B\\:C\\\\\\\\D\,100\\\\% next`,
  );

  const ass = buildAss('Hello {world}\nSecond line', 'Source: Example', 2);
  assert.match(ass, /PlayResX: 1080/);
  assert.match(ass, /MarginV, Encoding/);
  assert.match(ass, /Caption,[^\n]*,440,1/);
  assert.ok(ass.includes('Hello world\\NSecond line'));

  assert.deepEqual(wrapText('one two extraordinarilylongword', 8), [
    'one two',
    'extraord',
    'inarilyl',
    'ongword',
  ]);
});

test('escapeDrawtext output survives real ffmpeg filtergraph parsing intact', async (t) => {
  if (!requireFfmpeg(t)) return;
  const raw = "O'Brien's clip: 100%, [beta]; a\\b";
  const { stderr } = await runFfmpeg([
    '-hide_banner',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=64x64:duration=0.1:rate=10',
    '-vf',
    `metadata=mode=add:key=attribution:value=${escapeDrawtext(raw)},metadata=mode=print`,
    '-frames:v',
    '1',
    '-f',
    'null',
    '-',
  ]);

  // The metadata filter runs the filtergraph and option tokenizers but not
  // drawtext's expansion pass, so the parsed value still carries the innermost
  // expansion escaping (\ → \\, % → \%).
  const expected = raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%');
  assert.ok(
    stderr.includes(`attribution=${expected}`),
    `expected parsed value "attribution=${expected}" in:\n${stderr}`,
  );
});

test('config dataDir decodes URL spaces and always has a trailing separator', () => {
  assert.ok(!config.dataDir.includes('%'));
  assert.ok(config.dataDir.endsWith(sep));
});

test('DRY_RUN draftClip retains its full contract and clamps trim duration', async (t) => {
  if (!requireFfmpeg(t)) return;
  const topic: Topic = {
    id: 'editor-dry-topic',
    title: 'Offline editor test',
    summary: 'A deterministic editor test topic.',
    whyTrending: 'It verifies the renderer safely.',
    momentum: 'rising',
    longevity: 'evergreen',
    stage: 'rising',
    leadTimeDays: 3,
    postWindow: 'now',
    catalyst: null,
    recommendation: 'post-now',
    domains: ['testing'],
    suggestedAngle: 'Explain why offline rendering matters.',
    saturationRisk: 'low',
    opportunityScore: 80,
    contributingSources: ['mock'],
  };
  const candidate: SourceClipCandidate = {
    id: `never-fetch-${process.pid}-${Date.now()}`,
    provider: 'test',
    title: 'Never fetched fixture',
    url: 'https://example.invalid/never-fetched.mp4',
    durationSec: 5,
    license: {
      type: 'cc-by',
      requiresAttribution: true,
      attributionText: 'Source: Example Creator (CC BY)',
      commercialUse: true,
      sourceUrl: 'https://example.invalid/license',
    },
  };

  setLLM(makeMockLLM());
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(' '));
  };
  try {
    const draft = await draftClip(topic, candidate);
    assert.equal(draft.id, `draft-${candidate.id}`);
    assert.equal(draft.topicId, topic.id);
    assert.equal(draft.sourceCandidateId, candidate.id);
    assert.deepEqual(draft.license, candidate.license);
    assert.ok(draft.hashtags.length > 0);
    assert.deepEqual(draft.targetPlatforms, config.publishing.defaultPlatforms);
    assert.equal(draft.aspectRatio, '9:16');
    assert.ok(draft.caption.endsWith(candidate.license.attributionText ?? ''));
    assert.ok(draft.outputPath.startsWith(join(config.dataDir, 'clips')));
    assert.equal(existsSync(draft.outputPath), false);

    for (const [suffix, durationSec, expected] of [
      ['long', 300, config.editor.maxClipSec],
      ['normal', 12, 12],
      ['negative', -5, 1],
    ] as const) {
      const variant = { ...candidate, id: `${candidate.id}-${suffix}`, durationSec };
      await draftClip(topic, variant);
      assert.ok(
        logs.some(
          (line) => line.includes(`clips/${variant.id}.mp4`) && line.includes(`maxSec=${expected}`),
        ),
        `expected ${variant.id} to render with maxSec=${expected}`,
      );
    }
  } finally {
    console.log = originalLog;
    resetLLM();
  }
});

test('renderToVertical accepts punctuation-heavy attribution drawtext', async (t) => {
  if (!requireFfmpeg(t)) return;
  const capabilities = await detectCapabilities();
  if (!capabilities.drawtext) {
    t.skip('installed ffmpeg has no drawtext filter');
    return;
  }

  const outputPath = join(fixtureDir, 'attribution-drawtext.mp4');
  await renderToVertical({
    inputPath: landscapeInput,
    outputPath,
    maxSec: 1,
    attributionText: "O'Brien's clip: 100%, [beta]; a\\b",
  });
  const rendered = await probe(outputPath);
  assert.equal(rendered.width, 1080);
  assert.equal(rendered.height, 1920);
});

test('renderToVertical burns a caption when ffmpeg exposes subtitles or drawtext', async (t) => {
  if (!requireFfmpeg(t)) return;
  const capabilities = await detectCapabilities();
  if (!capabilities.subtitles && !capabilities.drawtext) {
    t.skip('installed ffmpeg has no subtitles or drawtext filter');
    return;
  }

  const outputPath = join(fixtureDir, 'captioned.mp4');
  await renderToVertical({
    inputPath: landscapeInput,
    outputPath,
    maxSec: 1,
    caption: 'A caption that wraps safely across the rendered frame',
  });
  const rendered = await probe(outputPath);
  assert.equal(rendered.width, 1080);
  assert.equal(rendered.height, 1920);
});
