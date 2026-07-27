import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

import {
  parsePitchReplies,
  runPitchGate,
} from '../src/approval/pitchGate.js';
import {
  isApprovalPollActive,
  markExternalPollActive,
  pollForDecision,
  resetPendingDecisions,
  resetTelegramFetch,
  setTelegramFetch,
  type TelegramFetchFn,
} from '../src/approval/telegram.js';
import { config } from '../src/config.js';
import type { Pitch } from '../src/types.js';

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
let originalPitchTimeout: string | undefined;

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
  mutable.approval.timeoutMinutes = 0;

  return () => {
    mutable.dryRun = original.dryRun;
    mutable.dataDir = original.dataDir;
    Object.assign(mutable.approval, original.approval);
  };
}

function pitch(index: number, overrides: Partial<Pitch> = {}): Pitch {
  return {
    id: `pitch-${index}`,
    createdAt: '2026-07-19T12:00:00.000Z',
    topicId: `topic-${index}`,
    topicTitle: `Topic ${index}`,
    headline: `Pitch ${index}: money_[move]!`,
    stakes: `Why this matters (today) ${index}.`,
    angle: `Follow the cash > hype #${index}`,
    eventPeg: index === 1 ? 'Launch [day]' : null,
    vertical: index === 1 ? 'finance' : 'tech',
    format: index === 1 ? 'deep.dive' : 'timeline',
    status: 'pending',
    ...overrides,
  };
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
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

function messageUpdate(
  updateId: number,
  text: string,
  chatId = 'approver-chat',
  username = 'owner',
  messageId = 1000 + updateId,
): unknown {
  return {
    update_id: updateId,
    message: {
      message_id: messageId,
      text,
      chat: { id: chatId },
      from: { id: 42, username },
    },
  };
}

function readJsonl(path: string): Record<string, unknown>[] {
  return readFileSync(path, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'trend-pitch-gate-'));
  restoreConfig = configure(dir);
  originalPitchTimeout = process.env.PITCH_TIMEOUT_MIN;
  process.env.PITCH_TIMEOUT_MIN = '1';
});

afterEach(() => {
  resetTelegramFetch();
  resetPendingDecisions();
  markExternalPollActive(false);
  restoreConfig();
  if (originalPitchTimeout == null) delete process.env.PITCH_TIMEOUT_MIN;
  else process.env.PITCH_TIMEOUT_MIN = originalPitchTimeout;
  rmSync(dir, { recursive: true, force: true });
});

test('parsePitchReplies accepts natural numbered, global, and negative replies', () => {
  const cases: Array<{
    text: string;
    count: number;
    expected: ReturnType<typeof parsePitchReplies>;
  }> = [
    {
      text: '1 yes, 2 no, 3 yes but shorter',
      count: 3,
      expected: [
        { index: 0, decision: 'approved' },
        { index: 1, decision: 'rejected' },
        { index: 2, decision: 'approved', feedback: 'but shorter' },
      ],
    },
    {
      text: 'all yes',
      count: 3,
      expected: [
        { index: 0, decision: 'approved' },
        { index: 1, decision: 'approved' },
        { index: 2, decision: 'approved' },
      ],
    },
    {
      text: 'none',
      count: 2,
      expected: [
        { index: 0, decision: 'rejected' },
        { index: 1, decision: 'rejected' },
      ],
    },
    {
      text: 'nah on 2',
      count: 3,
      expected: [{ index: 1, decision: 'rejected' }],
    },
    {
      text: '1 yes but skip the intro',
      count: 3,
      expected: [{ index: 0, decision: 'approved', feedback: 'but skip the intro' }],
    },
    {
      text: '2 yes — drop the jargon',
      count: 3,
      expected: [{ index: 1, decision: 'approved', feedback: '— drop the jargon' }],
    },
    {
      text: '1 yes 2 no',
      count: 3,
      expected: [
        { index: 0, decision: 'approved' },
        { index: 1, decision: 'rejected' },
      ],
    },
    {
      text: '#1 is a hard pass; please kill 3',
      count: 3,
      expected: [
        { index: 0, decision: 'rejected' },
        { index: 2, decision: 'rejected' },
      ],
    },
    {
      text: '9 yes, #0 no',
      count: 3,
      expected: null,
    },
    {
      text: '9 yes, 2 yep',
      count: 3,
      expected: [{ index: 1, decision: 'approved' }],
    },
    {
      text: 'looks fine to me',
      count: 3,
      expected: null,
    },
  ];

  for (const entry of cases) {
    assert.deepEqual(parsePitchReplies(entry.text, entry.count), entry.expected, entry.text);
  }
});

