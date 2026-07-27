import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, sep } from 'node:path';
import { afterEach, test } from 'node:test';

import {
  appendApprovalRecord,
  escapeMarkdownV2,
  pollForDecision,
  renderCard,
  requestApproval,
  resetTelegramFetch,
  setTelegramFetch,
  type ApprovalRecord,
  type TelegramFetchFn,
} from '../src/approval/telegram.js';
import { config } from '../src/config.js';
import type { ClipDraft, ComplianceResult, Topic } from '../src/types.js';

type MutableConfig = {
  dryRun: boolean;
  dataDir: string;
  approval: {
    telegramBotToken: string;
    telegramChatId: string;
    timeoutMinutes: number;
  };
};

function temporaryDir(): string {
  return `${mkdtempSync(join(process.env.TMPDIR ?? '/tmp', 'telegram-hardening-'))}${sep}`;
}

function configureTelegram(dataDir: string, dryRun = false): () => void {
  const mutable = config as unknown as MutableConfig;
  const original = {
    dryRun: mutable.dryRun,
    dataDir: mutable.dataDir,
    approval: { ...mutable.approval },
  };
  mutable.dryRun = dryRun;
  mutable.dataDir = dataDir;
  mutable.approval.telegramBotToken = 'test-token';
  mutable.approval.telegramChatId = 'test-chat';
  mutable.approval.timeoutMinutes = 0.01;

  return () => {
    mutable.dryRun = original.dryRun;
    mutable.dataDir = original.dataDir;
    Object.assign(mutable.approval, original.approval);
  };
}

function topic(overrides: Partial<Topic> = {}): Topic {
  return {
    id: 'topic-1',
    title: 'A safe title',
    summary: 'Summary',
    whyTrending: 'Because',
    momentum: 'rising',
    longevity: 'sustained',
    stage: 'rising',
    leadTimeDays: 3,
    postWindow: 'post now',
    catalyst: 'Launch day',
    recommendation: 'post-now',
    domains: ['technology'],
    suggestedAngle: 'Explain it clearly',
    saturationRisk: 'low',
    opportunityScore: 88,
    contributingSources: ['mock'],
    ...overrides,
  };
}

function draft(outputPath: string, overrides: Partial<ClipDraft> = {}): ClipDraft {
  return {
    id: 'draft-1',
    topicId: 'topic-1',
    sourceCandidateId: 'source-1',
    outputPath,
    aspectRatio: '9:16',
    caption: 'Caption for review',
    hashtags: ['trend', 'launch-day'],
    targetPlatforms: ['tiktok', 'youtube-shorts'],
    license: {
      type: 'cc-by',
      requiresAttribution: true,
      attributionText: 'Creator.Name',
      commercialUse: true,
      sourceUrl: 'https://example.com/source-file',
    },
    ...overrides,
  };
}

const compliance: ComplianceResult = {
  approved: true,
  reasons: ['license verified'],
  requiresHumanReview: true,
};

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function telegramMethod(input: string | URL | Request): string {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return url.slice(url.lastIndexOf('/') + 1);
}

