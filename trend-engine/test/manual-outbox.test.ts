import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { test } from 'node:test';

import { publish } from '../src/agents/publisher.js';
import { config } from '../src/config.js';
import { resetOpener, setOpener, writeManualPostKit } from '../src/outbox.js';
import type { ApprovalDecision, ClipDraft, PublishResult } from '../src/types.js';

interface MutableConfig {
  dataDir: string;
  dryRun: boolean;
  outbox: { open: boolean };
  quotas: {
    maxPostsPerDayPerPlatform: number;
    youtubeDailyUnits: number;
    youtubeInsertUnits: number;
  };
}

const ENV_KEYS = [
  'IG_USER_ID',
  'IG_ACCESS_TOKEN',
  'TIKTOK_ACCESS_TOKEN',
  'YOUTUBE_CLIENT_ID',
  'YOUTUBE_CLIENT_SECRET',
  'YOUTUBE_REFRESH_TOKEN',
] as const;

async function withTempConfig<T>(
  dryRun: boolean,
  run: (dir: string) => Promise<T>,
): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'manual-outbox-'));
  const mutable = config as unknown as MutableConfig;
  const original = {
    dataDir: mutable.dataDir,
    dryRun: mutable.dryRun,
    outboxOpen: mutable.outbox.open,
    quotas: { ...mutable.quotas },
    env: new Map(ENV_KEYS.map((key) => [key, process.env[key]])),
  };
  mutable.dataDir = `${dir}${sep}`;
  mutable.dryRun = dryRun;
  mutable.outbox.open = false;
  Object.assign(mutable.quotas, {
    maxPostsPerDayPerPlatform: 8,
    youtubeDailyUnits: 10_000,
    youtubeInsertUnits: 1_600,
  });
  for (const key of ENV_KEYS) delete process.env[key];

  try {
    return await run(dir);
  } finally {
    resetOpener();
    mutable.dataDir = original.dataDir;
    mutable.dryRun = original.dryRun;
    mutable.outbox.open = original.outboxOpen;
    Object.assign(mutable.quotas, original.quotas);
    for (const key of ENV_KEYS) {
      const value = original.env.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(dir, { recursive: true, force: true });
  }
}

function makeDraft(
  outputPath: string,
  overrides: Partial<ClipDraft> = {},
): ClipDraft {
  return {
    id: 'manual-draft',
    topicId: 'manual-topic',
    sourceCandidateId: 'manual-source',
    outputPath,
    aspectRatio: '9:16',
    caption: 'Manual caption',
    hashtags: ['manual', '#ready'],
    targetPlatforms: ['youtube-shorts', 'instagram-reels', 'tiktok'],
    license: {
      type: 'cc-by',
      requiresAttribution: true,
      attributionText: 'Credit: Example Creator (CC BY 4.0)',
      commercialUse: true,
      sourceUrl: 'https://example.test/license',
    },
    ...overrides,
  };
}

function expectedKitDir(dir: string, topicId: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const safeTopicId = topicId.replace(/[^A-Za-z0-9._-]/g, '-');
  return join(dir, 'outbox', `${date}-${safeTopicId}`);
}

async function withoutConsole<T>(run: () => Promise<T>): Promise<T> {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  console.log = () => undefined;
  console.warn = () => undefined;
  console.error = () => undefined;
  try {
    return await run();
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }
}