test('live polling is owner-locked, clarifies once, persists feedback and offset, and stashes draft callbacks', async () => {
  const calls: TelegramCall[] = [];
  let getUpdatesCalls = 0;
  setTelegramFetch((async (input, init) => {
    const method = telegramMethod(input);
    const body = jsonBody(init);
    calls.push({ method, body });

    if (method === 'sendMessage') {
      return jsonResponse({ ok: true, result: { message_id: calls.length + 100 } });
    }
    if (method === 'answerCallbackQuery') {
      return jsonResponse({ ok: true, result: true });
    }
    assert.equal(method, 'getUpdates');
    assert.equal(isApprovalPollActive(), true);
    getUpdatesCalls++;
    assert.equal(getUpdatesCalls, 1);
    return jsonResponse({
      ok: true,
      result: [
        messageUpdate(19, 'all yes', 'approver-chat', 'owner', 90),
        messageUpdate(20, 'all yes', 'intruder-chat', 'intruder'),
        messageUpdate(21, 'maybe later'),
        messageUpdate(22, 'still thinking'),
        {
          update_id: 23,
          callback_query: {
            id: 'draft-callback',
            data: 'approve:draft-during-pitches',
            from: { username: 'video-owner' },
            message: { chat: { id: 'approver-chat' } },
          },
        },
        messageUpdate(24, '1 yes, 2 no: too broad'),
      ],
    });
  }) as TelegramFetchFn);

  const result = await runPitchGate([pitch(1), pitch(2)], { dir });

  assert.equal(result[0]?.status, 'approved');
  assert.equal(result[0]?.decidedBy, 'owner');
  assert.equal(result[1]?.status, 'rejected');
  assert.equal(result[1]?.feedback, ': too broad');
  assert.equal(isApprovalPollActive(), false);

  const sendCalls = calls.filter((call) => call.method === 'sendMessage');
  assert.equal(sendCalls.length, 2, 'one batch card and one clarification only');
  assert.equal(sendCalls[0]?.body.parse_mode, 'MarkdownV2');
  assert.match(String(sendCalls[0]?.body.text), /^🗳 \*Pitch review — reply naturally\*/);
  assert.match(String(sendCalls[0]?.body.text), /money\\_\\\[move\\\]\\!/);
  assert.match(String(sendCalls[0]?.body.text), /about the money\\\./);
  assert.equal(
    sendCalls.filter((call) => String(call.body.text).startsWith("Couldn't parse that")).length,
    1,
  );

  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'telegram-offset.json'), 'utf8')), {
    offset: 25,
  });
  const pitchRecords = readJsonl(join(dir, 'pitches.jsonl'));
  assert.equal(pitchRecords.length, 2);
  assert.equal(pitchRecords[1]?.feedback, ': too broad');
  assert.deepEqual(readJsonl(join(dir, 'pitch-feedback.jsonl')), [{
    at: result[1]?.decidedAt,
    pitchId: 'pitch-2',
    headline: 'Pitch 2: money_[move]!',
    vertical: 'tech',
    decision: 'rejected',
    feedback: ': too broad',
  }]);

  assert.deepEqual(await pollForDecision('draft-during-pitches'), {
    status: 'approved',
    decidedBy: 'video-owner',
  });
  assert.equal(calls.filter((call) => call.method === 'answerCallbackQuery').length, 1);
});

test('later messages override earlier pitch decisions before the returned batch closes', async () => {
  setTelegramFetch((async (input) => {
    const method = telegramMethod(input);
    if (method === 'sendMessage') {
      return jsonResponse({ ok: true, result: { message_id: 300 } });
    }
    return jsonResponse({
      ok: true,
      result: [
        messageUpdate(30, '1 no: too slow'),
        messageUpdate(31, '1 yes but lead with the money'),
      ],
    });
  }) as TelegramFetchFn);

  const [result] = await runPitchGate([pitch(1)], { dir });
  assert.equal(result?.status, 'approved');
  assert.equal(result?.feedback, 'but lead with the money');

  const pitchRecords = readJsonl(join(dir, 'pitches.jsonl'));
  assert.deepEqual(pitchRecords.map((record) => record.status), ['rejected', 'approved']);
  assert.equal(readJsonl(join(dir, 'pitch-feedback.jsonl')).length, 2);
});

test('the deadline appends expired records for every unanswered pitch', async () => {
  process.env.PITCH_TIMEOUT_MIN = '0';
  let fetches = 0;
  setTelegramFetch((async (input) => {
    fetches++;
    assert.equal(telegramMethod(input), 'sendMessage');
    return jsonResponse({ ok: true, result: { message_id: 400 } });
  }) as TelegramFetchFn);

  const result = await runPitchGate([pitch(1), pitch(2)], { dir });

  assert.equal(fetches, 1, 'expiry still requires a delivered batch card');
  assert.deepEqual(result.map((entry) => entry.status), ['expired', 'expired']);
  assert.deepEqual(
    readJsonl(join(dir, 'pitches.jsonl')).map((record) => record.status),
    ['expired', 'expired'],
  );
});

test('DRY_RUN auto-approves and persists every pitch with zero Telegram fetches', async () => {
  (config as unknown as MutableConfig).dryRun = true;
  let fetches = 0;
  setTelegramFetch((async () => {
    fetches++;
    throw new Error('DRY_RUN must not call Telegram');
  }) as TelegramFetchFn);
  const originalLog = console.log;
  console.log = () => {};

  try {
    const result = await runPitchGate([pitch(1), pitch(2)], { dir });
    assert.equal(fetches, 0);
    assert.deepEqual(result.map((entry) => entry.status), ['approved', 'approved']);
    assert.deepEqual(result.map((entry) => entry.decidedBy), ['dry-run', 'dry-run']);
    assert.deepEqual(
      readJsonl(join(dir, 'pitches.jsonl')).map((record) => record.decidedBy),
      ['dry-run', 'dry-run'],
    );
  } finally {
    console.log = originalLog;
  }
});
