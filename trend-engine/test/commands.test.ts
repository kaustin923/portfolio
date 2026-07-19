import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

import {
  awaitNextRun,
  consumeRunNow,
  isPaused,
  pauseGate,
  pollCommandsOnce,
} from '../src/approval/commands.js';
import {
  isApprovalPollActive,
  loadTelegramOffset,
  persistTelegramOffset,
  pollForDecision,
  resetPendingDecisions,
  resetTelegramFetch,
  setTelegramFetch,
  type TelegramFetchFn,
} from '../src/approval/telegram.js';
import { config } from '../src/config.js';
import { utcDateKey } from '../src/state.js';

type MutableConfig = {
  dryRun: boolean;
  dataDir: string;
  approval: {
    telegramBotToken: string;
    telegramChatId: string;
    timeoutMinutes: number;
  };
};

interface TelegramCall {
  method: string;
  body: Record<string, unknown>;
}

let dir = '';
let restoreConfig = (): void => {};

function configure(testDir: string): () => void {
  const mutable = config as unknown as MutableConfig;
  const original = {
    dryRun: mutable.dryRun,
    dataDir: mutable.dataDir,
    approval: { ...mutable.approval },
  };
  mutable.dryRun = false;
  mutable.dataDir = testDir;
  mutable.approval.telegramBotToken = 'test-token';
  mutable.approval.telegramChatId = 'approver-chat';
  mutable.approval.timeoutMinutes = 0.01;

  return () => {
    mutable.dryRun = original.dryRun;
    mutable.dataDir = original.dataDir;
    Object.assign(mutable.approval, original.approval);
  };
}

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

function mockUpdates(updates: unknown[]): TelegramCall[] {
  const calls: TelegramCall[] = [];
  setTelegramFetch((async (input, init) => {
    const method = telegramMethod(input);
    calls.push({ method, body: jsonBody(init) });
    if (method === 'getUpdates') return jsonResponse({ ok: true, result: updates });
    return jsonResponse({ ok: true, result: true });
  }) as TelegramFetchFn);
  return calls;
}

function messageUpdate(
  updateId: number,
  text: string,
  chatId = 'approver-chat',
): unknown {
  return {
    update_id: updateId,
    message: {
      text,
      chat: { id: chatId },
      from: { id: 42, username: 'operator' },
    },
  };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'trend-commands-'));
  restoreConfig = configure(dir);
});

afterEach(() => {
  resetTelegramFetch();
  resetPendingDecisions();
  restoreConfig();
  rmSync(dir, { recursive: true, force: true });
});

test('wrong-chat commands are ignored while their update offset is persisted', async () => {
  const calls = mockUpdates([messageUpdate(8, '/pause', 'intruder-chat')]);

  await pollCommandsOnce({ dir, timeoutSec: 0 });

  assert.equal(existsSync(join(dir, 'paused.json')), false);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'telegram-offset.json'), 'utf8')), {
    offset: 9,
  });
  assert.deepEqual(calls.map((call) => call.method), ['getUpdates']);
});

test('/pause and /resume update the operator pause state', async () => {
  let calls = mockUpdates([messageUpdate(1, '/pause@trend_bot')]);
  await pollCommandsOnce({ dir, timeoutSec: 0 });
  assert.equal(isPaused(dir), true);
  assert.deepEqual(calls.map((call) => call.method), ['getUpdates', 'sendMessage']);
  assert.equal(calls[1]?.body.text, 'paused — daemon will skip runs until /resume');

  calls = mockUpdates([messageUpdate(2, '/resume')]);
  await pollCommandsOnce({ dir, timeoutSec: 0 });
  assert.equal(isPaused(dir), false);
  assert.equal(calls[1]?.body.text, 'resumed');
});

test('/run writes a request consumed exactly once', async () => {
  const calls = mockUpdates([messageUpdate(3, '/run')]);

  await pollCommandsOnce({ dir, timeoutSec: 0 });

  assert.equal(calls[1]?.body.text, 'immediate run queued');
  assert.equal(existsSync(join(dir, 'run-now.json')), true);
  assert.equal(consumeRunNow(dir), true);
  assert.equal(consumeRunNow(dir), false);
});

