import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { after, before, test } from 'node:test';

import { draftClip } from '../src/agents/editor.js';
import { config } from '../src/config.js';
import { resetLLM, setLLM } from '../src/llm.js';
import { buildAss, escapeDrawtext } from '../src/media/captions.js';
import {
  detectCapabilities,
  probe,
  renderToVertical,
  runFfmpeg,
} from '../src/media/ffmpeg.js';
import { makeMockLLM } from '../src/testing/mockLlm.js';
import type { SourceClipCandidate, Topic } from '../src/types.js';

let fixtureDir: string;
let landscapeInput: string;
let portraitInput: string;

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
  await makeFixture('testsrc2=size=640x360:duration=2:rate=30', landscapeInput);
  await makeFixture('testsrc2=size=360x640:duration=2:rate=30', portraitInput);
});

after(async () => {
  await rm(fixtureDir, { recursive: true, force: true });
});

test('renderToVertical reframes landscape input and adds an AAC track', async () => {
  const outputPath = join(fixtureDir, 'landscape-vertical.mp4');
  await renderToVertical({ inputPath: landscapeInput, outputPath, maxSec: 30 });

  const rendered = await probe(outputPath);
  assert.equal(rendered.width, 1080);
  assert.equal(rendered.height, 1920);
  assert.equal(rendered.videoCodec, 'h264');
  assert.equal(rendered.hasAudio, true);
  assert.ok(Math.abs(rendered.durationSec - 2) <= 0.25, `duration was ${rendered.durationSec}s`);
});

test('renderToVertical reframes portrait input to the 9:16 master', async () => {
  const outputPath = join(fixtureDir, 'portrait-vertical.mp4');
  await renderToVertical({ inputPath: portraitInput, outputPath, maxSec: 30 });

  const rendered = await probe(outputPath);
  assert.equal(rendered.width, 1080);
  assert.equal(rendered.height, 1920);
});

test('renderToVertical honors the requested maximum duration', async () => {
  const outputPath = join(fixtureDir, 'clamped.mp4');
  await renderToVertical({ inputPath: landscapeInput, outputPath, maxSec: 1 });

  const rendered = await probe(outputPath);
  assert.ok(rendered.durationSec <= 1.2, `duration was ${rendered.durationSec}s`);
});

test('detectCapabilities reports booleans for the installed ffmpeg', async () => {
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
});

test('escapeDrawtext output survives real ffmpeg filtergraph parsing intact', async () => {
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

test('DRY_RUN draftClip retains attribution without creating an output file', async () => {
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
  try {
    const draft = await draftClip(topic, candidate);
    assert.ok(draft.caption.endsWith(candidate.license.attributionText ?? ''));
    assert.ok(draft.outputPath.startsWith(join(config.dataDir, 'clips')));
    assert.equal(existsSync(draft.outputPath), false);
  } finally {
    resetLLM();
  }
});
