import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { test } from 'node:test';

import { recordTopicOutcome, type TopicOutcome } from '../src/agents/monitor.js';
import { config } from '../src/config.js';
import {
  aggregateOutcomeFeatures,
  deriveContentFeatures,
  summarizeOutcomes,
} from '../src/learning.js';
import { writeManualPostKit } from '../src/outbox.js';
import type {
  ClipDraft,
  ContentFeatures,
  Platform,
  PostMetrics,
  Topic,
} from '../src/types.js';

interface MutableConfig {
  dataDir: string;
  dryRun: boolean;
  outbox: { open: boolean };
}

const topic: Topic = {
  id: 'feature-topic',
  title: 'Feature attribution topic',
  summary: 'A topic used by the attribution tests',
  whyTrending: 'Feature tests need a complete Topic',
  momentum: 'rising',
  longevity: 'sustained',
  stage: 'emerging',
  leadTimeDays: 3,
  postWindow: 'now',
  catalyst: null,
  recommendation: 'prepare',
  domains: ['science'],
  suggestedAngle: 'Explain why this is happening',
  saturationRisk: 'low',
  opportunityScore: 88,
  contributingSources: ['mock'],
};

function features(
  platform: Platform,
  overrides: Partial<ContentFeatures> = {},
): ContentFeatures {
  return {
    angleType: 'explainer',
    hookStyle: 'question',
    durationSec: null,
    tier: 'green',
    syntheticMedia: false,
    voice: 'none',
    postHourLocal: 12,
    platform,
    ...overrides,
  };
}

let outcomeSequence = 0;
function outcome(overrides: Partial<TopicOutcome> = {}): TopicOutcome {
  outcomeSequence += 1;
  return {
    postId: `feature-post-${outcomeSequence}`,
    platform: 'tiktok',
    views: 1000,
    likes: 50,
    comments: 10,
    shares: 5,
    capturedAt: '2026-07-19T12:00:00.000Z',
    topicId: topic.id,
    topicTitle: topic.title,
    domains: [...topic.domains],
    stage: topic.stage,
    recommendation: topic.recommendation,
    opportunityScore: topic.opportunityScore,
    ...overrides,
  };
}

function draft(outputPath: string, overrides: Partial<ClipDraft> = {}): ClipDraft {
  return {
    id: 'feature-draft',
    topicId: topic.id,
    sourceCandidateId: 'feature-source',
    outputPath,
    aspectRatio: '9:16',
    caption: 'How this feature works',
    hashtags: ['features'],
    targetPlatforms: ['tiktok'],
    license: {
      type: 'original',
      requiresAttribution: false,
      commercialUse: true,
      sourceUrl: 'local://feature-test',
    },
    ...overrides,
  };
}

async function withTempConfig<T>(run: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'feature-attribution-'));
  const mutable = config as unknown as MutableConfig;
  const original = {
    dataDir: mutable.dataDir,
    dryRun: mutable.dryRun,
    outboxOpen: mutable.outbox.open,
  };
  mutable.dataDir = `${dir}${sep}`;
  mutable.dryRun = false;
  mutable.outbox.open = false;

  try {
    return await run(dir);
  } finally {
    mutable.dataDir = original.dataDir;
    mutable.dryRun = original.dryRun;
    mutable.outbox.open = original.outboxOpen;
    await rm(dir, { recursive: true, force: true });
  }
}

function setEnv(name: string, value: string | undefined): () => void {
  const original = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  return () => {
    if (original === undefined) delete process.env[name];
    else process.env[name] = original;
  };
}

test('legacy outcomes retain the byte-identical summary contract', () => {
  const summary = summarizeOutcomes([
    outcome({ views: 9000 }),
    outcome({
      domains: ['lifestyle'],
      stage: 'rising',
      recommendation: 'post-now',
      views: 400,
    }),
  ]);

  assert.equal(
    summary,
    "Historical performance (2 recorded posts, 4.7k avg views/post): by domain — 'science' 9k > 'lifestyle' 400; by stage — 'emerging' 9k > 'rising' 400; by recommendation — 'prepare' 9k > 'post-now' 400. Favor 'science' topics at the 'emerging' stage; 'lifestyle' has underperformed.",
  );
});