test('/status composes state, receipts, source health, and next-run data', async () => {
  const today = utcDateKey();
  writeFileSync(join(dir, 'state.json'), JSON.stringify({
    version: 1,
    publishedTopics: {},
    lastRunAt: '2026-07-19T12:00:00.000Z',
    runCount: 7,
    dailyPublishCounts: {
      [today]: { tiktok: 2, 'youtube-shorts': 1 },
    },
  }));
  writeFileSync(
    join(dir, 'provenance.jsonl'),
    [
      { status: 'published' },
      { status: 'published' },
      { status: 'skipped' },
      { status: 'error' },
    ].map((record) => JSON.stringify(record)).join('\n'),
  );
  writeFileSync(
    join(dir, 'source-health.jsonl'),
    [
      { at: 'old', sources: [{ source: 'old', status: 'timeout', count: 0, ms: 9 }] },
      {
        at: 'new',
        sources: [
          { source: 'reddit', status: 'ok', count: 4, ms: 12 },
          { source: 'youtube', status: 'error', count: 0, ms: 20 },
        ],
      },
    ].map((record) => JSON.stringify(record)).join('\n'),
  );
  writeFileSync(join(dir, 'next-run.json'), JSON.stringify({ eta: '2026-07-19T20:00:00.000Z' }));
  const calls = mockUpdates([messageUpdate(4, '/status')]);

  await pollCommandsOnce({ dir, timeoutSec: 0 });

  const text = String(calls.find((call) => call.method === 'sendMessage')?.body.text);
  assert.match(text, /lastRunAt: 2026-07-19T12:00:00\.000Z/);
  assert.match(text, /runCount: 7/);
  assert.match(text, /published: 2/);
  assert.match(text, /blocked: 2/);
  assert.match(text, /today: tiktok: 2, youtube-shorts: 1/);
  assert.match(text, /next run: 2026-07-19T20:00:00\.000Z/);
  assert.match(text, /source health: 2 sources: 1 ok, 1 error/);
  assert.match(text, /paused: no/);
});

test('/status and /health tolerate missing data files', async () => {
  const calls = mockUpdates([
    messageUpdate(5, '/status'),
    messageUpdate(6, '/health'),
  ]);

  await pollCommandsOnce({ dir, timeoutSec: 0 });

  const replies = calls
    .filter((call) => call.method === 'sendMessage')
    .map((call) => String(call.body.text));
  assert.equal(replies.length, 2);
  assert.match(replies[0]!, /published: 0/);
  assert.match(replies[0]!, /next run: unknown/);
  assert.equal(replies[1], 'source health: unavailable');
});

test('approval callbacks are answered and handed to the later approval poll', async () => {
  const calls = mockUpdates([{
    update_id: 7,
    callback_query: {
      id: 'callback-7',
      data: 'approve:draft-from-command-poll',
      from: { username: 'reviewer' },
      message: { chat: { id: 'approver-chat' } },
    },
  }]);

  await pollCommandsOnce({ dir, timeoutSec: 0 });

  assert.deepEqual(calls.map((call) => call.method), ['getUpdates', 'answerCallbackQuery']);
  assert.equal(calls[1]?.body.text, 'Recorded');
  assert.deepEqual(await pollForDecision('draft-from-command-poll'), {
    status: 'approved',
    decidedBy: 'reviewer',
  });
  assert.equal(isApprovalPollActive(), false);
  assert.equal(calls.length, 2, 'pending decision must resolve without another network call');
});

test('command polling makes zero fetches during an approval poll and in DRY_RUN', async () => {
  let fetchCalls = 0;
  setTelegramFetch((async (input) => {
    fetchCalls++;
    const method = telegramMethod(input);
    if (method === 'getUpdates') {
      return jsonResponse({
        ok: true,
        result: [{
          update_id: 9,
          callback_query: {
            id: 'approval-9',
            data: 'approve:active-draft',
            from: { username: 'reviewer' },
            message: { chat: { id: 'approver-chat' } },
          },
        }],
      });
    }
    return jsonResponse({ ok: true, result: true });
  }) as TelegramFetchFn);

  const activeDecision = pollForDecision('active-draft');
  assert.equal(isApprovalPollActive(), true);
  const beforeCommandPoll = fetchCalls;
  await pollCommandsOnce({ dir, timeoutSec: 0 });
  assert.equal(fetchCalls, beforeCommandPoll);
  assert.equal((await activeDecision).status, 'approved');

  (config as unknown as MutableConfig).dryRun = true;
  const beforeDryRunPoll = fetchCalls;
  await pollCommandsOnce({ dir, timeoutSec: 0 });
  assert.equal(fetchCalls, beforeDryRunPoll);
});

test('the exported Telegram offset store round-trips through a test directory', async () => {
  assert.equal(await loadTelegramOffset(dir), 0);
  await persistTelegramOffset(123, dir);
  assert.equal(await loadTelegramOffset(dir), 123);
});

test('awaitNextRun consumes /run immediately and clears its ETA file', async () => {
  const calls = mockUpdates([messageUpdate(10, '/run')]);

  await awaitNextRun(60_000, { dir });

  assert.equal(calls.some((call) => call.method === 'sendMessage'), true);
  assert.equal(existsSync(join(dir, 'run-now.json')), false);
  assert.equal(existsSync(join(dir, 'next-run.json')), false);
});

test('pauseGate polls until /resume clears the pause state', async () => {
  writeFileSync(join(dir, 'paused.json'), JSON.stringify({ paused: true }));
  mockUpdates([messageUpdate(11, '/resume')]);

  await pauseGate({ dir });

  assert.equal(isPaused(dir), false);
});
