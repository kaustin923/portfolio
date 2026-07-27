import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, sep } from 'node:path';
import { test } from 'node:test';

import { publish } from '../src/agents/publisher.js';
import { config } from '../src/config.js';
import { computeFileSha256 } from '../src/provenance.js';
import type {
  ApprovalDecision,
  ClipDraft,
  Platform,
  ProvenanceReceipt,
} from '../src/types.js';

interface MutableConfig {
  dataDir: string;
  dryRun: boolean;
}

function temporaryDir(): string {
  return mkdtempSync(join(process.env.TMPDIR ?? '/tmp', 'provenance-receipts-'));
}

async function withTempDataDir<T>(run: (dir: string) => Promise<T>): Promise<T> {
  const dir = temporaryDir();
  const mutableConfig = config as unknown as MutableConfig;
  const originalDataDir = mutableConfig.dataDir;
  const originalDryRun = mutableConfig.dryRun;
  mutableConfig.dataDir = `${dir}${sep}`;
  mutableConfig.dryRun = true;

  try {
    return await run(dir);
  } finally {
    mutableConfig.dataDir = originalDataDir;
    mutableConfig.dryRun = originalDryRun;
    rmSync(dir, { recursive: true, force: true });
  }
}

function makeDraft(
  outputPath: string,
  targetPlatforms: Platform[] = ['tiktok', 'youtube-shorts'],
): ClipDraft {
  return {
    id: 'draft-candidate-1',
    topicId: 'topic-1',
    sourceCandidateId: 'candidate-1',
    outputPath,
    aspectRatio: '9:16',
    caption: 'Original caption',
    hashtags: ['audit'],
    targetPlatforms,
    license: {
      type: 'cc-by',
      requiresAttribution: true,
      attributionText: 'Source: Example Creator (CC BY 4.0)',
      commercialUse: true,
      sourceUrl: 'https://example.test/license',
    },
    syntheticMedia: true,
  };
}

function readReceipts(dir: string): ProvenanceReceipt[] {
  return readFileSync(join(dir, 'provenance.jsonl'), 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ProvenanceReceipt);
}

async function withoutPublishLogs<T>(run: () => Promise<T>): Promise<T> {
  const originalLog = console.log;
  console.log = () => undefined;
  try {
    return await run();
  } finally {
    console.log = originalLog;
  }
}