test('eligible feature buckets rank while low-sample buckets report insufficient data', () => {
  const records = [
    ...[700, 600, 500].map((views) =>
      outcome({ views, contentFeatures: features('tiktok', { hookStyle: 'question' }) })),
    outcome({ views: 400, contentFeatures: features('tiktok', { hookStyle: 'rare-hook' }) }),
    ...[300, 200, 100].map((views) =>
      outcome({ views, contentFeatures: features('tiktok', { hookStyle: 'statement' }) })),
  ];

  const aggregates = aggregateOutcomeFeatures(records, new Date('2026-07-19T12:00:00.000Z'));
  const hookBuckets = aggregates.dimensions.hookStyle;
  const question = hookBuckets.find((bucket) => bucket.value === 'question');
  const statement = hookBuckets.find((bucket) => bucket.value === 'statement');
  const rare = hookBuckets.find((bucket) => bucket.value === 'rare-hook');

  assert.equal(question?.n, 3);
  assert.equal(statement?.n, 3);
  assert.ok((question?.score ?? 0) > (statement?.score ?? 100));
  assert.equal(rare?.n, 1);
  assert.deepEqual(aggregates.insufficient.hookStyle, [rare]);

  const summary = summarizeOutcomes(records);
  assert.match(summary, /best — hookStyle=question P\d+ \(n=3\)/);
  assert.match(summary, /worst — hookStyle=statement P\d+ \(n=3\)/);
  assert.match(summary, /Insufficient data: hookStyle\./);
  assert.ok(summary.indexOf('hookStyle=question') < summary.indexOf('hookStyle=statement'));
});

test('platform normalization lets a low-platform winner outrank a high-platform loser', () => {
  const records = [
    outcome({
      platform: 'tiktok',
      views: 100,
      contentFeatures: features('tiktok', { voice: 'low-baseline-1' }),
    }),
    outcome({
      platform: 'tiktok',
      views: 200,
      contentFeatures: features('tiktok', { voice: 'low-baseline-2' }),
    }),
    outcome({
      platform: 'tiktok',
      views: 1000,
      contentFeatures: features('tiktok', { voice: 'low-platform-winner' }),
    }),
    outcome({
      platform: 'youtube-shorts',
      views: 2000,
      contentFeatures: features('youtube-shorts', { voice: 'high-platform-loser' }),
    }),
    outcome({
      platform: 'youtube-shorts',
      views: 10_000,
      contentFeatures: features('youtube-shorts', { voice: 'high-baseline-1' }),
    }),
    outcome({
      platform: 'youtube-shorts',
      views: 20_000,
      contentFeatures: features('youtube-shorts', { voice: 'high-baseline-2' }),
    }),
  ];

  const aggregates = aggregateOutcomeFeatures(records, new Date('2026-07-19T12:00:00.000Z'));
  const lowWinner = aggregates.dimensions.voice.find(
    (bucket) => bucket.value === 'low-platform-winner',
  );
  const highLoser = aggregates.dimensions.voice.find(
    (bucket) => bucket.value === 'high-platform-loser',
  );

  assert.ok((lowWinner?.score ?? 0) > (highLoser?.score ?? 100));
  assert.equal(Math.round(lowWinner?.score ?? 0), 83);
  assert.equal(Math.round(highLoser?.score ?? 0), 17);
});

test('LEARNING_HALFLIFE_DAYS overrides recency weighting', () => {
  const records = [
    outcome({
      views: 400,
      capturedAt: '2026-06-20T12:00:00.000Z',
      contentFeatures: features('tiktok', { hookStyle: 'mixed-age' }),
    }),
    outcome({
      views: 300,
      capturedAt: '2026-07-20T12:00:00.000Z',
      contentFeatures: features('tiktok', { hookStyle: 'control-high' }),
    }),
    outcome({
      views: 200,
      capturedAt: '2026-07-20T12:00:00.000Z',
      contentFeatures: features('tiktok', { hookStyle: 'control-low' }),
    }),
    outcome({
      views: 100,
      capturedAt: '2026-07-20T12:00:00.000Z',
      contentFeatures: features('tiktok', { hookStyle: 'mixed-age' }),
    }),
  ];
  const now = new Date('2026-07-20T12:00:00.000Z');
  const restore = setEnv('LEARNING_HALFLIFE_DAYS', '1');

  try {
    const shortHalfLife = aggregateOutcomeFeatures(records, now);
    process.env.LEARNING_HALFLIFE_DAYS = '1000';
    const longHalfLife = aggregateOutcomeFeatures(records, now);
    const shortScore = shortHalfLife.dimensions.hookStyle.find(
      (bucket) => bucket.value === 'mixed-age',
    )?.score;
    const longScore = longHalfLife.dimensions.hookStyle.find(
      (bucket) => bucket.value === 'mixed-age',
    )?.score;

    assert.equal(shortHalfLife.halfLifeDays, 1);
    assert.equal(longHalfLife.halfLifeDays, 1000);
    assert.ok((shortScore ?? 100) < (longScore ?? 0));
  } finally {
    restore();
  }
});

