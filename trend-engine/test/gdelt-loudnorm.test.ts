import assert from 'node:assert/strict';
import { test } from 'node:test';

import { config } from '../src/config.js';
import {
  buildLoudnormFilter,
  detectCapabilities,
  getLoudnormAnalysisCount,
  parseLoudnormStats,
} from '../src/media/ffmpeg.js';
import {
  collectGdelt,
  GDELT_TIMEOUT_MS,
} from '../src/sources/gdelt.js';
import {
  fetchT,
  resetSourcesFetch,
  setSourcesFetch,
  type SourcesFetch,
} from '../src/sources/index.js';

interface MutableConfig {
  dryRun: boolean;
}

const mutableConfig = config as unknown as MutableConfig;

async function withDryRun<T>(dryRun: boolean, run: () => Promise<T>): Promise<T> {
  const savedDryRun = mutableConfig.dryRun;
  mutableConfig.dryRun = dryRun;
  try {
    return await run();
  } finally {
    mutableConfig.dryRun = savedDryRun;
  }
}

function risingResponse(): Response {
  return Response.json({
    timeline: [{ data: [1, 1, 2, 4].map((value) => ({ value })) }],
  });
}

test('GDELT caps candidate requests at five and uses a three-day timespan', async () => {
  await withDryRun(false, async () => {
    const urls: URL[] = [];
    const recordingFetch: SourcesFetch = async (input) => {
      urls.push(new URL(String(input)));
      return risingResponse();
    };

    await collectGdelt([
      'First Topic',
      'Second Topic',
      'Third Topic',
      'Fourth Topic',
      'Fifth Topic',
      'Sixth Topic',
      'Seventh Topic',
      'Eighth Topic',
    ], recordingFetch);

    assert.ok(urls.length <= 5);
    assert.equal(urls.length, 5);
    assert.ok(urls.every((url) => url.searchParams.get('timespan') === '3d'));
  });
});

test('GDELT upgrades explicit fetchT through its 15-second timeout seam', async () => {
  assert.equal(GDELT_TIMEOUT_MS, 15_000);
  await withDryRun(false, async () => {
    let seamCalls = 0;
    let customCalls = 0;
    setSourcesFetch(async (_input, init) => {
      seamCalls += 1;
      assert.ok(init?.signal);
      return risingResponse();
    });

    const customFetch: SourcesFetch = async () => {
      customCalls += 1;
      return risingResponse();
    };

    try {
      await collectGdelt(['Shared Fetch'], fetchT);
      await collectGdelt(['Custom Fetch'], customFetch);
      assert.equal(seamCalls, 1);
      assert.equal(customCalls, 1);
    } finally {
      resetSourcesFetch();
    }
  });
});

test('GDELT throws only when every term rejects and keeps fulfilled subsets', async () => {
  await withDryRun(false, async () => {
    const allReject: SourcesFetch = async () => {
      throw new Error('GDELT unavailable');
    };
    await assert.rejects(
      collectGdelt(['First Failure', 'Second Failure'], allReject),
      /GDELT unavailable/,
    );

    const mixedFetch: SourcesFetch = async (input) => {
      const query = new URL(String(input)).searchParams.get('query');
      if (query === '"Broken Topic"') throw new Error('one term failed');
      return risingResponse();
    };
    const signals = await collectGdelt(['Healthy Topic', 'Broken Topic'], mixedFetch);
    assert.equal(signals.length, 1);
    assert.equal(signals[0]?.title, 'Healthy Topic');
  });
});

test('GDELT DRY_RUN returns its fixture before invoking an injected fetcher', async () => {
  await withDryRun(true, async () => {
    let fetchCalls = 0;
    const fetcher: SourcesFetch = async () => {
      fetchCalls += 1;
      throw new Error('DRY_RUN attempted a network request');
    };
    const signals = await collectGdelt(['Ignored Topic'], fetcher);
    assert.ok(signals.length > 0);
    assert.ok(signals.every((signal) => signal.source === 'gdelt'));
    assert.equal(fetchCalls, 0);
  });
});

test('parseLoudnormStats extracts the final statistics block from noisy stderr', () => {
  const stderr = `
ffmpeg version 7.1
[Parsed_metadata_0] earlier payload: {"ignored":true}
[Parsed_loudnorm_0 @ 0x123] 
{
  "input_i" : "-23.45",
  "input_tp" : "-2.34",
  "input_lra" : "5.60",
  "input_thresh" : "-33.70",
  "output_i" : "-14.02",
  "target_offset" : "0.02"
}
`;

  assert.deepEqual(parseLoudnormStats(stderr), {
    input_i: -23.45,
    input_tp: -2.34,
    input_lra: 5.6,
    input_thresh: -33.7,
    target_offset: 0.02,
  });
});

test('parseLoudnormStats rejects non-finite and malformed output', () => {
  assert.equal(parseLoudnormStats(`{
    "input_i":"-inf",
    "input_tp":"-2",
    "input_lra":"0",
    "input_thresh":"-70",
    "target_offset":"0"
  }`), null);
  assert.equal(parseLoudnormStats('not loudnorm JSON'), null);
  assert.equal(parseLoudnormStats('{bad json}'), null);
});

test('buildLoudnormFilter creates the exact measured linear second pass', () => {
  assert.equal(
    buildLoudnormFilter({
      input_i: -23.45,
      input_tp: -2.34,
      input_lra: 5.6,
      input_thresh: -33.7,
      target_offset: 0.02,
    }),
    'loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=-23.45:measured_TP=-2.34:measured_LRA=5.6:measured_thresh=-33.7:offset=0.02:linear=true',
  );
});

test('pure loudnorm helpers never start an analysis pass', () => {
  assert.equal(getLoudnormAnalysisCount(), 0);
});

test('detectCapabilities reports loudnorm availability as a boolean', async (t) => {
  const capabilities = await detectCapabilities();
  if (!capabilities.drawtext && !capabilities.subtitles && !capabilities.loudnorm) {
    t.skip('ffmpeg is unavailable or exposes none of the detected filters');
    return;
  }
  assert.equal(typeof capabilities.loudnorm, 'boolean');
});
