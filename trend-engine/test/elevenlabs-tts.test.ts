import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';

import { config } from '../src/config.js';
import {
  resetTtsFetch,
  setTtsFetch,
  synthesizeVoiceover,
  type TtsFetch,
} from '../src/media/tts.js';

interface MutableTtsConfig {
  dryRun: boolean;
  tts: {
    elevenLabs: {
      apiKey: string;
      voiceId: string;
      modelId: string;
    };
  };
}

const mutableConfig = config as unknown as MutableTtsConfig;
const originalConfig = {
  dryRun: mutableConfig.dryRun,
  elevenLabs: { ...mutableConfig.tts.elevenLabs },
};
const temporaryDirs: string[] = [];

/** These tests exercise the real ffmpeg / macOS `say` toolchain; skip where absent. */
function hasBinary(bin: string, args: string[]): boolean {
  return !spawnSync(bin, args, { stdio: 'ignore' }).error;
}
const hasFfmpeg = hasBinary(config.ffmpegPath, ['-version']);
const hasSay = hasBinary(config.tts.sayPath, ['-v', '?']);

function temporaryBasePath(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'trend-engine-elevenlabs-'));
  temporaryDirs.push(dir);
  return join(dir, name);
}

function silentMp3(): Buffer {
  const result = spawnSync(
    config.ffmpegPath,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'anullsrc=r=44100:cl=mono',
      '-t',
      '0.2',
      '-f',
      'mp3',
      'pipe:1',
    ],
    { encoding: null },
  );
  assert.equal(result.status, 0, result.stderr.toString());
  return result.stdout;
}

function configureElevenLabs(dryRun = false): void {
  mutableConfig.dryRun = dryRun;
  Object.assign(mutableConfig.tts.elevenLabs, {
    apiKey: 'elevenlabs-test-secret',
    voiceId: 'voice/test id',
    modelId: 'test-model',
  });
}

afterEach(() => {
  resetTtsFetch();
  mutableConfig.dryRun = originalConfig.dryRun;
  Object.assign(mutableConfig.tts.elevenLabs, originalConfig.elevenLabs);
  for (const dir of temporaryDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('configured ElevenLabs sends the expected request and records its generator', async (t) => {
  if (!hasFfmpeg) {
    t.skip('ffmpeg is unavailable in this environment');
    return;
  }
  configureElevenLabs();
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
  const audio = silentMp3();
  setTtsFetch((async (input, init) => {
    calls.push({ input, init });
    return new Response(audio, {
      status: 200,
      headers: { 'Content-Type': 'audio/mpeg' },
    });
  }) as TtsFetch);

  const result = await synthesizeVoiceover(
    'Narrate this exact text.',
    temporaryBasePath('elevenlabs'),
  );

  assert.ok(result);
  assert.equal(result.generator, 'elevenlabs');
  assert.deepEqual(result.audioProvenance, {
    kind: 'tts',
    generator: 'elevenlabs',
  });
  assert.equal(existsSync(result.audioPath), true);
  assert.ok(result.durationSec > 0);
  assert.equal(calls.length, 1);

  const call = calls[0];
  assert.ok(call);
  assert.equal(
    String(call.input),
    'https://api.elevenlabs.io/v1/text-to-speech/voice%2Ftest%20id',
  );
  assert.equal(call.init?.method, 'POST');
  const headers = new Headers(call.init?.headers);
  assert.equal(headers.get('xi-api-key'), 'elevenlabs-test-secret');
  assert.equal(headers.get('accept'), 'audio/mpeg');
  assert.equal(headers.get('content-type'), 'application/json');
  assert.deepEqual(JSON.parse(String(call.init?.body)), {
    text: 'Narrate this exact text.',
    model_id: 'test-model',
  });
  assert.ok(call.init?.signal);
});

test('an ElevenLabs failure logs status without secrets and uses macOS say', async (t) => {
  if (!hasFfmpeg || !hasSay) {
    t.skip('ffmpeg or macOS say is unavailable in this environment');
    return;
  }
  configureElevenLabs();
  const secret = mutableConfig.tts.elevenLabs.apiKey;
  setTtsFetch((async () =>
    new Response(`provider body accidentally contains ${secret}`, {
      status: 503,
    })) as TtsFetch);
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(' '));

  try {
    const result = await synthesizeVoiceover(
      'Use the local fallback.',
      temporaryBasePath('fallback'),
    );

    assert.ok(result);
    assert.equal(result.generator, 'macos-say');
    assert.deepEqual(result.audioProvenance, {
      kind: 'tts',
      generator: 'macos-say',
    });
    assert.equal(existsSync(result.audioPath), true);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0] ?? '', /status=503/);
    assert.ok(warnings.every((warning) => !warning.includes(secret)));
    assert.ok(warnings.every((warning) => !warning.includes('provider body')));
  } finally {
    console.warn = originalWarn;
  }
});

test('DRY_RUN rejects before an injected ElevenLabs fetch can run', async () => {
  configureElevenLabs(true);
  let fetchCalls = 0;
  setTtsFetch((async () => {
    fetchCalls += 1;
    throw new Error('DRY_RUN attempted an ElevenLabs request');
  }) as TtsFetch);

  await assert.rejects(
    synthesizeVoiceover('Do not synthesize this.', temporaryBasePath('dry-run')),
    /must not be called in DRY_RUN/,
  );
  assert.equal(fetchCalls, 0);
});