async function captureWarnings<T>(
  run: () => Promise<T>,
): Promise<{ value: T; warnings: unknown[][] }> {
  const originalWarn = console.warn;
  const warnings: unknown[][] = [];
  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };
  try {
    return { value: await run(), warnings };
  } finally {
    console.warn = originalWarn;
  }
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test('computeFileSha256 streams a file and warns once for a missing path', async () => {
  const dir = temporaryDir();
  const fixturePath = join(dir, 'fixture.bin');
  const fixture = Buffer.from('small provenance fixture\0with bytes');
  writeFileSync(fixturePath, fixture);

  try {
    assert.equal(
      await computeFileSha256(fixturePath),
      createHash('sha256').update(fixture).digest('hex'),
    );

    const { value, warnings } = await captureWarnings(() =>
      computeFileSha256(join(dir, 'missing.mp4')),
    );
    assert.equal(value, null);
    assert.equal(warnings.length, 1);
    assert.match(String(warnings[0]?.[0]), /^\[provenance\] failed to hash /);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('DRY_RUN appends one complete receipt per platform attempt', async () => {
  await withTempDataDir(async (dir) => {
    const originalGitSha = process.env.GIT_SHA;
    delete process.env.GIT_SHA;
    const draft = makeDraft(join(dir, 'render-was-skipped.mp4'));
    const decision: ApprovalDecision = {
      status: 'approved',
      decidedBy: 'reviewer-1',
      editedCaption: 'Human-edited caption',
      note: 'approved for both platforms',
    };

    try {
      const { value: results, warnings } = await captureWarnings(() =>
        withoutPublishLogs(() => publish(draft, decision)),
      );
      assert.equal(results.length, 2);
      assert.equal(warnings.length, 2, 'each missing DRY_RUN render warns exactly once');

      const receipts = readReceipts(dir);
      assert.equal(receipts.length, 2);
      for (const [index, receipt] of receipts.entries()) {
        assert.equal(receipt.receiptVersion, 1);
        assert.equal(receipt.draftId, draft.id);
        assert.equal(receipt.topicId, draft.topicId);
        assert.equal(receipt.platform, results[index]?.platform);
        assert.equal(receipt.status, 'published');
        assert.ok(receipt.postId?.startsWith('dryrun-'));
        assert.equal(receipt.sha256, null);
        assert.deepEqual(receipt.license, draft.license);
        assert.notStrictEqual(receipt.license, draft.license);
        assert.equal(receipt.attributionText, draft.license.attributionText);
        assert.match(receipt.captionUsed, /Human-edited caption/);
        assert.match(receipt.captionUsed, /Source: Example Creator \(CC BY 4\.0\)/);
        assert.equal(receipt.syntheticMedia, true);
        assert.deepEqual(receipt.approval, {
          status: 'approved',
          decidedBy: 'reviewer-1',
          note: 'approved for both platforms',
          editedCaptionUsed: true,
        });
        assert.equal(receipt.pipelineVersion, 'unknown');
        assert.equal(receipt.publishedAt, receipt.recordedAt);
      }
    } finally {
      restoreEnv('GIT_SHA', originalGitSha);
    }
  });
});

test('GIT_SHA is recorded as the pipeline version', async () => {
  await withTempDataDir(async (dir) => {
    const originalGitSha = process.env.GIT_SHA;
    const outputPath = join(dir, 'clip.mp4');
    writeFileSync(outputPath, 'rendered clip');
    process.env.GIT_SHA = 'abc123';

    try {
      await withoutPublishLogs(() =>
        publish(makeDraft(outputPath, ['tiktok']), { status: 'approved' }),
      );
      assert.equal(readReceipts(dir)[0]?.pipelineVersion, 'abc123');
    } finally {
      delete process.env.GIT_SHA;
      restoreEnv('GIT_SHA', originalGitSha);
    }
  });
});

test('non-approved decisions return skipped results without creating receipts', async () => {
  await withTempDataDir(async (dir) => {
    const results = await publish(makeDraft(join(dir, 'missing.mp4')), {
      status: 'rejected',
      decidedBy: 'reviewer-2',
      note: 'needs revision',
    });

    assert.equal(results.length, 2);
    assert.ok(results.every((result) => result.status === 'skipped'));
    assert.equal(existsSync(join(dir, 'provenance.jsonl')), false);
  });
});

test('receipt write failures warn by default and propagate in strict mode', async () => {
  await withTempDataDir(async (dir) => {
    const mutableConfig = config as unknown as MutableConfig;
    const regularFile = join(dir, 'regular-file');
    writeFileSync(regularFile, 'hashable output that blocks mkdir');
    mutableConfig.dataDir = `${regularFile}${sep}sub${sep}`;
    const draft = makeDraft(regularFile, ['tiktok']);
    const originalStrict = process.env.PROVENANCE_STRICT;
    const originalWarn = console.warn;
    const warnings: unknown[][] = [];
    console.warn = (...args: unknown[]) => {
      warnings.push(args);
    };

    try {
      delete process.env.PROVENANCE_STRICT;
      const results = await withoutPublishLogs(() => publish(draft, { status: 'approved' }));
      assert.equal(results[0]?.status, 'published');
      assert.equal(warnings.length, 1);
      assert.equal(warnings[0]?.[0], '[provenance] failed to append receipt:');

      warnings.length = 0;
      process.env.PROVENANCE_STRICT = 'true';
      await assert.rejects(
        withoutPublishLogs(() => publish(draft, { status: 'approved' })),
        /ENOTDIR|not a directory/i,
      );
      assert.equal(warnings.length, 0, 'strict mode rethrows instead of warning');
    } finally {
      console.warn = originalWarn;
      restoreEnv('PROVENANCE_STRICT', originalStrict);
    }
  });
});

test('receipts append across publish calls instead of truncating history', async () => {
  await withTempDataDir(async (dir) => {
    const outputPath = join(dir, 'clip.mp4');
    const draft = makeDraft(outputPath);
    writeFileSync(outputPath, 'rendered clip');

    await withoutPublishLogs(() => publish(draft, { status: 'approved' }));
    await withoutPublishLogs(() => publish(draft, { status: 'approved' }));

    const receipts = readReceipts(dir);
    assert.equal(receipts.length, 4);
    assert.deepEqual(
      receipts.map((receipt) => receipt.platform),
      ['tiktok', 'youtube-shorts', 'tiktok', 'youtube-shorts'],
    );
  });
});