function jsonBody(init?: RequestInit): Record<string, unknown> {
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

afterEach(() => {
  resetTelegramFetch();
});

test('MarkdownV2 escaping covers every reserved character in fields', () => {
  const reserved = '_*[]()~`>#+-=|{}.!';
  const escaped = [...reserved].map((character) => `\\${character}`).join('');
  assert.equal(escapeMarkdownV2(`${reserved} Az09`), `${escaped} Az09`);

  const card = renderCard(
    topic({ title: 'Q3 (beta) — 100%_done!' }),
    draft('/missing.mp4'),
    compliance,
  );
  const topicLine = card.split('\n').find((line) => line.startsWith('*Topic:*'));
  assert.equal(topicLine, '*Topic:* Q3 \\(beta\\) — 100%\\_done\\!');
  assert.doesNotMatch(topicLine, /(?<!\\)[_!()]/);
});

test('polling persists and reloads the Telegram update offset', async () => {
  const dir = temporaryDir();
  const restore = configureTelegram(dir);
  const seenOffsets: number[] = [];
  let updateId = 41;

  setTelegramFetch((async (input, init) => {
    const method = telegramMethod(input);
    if (method === 'getUpdates') {
      const body = jsonBody(init);
      seenOffsets.push(body.offset as number);
      const current = updateId++;
      return jsonResponse({
        ok: true,
        result: [
          {
            update_id: current,
            callback_query: {
              id: `callback-${current}`,
              data: 'approve:draft-offset',
              from: { username: 'reviewer' },
              message: { chat: { id: 'test-chat' } },
            },
          },
        ],
      });
    }
    return jsonResponse({ ok: true, result: true });
  }) as TelegramFetchFn);

  try {
    assert.equal((await pollForDecision('draft-offset', 100)).status, 'approved');
    assert.equal((await pollForDecision('draft-offset', 101)).status, 'approved');
    assert.deepEqual(seenOffsets, [0, 42]);
    assert.deepEqual(
      JSON.parse(readFileSync(`${dir}telegram-offset.json`, 'utf8')),
      { offset: 43 },
    );
  } finally {
    resetTelegramFetch();
    restore();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('appendApprovalRecord writes a parseable JSONL record with all fields', async () => {
  const dir = temporaryDir();
  const restore = configureTelegram(dir);
  const record: ApprovalRecord = {
    timestamp: '2026-07-19T12:00:00.000Z',
    topicId: 'topic-log',
    draftId: 'draft-log',
    decision: 'approved',
    decidedBy: 'reviewer',
    reason: 'looks good',
    editedCaption: 'Updated caption',
  };

  try {
    await appendApprovalRecord(record);
    const lines = readFileSync(`${dir}approvals.jsonl`, 'utf8').trim().split('\n');
    assert.equal(lines.length, 1);
    assert.deepEqual(JSON.parse(lines[0]!), record);
  } finally {
    restore();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('requestApproval falls back to sendMessage for a missing clip and uploads a small clip', async () => {
  const missingDir = temporaryDir();
  const restoreMissing = configureTelegram(missingDir);
  const missingMethods: string[] = [];

  setTelegramFetch((async (input, init) => {
    const method = telegramMethod(input);
    missingMethods.push(method);
    if (method === 'sendMessage') return jsonResponse({ ok: true, result: { message_id: 200 } });
    if (method === 'getUpdates') {
      return jsonResponse({
        ok: true,
        result: [
          {
            update_id: 1,
            callback_query: {
              id: 'missing-approve',
              data: 'approve:draft-1',
              from: { username: 'reviewer' },
              message: { chat: { id: 'test-chat' } },
            },
          },
        ],
      });
    }
    assert.equal(jsonBody(init).callback_query_id, 'missing-approve');
    return jsonResponse({ ok: true, result: true });
  }) as TelegramFetchFn);

  try {
    const decision = await requestApproval(topic(), draft(join(missingDir, 'absent.mp4')), compliance);
    assert.equal(decision.status, 'approved');
    assert.ok(missingMethods.includes('sendMessage'));
    assert.ok(!missingMethods.includes('sendVideo'));
  } finally {
    resetTelegramFetch();
    restoreMissing();
    rmSync(missingDir, { recursive: true, force: true });
  }

  const videoDir = temporaryDir();
  const restoreVideo = configureTelegram(videoDir);
  const videoPath = join(videoDir, 'clip.mp4');
  writeFileSync(videoPath, Buffer.from('small fake mp4'));
  const videoCalls: { method: string; init?: RequestInit }[] = [];

  setTelegramFetch((async (input, init) => {
    const method = telegramMethod(input);
    videoCalls.push({ method, init });
    if (method === 'sendVideo') return jsonResponse({ ok: true, result: { message_id: 300 } });
    if (method === 'getUpdates') {
      return jsonResponse({
        ok: true,
        result: [
          {
            update_id: 2,
            callback_query: {
              id: 'video-approve',
              data: 'approve:draft-1',
              from: { username: 'reviewer' },
              message: { chat: { id: 'test-chat' } },
            },
          },
        ],
      });
    }
    return jsonResponse({ ok: true, result: true });
  }) as TelegramFetchFn);

  try {
    const decision = await requestApproval(topic(), draft(videoPath), compliance);
    assert.equal(decision.status, 'approved');
    const upload = videoCalls.find((call) => call.method === 'sendVideo');
    assert.ok(upload);
    assert.ok(upload.init?.body instanceof FormData);
    const form = upload.init.body;
    assert.equal(form.get('chat_id'), 'test-chat');
    assert.equal(form.get('parse_mode'), 'MarkdownV2');
    assert.ok(form.get('video') instanceof Blob);
    assert.equal(videoCalls.some((call) => call.method === 'sendMessage'), false);
  } finally {
    resetTelegramFetch();
    restoreVideo();
    rmSync(videoDir, { recursive: true, force: true });
  }
});

test('reject callback collects a reply reason and logs the rejected decision', async () => {
  const dir = temporaryDir();
  const restore = configureTelegram(dir);
  let getUpdatesCalls = 0;

  setTelegramFetch((async (input, init) => {
    const method = telegramMethod(input);
    if (method === 'sendMessage') {
      const body = jsonBody(init);
      const isPrompt = body.text === 'Reply to this message with a rejection reason (or ignore).';
      return jsonResponse({ ok: true, result: { message_id: isPrompt ? 501 : 500 } });
    }
    if (method === 'getUpdates') {
      getUpdatesCalls++;
      if (getUpdatesCalls === 1) {
        return jsonResponse({
          ok: true,
          result: [
            {
              update_id: 70,
              callback_query: {
                id: 'reject-callback',
                data: 'reject:draft-1',
                from: { username: 'critical-reviewer' },
                message: { chat: { id: 'test-chat' } },
              },
            },
          ],
        });
      }
      assert.equal(jsonBody(init).offset, 71);
      return jsonResponse({
        ok: true,
        result: [
          {
            update_id: 71,
            message: {
              text: 'The source framing is misleading.',
              from: { username: 'critical-reviewer' },
              chat: { id: 'test-chat' },
              reply_to_message: { message_id: 501 },
            },
          },
        ],
      });
    }
    return jsonResponse({ ok: true, result: true });
  }) as TelegramFetchFn);

  try {
    const decision = await requestApproval(topic(), draft(join(dir, 'missing.mp4')), compliance);
    assert.deepEqual(decision, {
      status: 'rejected',
      decidedBy: 'critical-reviewer',
      note: 'The source framing is misleading.',
    });
    const log = JSON.parse(readFileSync(`${dir}approvals.jsonl`, 'utf8').trim()) as ApprovalRecord;
    assert.equal(log.decision, 'rejected');
    assert.equal(log.reason, 'The source framing is misleading.');
    assert.equal(log.topicId, 'topic-1');
    assert.equal(log.draftId, 'draft-1');
  } finally {
    resetTelegramFetch();
    restore();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('DRY_RUN performs no Telegram requests and writes no approval state', async () => {
  const dir = temporaryDir();
  const restore = configureTelegram(dir, true);
  const originalLog = console.log;
  let fetchCalls = 0;
  console.log = () => {};
  setTelegramFetch((async () => {
    fetchCalls++;
    return jsonResponse({ ok: true, result: true });
  }) as TelegramFetchFn);

  try {
    const decision = await requestApproval(topic(), draft(join(dir, 'missing.mp4')), compliance);
    assert.equal(decision.status, 'approved');
    assert.equal(fetchCalls, 0);
    assert.equal(existsSync(`${dir}approvals.jsonl`), false);
    assert.deepEqual(readdirSync(dir), []);
  } finally {
    console.log = originalLog;
    resetTelegramFetch();
    restore();
    rmSync(dir, { recursive: true, force: true });
  }
});