test('recordTopicOutcome persists platform and honors a supplied post hour', async () => {
  await withTempConfig(async (dir) => {
    const metric: PostMetrics = {
      postId: 'attributed-post',
      platform: 'instagram-reels',
      views: 1234,
      likes: 100,
      comments: 20,
      shares: 10,
      capturedAt: '2026-07-19T12:00:00.000Z',
    };
    const inputFeatures: Omit<ContentFeatures, 'platform'> = {
      angleType: 'explainer',
      hookStyle: 'question',
      durationSec: null,
      tier: 'yellow',
      syntheticMedia: false,
      voice: 'none',
      postHourLocal: 23,
    };

    const [recorded] = await recordTopicOutcome(topic, [metric], inputFeatures);
    const persisted = JSON.parse(
      (await readFile(join(dir, 'outcomes.jsonl'), 'utf8')).trim(),
    ) as TopicOutcome;

    assert.deepEqual(persisted, recorded);
    assert.equal(persisted.contentFeatures?.platform, metric.platform);
    assert.equal(persisted.contentFeatures?.postHourLocal, 23);
    assert.equal(persisted.contentFeatures?.tier, 'yellow');

    const { postHourLocal: _omitted, ...withoutHour } = inputFeatures;
    const [fallback] = await recordTopicOutcome(
      topic,
      [{ ...metric, postId: 'attributed-post-2' }],
      withoutHour,
    );
    assert.equal(
      fallback?.contentFeatures?.postHourLocal,
      new Date(metric.capturedAt).getHours(),
    );
  });
});

test('manual kit adds derived contentFeatures without changing pinned metadata', async () => {
  await withTempConfig(async (dir) => {
    const outputPath = join(dir, 'feature.mp4');
    await writeFile(outputPath, 'video');
    const sourceDraft = draft(outputPath, {
      syntheticMedia: true,
      structure: {
        hookType: 'question',
        openingHash: 'opening',
        openingNgrams: ['how this'],
        captionPattern: 'question-explainer',
        brollCount: 2,
        videoIndex: 1,
      },
    });
    const restoreVoice = setEnv('TTS_VOICE', 'Feature Voice');
    const originalLog = console.log;
    console.log = () => undefined;

    try {
      const kitDir = await writeManualPostKit({
        draft: sourceDraft,
        decision: {
          status: 'approved',
          decidedBy: 'operator',
          note: 'feature-ready',
        },
        caption: sourceDraft.caption,
        reason: 'approved',
      });
      assert.ok(kitDir);

      const meta = JSON.parse(await readFile(join(kitDir, 'meta.json'), 'utf8')) as Record<
        string,
        unknown
      >;
      const { contentFeatures, ...legacyMeta } = meta;
      assert.deepEqual(legacyMeta, {
        kitVersion: 1,
        createdAt: meta.createdAt,
        topicId: sourceDraft.topicId,
        draftId: sourceDraft.id,
        reason: 'approved',
        tier: null,
        license: sourceDraft.license,
        approvalRecordRef: { file: 'approvals.jsonl', draftId: sourceDraft.id },
        approval: {
          status: 'approved',
          decidedBy: 'operator',
          note: 'feature-ready',
          editedCaptionUsed: false,
        },
        syntheticMedia: true,
        suggestedHashtags: sourceDraft.hashtags,
        targetPlatforms: sourceDraft.targetPlatforms,
      });
      assert.deepEqual(contentFeatures, {
        ...deriveContentFeatures({ draft: sourceDraft, tier: null }),
        postHourLocal: new Date(String(meta.createdAt)).getHours(),
      });
      assert.deepEqual(contentFeatures, {
        angleType: 'explainer',
        hookStyle: 'question',
        durationSec: null,
        tier: null,
        syntheticMedia: true,
        voice: 'Feature Voice',
        postHourLocal: new Date(String(meta.createdAt)).getHours(),
      });
    } finally {
      console.log = originalLog;
      restoreVoice();
    }
  });
});