function readJsonLines(path: string): Array<Record<string, unknown>> {
  return readFileSync(path, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

test('live approved publish without credentials writes one complete manual-post kit', async () => {
  await withTempConfig(false, async (dir) => {
    const outputPath = join(dir, 'rendered.mp4');
    writeFileSync(outputPath, 'dummy mp4 bytes');
    const draft = makeDraft(outputPath, {
      topicId: 'topic/with spaces',
      syntheticMedia: true,
    });
    const decision: ApprovalDecision = {
      status: 'approved',
      decidedBy: 'operator',
      note: 'ready for manual posting',
    };

    const results = await withoutConsole(() => publish(draft, decision));

    assert.equal(results.length, draft.targetPlatforms.length);
    for (const result of results) {
      assert.equal(result.status, 'error');
      assert.match(result.error ?? '', /Missing required env for .+ publishing/);
    }

    const kitDir = expectedKitDir(dir, draft.topicId);
    for (const file of [
      'rendered.mp4',
      'caption-youtube.txt',
      'caption-instagram.txt',
      'caption-tiktok.txt',
      'meta.json',
      'README.txt',
    ]) {
      assert.equal(existsSync(join(kitDir, file)), true, `${file} should exist`);
    }
    assert.equal(readFileSync(join(kitDir, 'rendered.mp4'), 'utf8'), 'dummy mp4 bytes');
    assert.equal(
      readFileSync(join(kitDir, 'README.txt'), 'utf8'),
      'post manually; AI-disclosure toggle required on YT/TikTok',
    );

    const meta = JSON.parse(readFileSync(join(kitDir, 'meta.json'), 'utf8')) as {
      reason: string;
      tier: string | null;
      license: ClipDraft['license'];
      approvalRecordRef: { draftId: string };
      suggestedHashtags: string[];
      approval: Record<string, unknown>;
    };
    assert.equal(meta.reason, 'missing-credentials');
    assert.equal(meta.tier, null);
    assert.deepEqual(meta.license, draft.license);
    assert.equal(meta.approvalRecordRef.draftId, draft.id);
    assert.deepEqual(meta.suggestedHashtags, draft.hashtags);
    assert.deepEqual(meta.approval, {
      status: 'approved',
      decidedBy: 'operator',
      note: 'ready for manual posting',
      editedCaptionUsed: false,
    });

    const records = readJsonLines(join(dir, 'provenance.jsonl'));
    const receipts = records.filter((record) => typeof record.platform === 'string');
    const outboxRecords = records.filter((record) => record.kind === 'outbox');
    assert.equal(receipts.length, draft.targetPlatforms.length);
    assert.deepEqual(
      receipts.map((record) => [record.platform, record.status]),
      results.map((result) => [result.platform, result.status]),
    );
    assert.equal(outboxRecords.length, 1);
    assert.equal(outboxRecords[0]?.outboxPath, kitDir);
    assert.equal(outboxRecords[0]?.reason, 'missing-credentials');
  });
});

test('platform captions enforce caps while retaining supplied attribution', async () => {
  await withTempConfig(false, async (dir) => {
    const attribution = 'Credit: Example Creator (CC BY 4.0)';
    // Attribution goes last, matching publisher resolveCaption(); truncation
    // must reserve room for it rather than cutting it off the tail.
    const caption = `${'x'.repeat(5_000)}\n\n${attribution}`;
    const draft = makeDraft(join(dir, 'missing.mp4'), {
      id: 'caption-draft',
      topicId: 'caption-topic',
    });

    const kitDir = await withoutConsole(() =>
      writeManualPostKit({
        draft,
        decision: { status: 'approved' },
        caption,
        reason: 'approved',
      }),
    );
    assert.ok(kitDir);

    const youtube = readFileSync(join(kitDir, 'caption-youtube.txt'), 'utf8');
    const instagram = readFileSync(join(kitDir, 'caption-instagram.txt'), 'utf8');
    const tiktok = readFileSync(join(kitDir, 'caption-tiktok.txt'), 'utf8');
    assert.equal(youtube.length, 4_900);
    assert.equal(instagram.length, 2_200);
    assert.equal(tiktok.length, 2_200);
    assert.ok(youtube.endsWith(`\n\n${attribution}`));
    assert.ok(instagram.endsWith(`\n\n${attribution}`));
    assert.ok(tiktok.endsWith(`\n\n${attribution}`));
  });
});

test('README requests AI disclosure if and only if the draft is synthetic', async () => {
  await withTempConfig(false, async (dir) => {
    for (const syntheticMedia of [false, true]) {
      const draft = makeDraft(join(dir, `missing-${syntheticMedia}.mp4`), {
        id: `readme-${syntheticMedia}`,
        topicId: `readme-${syntheticMedia}`,
        syntheticMedia,
        targetPlatforms: [],
      });
      const kitDir = await withoutConsole(() =>
        writeManualPostKit({
          draft,
          decision: { status: 'approved' },
          caption: draft.caption,
          reason: 'approved',
        }),
      );
      assert.ok(kitDir);
      assert.equal(
        readFileSync(join(kitDir, 'README.txt'), 'utf8'),
        syntheticMedia
          ? 'post manually; AI-disclosure toggle required on YT/TikTok'
          : 'post manually',
      );
    }
  });
});

test('dry-run, rejected, and timeout decisions never write an outbox kit', async () => {
  await withTempConfig(true, async (dir) => {
    const outputPath = join(dir, 'dry-run.mp4');
    writeFileSync(outputPath, 'video');
    await withoutConsole(() => publish(makeDraft(outputPath), { status: 'approved' }));
    assert.equal(existsSync(join(dir, 'outbox')), false);
  });

  for (const status of ['rejected', 'timeout'] as const) {
    await withTempConfig(false, async (dir) => {
      const outputPath = join(dir, `${status}.mp4`);
      writeFileSync(outputPath, 'video');
      const results = await publish(makeDraft(outputPath), { status });
      assert.ok(results.every((result) => result.status === 'skipped'));
      assert.equal(existsSync(join(dir, 'outbox')), false);
    });
  }
});

test('opener seam remains gated by configuration, dry-run, and macOS', async () => {
  await withTempConfig(false, async (dir) => {
    const mutable = config as unknown as MutableConfig;
    const opened: string[] = [];
    setOpener((kitDir) => opened.push(kitDir));
    const outputPath = join(dir, 'opener.mp4');
    writeFileSync(outputPath, 'video');

    const offDraft = makeDraft(outputPath, {
      id: 'opener-off',
      topicId: 'opener-off',
      targetPlatforms: [],
    });
    const offDir = await withoutConsole(() =>
      writeManualPostKit({
        draft: offDraft,
        decision: { status: 'approved' },
        caption: offDraft.caption,
        reason: 'approved',
      }),
    );
    assert.ok(offDir);
    assert.deepEqual(opened, []);

    mutable.outbox.open = true;
    const onDraft = makeDraft(outputPath, {
      id: 'opener-on',
      topicId: 'opener-on',
      targetPlatforms: [],
    });
    const onDir = await withoutConsole(() =>
      writeManualPostKit({
        draft: onDraft,
        decision: { status: 'approved' },
        caption: onDraft.caption,
        reason: 'approved',
      }),
    );
    assert.ok(onDir);
    assert.deepEqual(opened, process.platform === 'darwin' ? [onDir] : []);

    mutable.dryRun = true;
    const dryRunResult = await writeManualPostKit({
      draft: onDraft,
      decision: { status: 'approved' },
      caption: onDraft.caption,
      reason: 'approved',
    });
    assert.equal(dryRunResult, null);
    assert.deepEqual(opened, process.platform === 'darwin' ? [onDir] : []);
  });
});

test('approval tier uses the last matching valid record and defaults to null', async () => {
  await withTempConfig(false, async (dir) => {
    const draft = makeDraft(join(dir, 'missing.mp4'), {
      id: 'tier-draft',
      topicId: 'tier-found',
      targetPlatforms: [],
    });
    writeFileSync(
      join(dir, 'approvals.jsonl'),
      [
        JSON.stringify({ draftId: draft.id, tier: 'green' }),
        '{malformed',
        JSON.stringify({ draftId: 'other-draft', tier: 'red' }),
        JSON.stringify({ draftId: draft.id, tier: 'yellow' }),
      ].join('\n'),
    );
    const kitDir = await withoutConsole(() =>
      writeManualPostKit({
        draft,
        decision: { status: 'approved' },
        caption: draft.caption,
        reason: 'approved',
      }),
    );
    assert.ok(kitDir);
    const meta = JSON.parse(readFileSync(join(kitDir, 'meta.json'), 'utf8')) as {
      tier: string | null;
    };
    assert.equal(meta.tier, 'yellow');
  });

  await withTempConfig(false, async (dir) => {
    const draft = makeDraft(join(dir, 'missing.mp4'), {
      id: 'tier-absent',
      topicId: 'tier-absent',
      targetPlatforms: [],
    });
    const kitDir = await withoutConsole(() =>
      writeManualPostKit({
        draft,
        decision: { status: 'approved' },
        caption: draft.caption,
        reason: 'approved',
      }),
    );
    assert.ok(kitDir);
    const meta = JSON.parse(readFileSync(join(kitDir, 'meta.json'), 'utf8')) as {
      tier: string | null;
    };
    assert.equal(meta.tier, null);
  });
});

test('outbox write failure warns and leaves publish results byte-identical', async () => {
  await withTempConfig(false, async (dir) => {
    const outputPath = join(dir, 'failure.mp4');
    writeFileSync(outputPath, 'video');
    const draft = makeDraft(outputPath, { topicId: 'failure-topic' });
    const decision: ApprovalDecision = { status: 'approved' };

    const baseline = await withoutConsole(() => publish(draft, decision));
    rmSync(join(dir, 'outbox'), { recursive: true, force: true });
    writeFileSync(join(dir, 'outbox'), 'blocks directory creation');

    const warnings: string[] = [];
    const originalWarn = console.warn;
    const originalError = console.error;
    console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(' '));
    console.error = () => undefined;
    let withFailure: PublishResult[];
    try {
      withFailure = await publish(draft, decision);
    } finally {
      console.warn = originalWarn;
      console.error = originalError;
    }

    assert.equal(JSON.stringify(withFailure), JSON.stringify(baseline));
    assert.ok(warnings.some((warning) => warning.includes('failed to write manual-post kit')));
  });
});
