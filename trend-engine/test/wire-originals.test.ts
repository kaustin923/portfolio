import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, sep } from 'node:path';
import { after, test } from 'node:test';

import { checkCompliance } from '../src/agents/compliance.js';
import { draftOriginal } from '../src/agents/editor.js';
import {
  resetTelegramFetch,
  setTelegramFetch,
} from '../src/approval/telegram.js';
import { config } from '../src/config.js';
import { resetLLM, setLLM } from '../src/llm.js';
import { runOnce } from '../src/orchestrator.js';
import { makeMockLLM } from '../src/testing/mockLlm.js';
import type { SourceClipCandidate, Topic } from '../src/types.js';

const temporaryDirs: string[] = [];

function temporaryDir(): string {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? '/tmp', 'trend-engine-wire-originals-'));
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

/** These tests cover the classic sourcing/editor originals path, not the studio pipeline. */
function forceClassicPipeline(): () => void {
  const mutableStudio = config.studio as unknown as { mode: boolean };
  const original = mutableStudio.mode;
  mutableStudio.mode = false;
  return () => {
    mutableStudio.mode = original;
  };
}

const topic: Topic = {
  id: 'wire-original',
  title: 'Original pipeline wiring',
  summary: 'A deterministic topic for the orchestrated originals path.',
  whyTrending: 'The wiring needs an end-to-end proof.',
  momentum: 'rising',
  longevity: 'evergreen',
  stage: 'rising',
  leadTimeDays: 3,
  postWindow: 'this week',
  catalyst: null,
  recommendation: 'prepare',
  domains: ['testing'],
  suggestedAngle: 'Explain how original drafts flow through the pipeline.',
  saturationRisk: 'low',
  opportunityScore: 80,
  contributingSources: ['mock'],
};

const broll: SourceClipCandidate = {
  id: 'wire-original-broll',
  provider: 'test-stock',
  title: 'Eligible original b-roll',
  url: 'https://example.invalid/wire-original.mp4',
  durationSec: 12,
  pageUrl: 'https://example.invalid/assets/wire-original',
  license: {
    type: 'stock',
    requiresAttribution: false,
    commercialUse: true,
    sourceUrl: 'https://example.invalid/licenses/wire-original',
  },
};

after(() => {
  resetLLM();
  resetTelegramFetch();
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

test('makeMockLLM distinguishes original-copy and caption-only schemas', async () => {
  const llm = makeMockLLM();
  const original = await llm.structured<{
    script: string;
    caption: string;
    hashtags: string[];
  }>({
    system: 'test',
    user: 'test',
    schema: {
      type: 'object',
      properties: {
        script: { type: 'string' },
        caption: { type: 'string' },
        hashtags: { type: 'array', items: { type: 'string' } },
      },
    },
  });
  assert.deepEqual(original, {
    script: 'Mock narration sentence one. Mock narration sentence two.',
    caption: 'Mock original caption',
    hashtags: ['test', 'original'],
  });

  const captionOnly = await llm.structured<{ caption: string; hashtags: string[] }>({
    system: 'test',
    user: 'test',
    schema: {
      type: 'object',
      properties: {
        caption: { type: 'string' },
        hashtags: { type: 'array', items: { type: 'string' } },
      },
    },
  });
  assert.deepEqual(captionOnly, {
    caption: 'Mock caption for tests',
    hashtags: ['test', 'mock'],
  });
});

test('draftOriginal keeps original provenance and skips human review', async () => {
  const restoreDataDir = redirectDataDir(temporaryDir());
  setLLM(makeMockLLM());

  try {
    const draft = await draftOriginal(topic, [broll]);
    assert.equal(draft.license.type, 'original');
    assert.equal(draft.license.requiresAttribution, false);
    assert.equal(draft.syntheticMedia, true);
    const compliance = checkCompliance(draft);
    assert.equal(compliance.approved, true);
    assert.equal(compliance.requiresHumanReview, false);
  } finally {
    resetLLM();
    restoreDataDir();
  }
});

test('runOnce publishes and monitors configured original drafts without Telegram I/O', async () => {
  const dataDir = temporaryDir();
  const restoreDataDir = redirectDataDir(dataDir);
  const restoreStudioMode = forceClassicPipeline();
  let telegramRequests = 0;
  setTelegramFetch(async () => {
    telegramRequests++;
    throw new Error('Telegram must not be called in DRY_RUN');
  });
  setLLM(makeMockLLM());

  try {
    const report = await runOnce();
    const originalMetrics = report.metrics.filter((metric) =>
      /dryrun-.+-draft-original-/.test(metric.postId),
    );

    assert.ok(report.originals >= 1);
    assert.equal(
      originalMetrics.length,
      report.originals * config.publishing.defaultPlatforms.length,
    );
    assert.equal(report.rejected, 0);
    assert.equal(telegramRequests, 0);
    assert.equal(existsSync(join(dataDir, 'approvals.jsonl')), false);
  } finally {
    resetLLM();
    resetTelegramFetch();
    restoreStudioMode();
    restoreDataDir();
  }
});

test('ORIGINALS_PER_RUN zero disables original production', async () => {
  const restoreDataDir = redirectDataDir(temporaryDir());
  const restoreStudioMode = forceClassicPipeline();
  const mutableConfig = config as unknown as { originalsPerRun: number };
  const originalOriginalsPerRun = mutableConfig.originalsPerRun;
  mutableConfig.originalsPerRun = 0;
  setLLM(makeMockLLM());

  try {
    const report = await runOnce();
    assert.equal(report.originals, 0);
    assert.equal(
      report.metrics.filter((metric) => /dryrun-.+-draft-original-/.test(metric.postId)).length,
      0,
    );
  } finally {
    resetLLM();
    mutableConfig.originalsPerRun = originalOriginalsPerRun;
    restoreStudioMode();
    restoreDataDir();
  }
});
