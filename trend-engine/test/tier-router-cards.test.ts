import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { afterEach, test } from 'node:test';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';

import {
  pollForDecision,
  renderCard,
  requestApproval,
  resetPendingDecisions,
  resetTelegramFetch,
  setTelegramFetch,
  type ApprovalRecord,
  type TelegramFetchFn,
} from '../src/approval/telegram.js';
import { config } from '../src/config.js';
import type { ClipDraft, ComplianceResult, Topic } from '../src/types.js';

type ComplianceTier = 'green' | 'yellow' | 'red';
type MutableConfig = {
  dryRun: boolean;
  dataDir: string;
  licensing: { monthlyClipBudget: number };
  approval: {
    telegramBotToken: string;
    telegramChatId: string;
    timeoutMinutes: number;
  };
};

function temporaryDir(): string {
  return `${mkdtempSync(join(process.env.TMPDIR ?? '/tmp', 'tier-router-cards-'))}${sep}`;
}

function configure(dataDir: string, options: { dryRun?: boolean; timeout?: number } = {}): () => void {
  const mutable = config as unknown as MutableConfig;
  const original = {
    dryRun: mutable.dryRun,
    dataDir: mutable.dataDir,
    licensing: { ...mutable.licensing },
    approval: { ...mutable.approval },
  };
  mutable.dryRun = options.dryRun ?? false;
  mutable.dataDir = dataDir;
  mutable.approval.telegramBotToken = 'test-token';
  mutable.approval.telegramChatId = 'test-chat';
  mutable.approval.timeoutMinutes = options.timeout ?? 0.01;

  return () => {
    mutable.dryRun = original.dryRun;
    mutable.dataDir = original.dataDir;
    Object.assign(mutable.licensing, original.licensing);
    Object.assign(mutable.approval, original.approval);
  };
}

function topic(): Topic {
  return {
    id: 'topic-tier',
    title: 'Tier router topic',
    summary: 'Summary',
    whyTrending: 'Because',
    momentum: 'rising',
    longevity: 'sustained',
    stage: 'rising',
    leadTimeDays: 2,
    postWindow: 'post now',
    catalyst: 'Launch',
    recommendation: 'post-now',
    domains: ['technology'],
    suggestedAngle: 'Explain the conditions',
    saturationRisk: 'low',
    opportunityScore: 86,
    contributingSources: ['mock'],
  };
}

function draft(outputPath: string): ClipDraft {
  return {
    id: 'draft-tier',
    topicId: 'topic-tier',
    sourceCandidateId: 'candidate-tier',
    outputPath,
    aspectRatio: '9:16',
    caption: 'Caption for review',
    hashtags: ['tier-router'],
    targetPlatforms: ['tiktok'],
    license: {
      type: 'cc-by',
      requiresAttribution: true,
      attributionText: 'Example creator',
      commercialUse: true,
      sourceUrl: 'https://example.test/source',
    },
  };
}

function compliance(tier: ComplianceTier, tierReasons: string[] = []): ComplianceResult {
  return {
    approved: tier !== 'red',
    reasons: tier === 'red' ? ['[red] blocked'] : ['license verified'],
    requiresHumanReview: true,
    tier,
    tierReasons,
  } as ComplianceResult;
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

afterEach(() => {
  resetTelegramFetch();
  resetPendingDecisions();
});

test('yellow cards render the tier, escaped checklist bullets, and YES instruction', () => {
  const card = renderCard(
    topic(),
    draft('/missing.mp4'),
    compliance('yellow', ['Verify source (again).', 'No edits beyond crop + captions']),
  );

  assert.match(card, /^\*Tier:\* yellow$/m);
  assert.match(card, /\*Yellow\\-tier conditions \\- ALL must be true:\*/);
  assert.ok(card.includes('• Verify source \\(again\\)\\.'));
  assert.ok(card.includes('• No edits beyond crop \\+ captions'));
  assert.ok(card.includes('Reply YES to this card to confirm every condition\\.'));
  assert.ok(card.includes('Approve button alone will NOT publish a yellow draft\\.'));
});

test('green and legacy cards show a green tier without a yellow checklist', () => {
  const greenCard = renderCard(topic(), draft('/missing.mp4'), compliance('green'));
  const legacyCard = renderCard(topic(), draft('/missing.mp4'), {
    approved: true,
    reasons: ['legacy result'],
    requiresHumanReview: true,
  });

  for (const card of [greenCard, legacyCard]) {
    assert.match(card, /^\*Tier:\* green$/m);
    assert.doesNotMatch(card, /Yellow\\-tier conditions/);
    assert.doesNotMatch(card, /Reply YES/);
  }
});

test('yellow approve button only prompts; a subsequent YES reply approves and is audited', async () => {
  const dir = temporaryDir();
  const restore = configure(dir);
  const calls: Array<{ method: string; body: Record<string, unknown> }> = [];
  let polls = 0;
  let sentMessages = 0;

  setTelegramFetch((async (input, init) => {
    const method = telegramMethod(input);
    const body = init?.body instanceof FormData ? {} : jsonBody(init);
    calls.push({ method, body });
    if (method === 'sendMessage') {
      sentMessages++;
      return jsonResponse({ ok: true, result: { message_id: sentMessages === 1 ? 700 : 701 } });
    }
    if (method === 'getUpdates') {
      polls++;
      return polls === 1
        ? jsonResponse({
            ok: true,
            result: [{
              update_id: 10,
              callback_query: {
                id: 'yellow-approve',
                data: 'approve:draft-tier',
                from: { username: 'button-reviewer' },
                message: { chat: { id: 'test-chat' } },
              },
            }],
          })
        : jsonResponse({
            ok: true,
            result: [{
              update_id: 11,
              message: {
                text: '  yEs  ',
                from: { username: 'yes-reviewer' },
                chat: { id: 'test-chat' },
                reply_to_message: { message_id: 701 },
              },
            }],
          });
    }
    return jsonResponse({ ok: true, result: true });
  }) as TelegramFetchFn);

  try {
    const decision = await requestApproval(
      topic(),
      draft(join(dir, 'missing.mp4')),
      compliance('yellow', ['Confirm rights']),
    );
    assert.deepEqual(decision, {
      status: 'approved',
      decidedBy: 'yes-reviewer',
      note: 'yellow-tier conditions confirmed via YES reply',
      conditionsConfirmed: true,
    });
    assert.equal(polls, 2);
    assert.ok(calls.some((call) => call.method === 'answerCallbackQuery'));
    assert.ok(calls.some(
      (call) =>
        call.method === 'sendMessage' &&
        call.body.text ===
          'Yellow-tier draft: reply YES to the review card to confirm all conditions are met.',
    ));

    const record = JSON.parse(
      readFileSync(`${dir}approvals.jsonl`, 'utf8').trim(),
    ) as ApprovalRecord;
    assert.equal(record.tier, 'yellow');
    assert.equal(record.conditions_confirmed, true);
    assert.equal(record.decidedBy, 'yes-reviewer');
  } finally {
    restore();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('arbitrary yellow reply re-prompts once and never caption-approves', async () => {
  const dir = temporaryDir();
  const restore = configure(dir, { timeout: 0.001 });
  let polls = 0;
  const prompts: string[] = [];

  setTelegramFetch((async (input, init) => {
    const method = telegramMethod(input);
    if (method === 'getUpdates') {
      polls++;
      if (polls === 1) {
        return jsonResponse({
          ok: true,
          result: [{
            update_id: 20,
            message: {
              text: 'use this as a new caption',
              from: { username: 'reviewer' },
              chat: { id: 'test-chat' },
              reply_to_message: { message_id: 800 },
            },
          }],
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 75));
      return jsonResponse({ ok: true, result: [] });
    }
    if (method === 'sendMessage') {
      prompts.push(String(jsonBody(init).text));
      return jsonResponse({ ok: true, result: { message_id: 801 } });
    }
    return jsonResponse({ ok: true, result: true });
  }) as TelegramFetchFn);

  try {
    const decision = await pollForDecision('draft-tier', 800, { tier: 'yellow' });
    assert.equal(decision.status, 'timeout');
    assert.equal(decision.editedCaption, undefined);
    assert.deepEqual(prompts, [
      'Yellow-tier draft: reply YES to the review card to confirm all conditions are met.',
    ]);
  } finally {
    restore();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('green text replies still override the caption and approve', async () => {
  const dir = temporaryDir();
  const restore = configure(dir);

  setTelegramFetch((async (input) => {
    if (telegramMethod(input) === 'getUpdates') {
      return jsonResponse({
        ok: true,
        result: [{
          update_id: 30,
          message: {
            text: 'A safer edited caption',
            from: { username: 'green-reviewer' },
            chat: { id: 'test-chat' },
            reply_to_message: { message_id: 900 },
          },
        }],
      });
    }
    return jsonResponse({ ok: true, result: true });
  }) as TelegramFetchFn);

  try {
    assert.deepEqual(await pollForDecision('draft-green', 900, { tier: 'green' }), {
      status: 'approved',
      decidedBy: 'green-reviewer',
      editedCaption: 'A safer edited caption',
      note: 'caption overridden via reply',
    });
  } finally {
    restore();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('yellow reject and timeout behavior remain fail-closed', async () => {
  const rejectDir = temporaryDir();
  const restoreReject = configure(rejectDir);
  let polls = 0;

  setTelegramFetch((async (input, init) => {
    const method = telegramMethod(input);
    if (method === 'getUpdates') {
      polls++;
      return polls === 1
        ? jsonResponse({
            ok: true,
            result: [{
              update_id: 40,
              callback_query: {
                id: 'yellow-reject',
                data: 'reject:draft-reject',
                from: { username: 'reject-reviewer' },
                message: { chat: { id: 'test-chat' } },
              },
            }],
          })
        : jsonResponse({
            ok: true,
            result: [{
              update_id: 41,
              message: {
                text: 'A condition is not met.',
                from: { username: 'reject-reviewer' },
                chat: { id: 'test-chat' },
                reply_to_message: { message_id: 1001 },
              },
            }],
          });
    }
    if (method === 'sendMessage') {
      assert.equal(
        jsonBody(init).text,
        'Reply to this message with a rejection reason (or ignore).',
      );
      return jsonResponse({ ok: true, result: { message_id: 1001 } });
    }
    return jsonResponse({ ok: true, result: true });
  }) as TelegramFetchFn);

  try {
    assert.deepEqual(await pollForDecision('draft-reject', 1000, { tier: 'yellow' }), {
      status: 'rejected',
      decidedBy: 'reject-reviewer',
      note: 'A condition is not met.',
    });
  } finally {
    restoreReject();
    rmSync(rejectDir, { recursive: true, force: true });
  }

  const timeoutDir = temporaryDir();
  const restoreTimeout = configure(timeoutDir, { timeout: 0 });
  try {
    assert.deepEqual(await pollForDecision('draft-timeout', 1100, { tier: 'yellow' }), {
      status: 'timeout',
      note: 'no decision within 0 min',
    });
  } finally {
    restoreTimeout();
    rmSync(timeoutDir, { recursive: true, force: true });
  }
});

test('requestApproval rejects red tiers before DRY_RUN or Telegram work', async () => {
  const dir = temporaryDir();
  const restore = configure(dir, { dryRun: true });
  let fetchCalls = 0;
  setTelegramFetch((async () => {
    fetchCalls++;
    return jsonResponse({ ok: true, result: true });
  }) as TelegramFetchFn);

  try {
    await assert.rejects(
      requestApproval(topic(), draft(join(dir, 'missing.mp4')), compliance('red')),
      new Error('red-tier draft must never reach the approval card'),
    );
    assert.equal(fetchCalls, 0);
  } finally {
    restore();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('yellow DRY_RUN stays offline and reports unconfirmed conditions without approval state', async () => {
  const dir = temporaryDir();
  const restore = configure(dir, { dryRun: true });
  const originalLog = console.log;
  const logs: string[] = [];
  let fetchCalls = 0;
  console.log = (...args: unknown[]) => logs.push(args.map(String).join(' '));
  setTelegramFetch((async () => {
    fetchCalls++;
    return jsonResponse({ ok: true, result: true });
  }) as TelegramFetchFn);

  try {
    const decision = await requestApproval(
      topic(),
      draft(join(dir, 'missing.mp4')),
      compliance('yellow', ['Confirm source']),
    );
    assert.equal(fetchCalls, 0);
    assert.equal(decision.conditionsConfirmed, false);
    assert.match(decision.note ?? '', /yellow conditions NOT confirmed/);
    assert.match(logs.join('\n'), /Yellow\\-tier conditions/);
    assert.equal(existsSync(`${dir}approvals.jsonl`), false);
  } finally {
    console.log = originalLog;
    restore();
    rmSync(dir, { recursive: true, force: true });
  }
});

type BudgetCandidate = { id: string; license: { type: string } };
type ApplyBudgetGate = (
  candidates: BudgetCandidate[],
  gateConfig: { dataDir: string; licensing: { monthlyClipBudget: number } },
  gateConsole: { log: (...args: unknown[]) => void },
) => Promise<BudgetCandidate[]>;

function loadBudgetGate(): ApplyBudgetGate {
  const source = readFileSync(
    new URL('../src/orchestrator.ts', import.meta.url),
    'utf8',
  );
  const marker = '  // [tier-router-cards] licensed-clip budget gate';
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, 'budget gate marker must remain in processTopic');
  const blockStart = source.indexOf('\n', markerIndex) + 1;
  const blockEnd = source.indexOf('  if (produceSourced)', blockStart);
  assert.notEqual(blockEnd, -1, 'budget gate must remain immediately before sourced routing');
  const block = source.slice(blockStart, blockEnd);
  const compiled = transpileModule(
    `async function applyBudgetGate(candidates, config, console) {\n${block}\nreturn candidates;\n}`,
    { compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.None } },
  ).outputText;

  return new Function(`${compiled}\nreturn applyBudgetGate;`)() as ApplyBudgetGate;
}

async function applyBudgetGate(
  dir: string,
  cap: number,
  candidates: BudgetCandidate[],
): Promise<{ candidates: BudgetCandidate[]; logs: string[] }> {
  const logs: string[] = [];
  const gate = loadBudgetGate();
  const result = await gate(
    candidates,
    { dataDir: dir, licensing: { monthlyClipBudget: cap } },
    { log: (...args: unknown[]) => logs.push(args.map(String).join(' ')) },
  );
  return { candidates: result, logs };
}

function receipt(type: string, publishedAt = new Date().toISOString()): string {
  return JSON.stringify({ status: 'published', license: { type }, publishedAt });
}

test('licensed-clip budget gate skips cap-zero and exhausted candidates', async () => {
  const zeroDir = temporaryDir();
  try {
    const zero = await applyBudgetGate(zeroDir, 0, [
      { id: 'licensed-zero', license: { type: 'licensed' } },
    ]);
    assert.deepEqual(zero.candidates, []);
    assert.deepEqual(zero.logs, [
      '  ⛔ licensed-clip budget (0/0 this month) reached - skipping licensed candidate licensed-zero',
    ]);
  } finally {
    rmSync(zeroDir, { recursive: true, force: true });
  }

  const exhaustedDir = temporaryDir();
  try {
    writeFileSync(
      `${exhaustedDir}provenance.jsonl`,
      `${receipt('licensed')}\nnot-json\n${receipt('licensed')}\n`,
    );
    const exhausted = await applyBudgetGate(exhaustedDir, 2, [
      { id: 'licensed-exhausted', license: { type: 'licensed' } },
    ]);
    assert.deepEqual(exhausted.candidates, []);
    assert.deepEqual(exhausted.logs, [
      '  ⛔ licensed-clip budget (2/2 this month) reached - skipping licensed candidate licensed-exhausted',
    ]);
  } finally {
    rmSync(exhaustedDir, { recursive: true, force: true });
  }
});

test('licensed-clip budget gate allows remaining budget and never affects other licenses', async () => {
  const dir = temporaryDir();
  try {
    writeFileSync(
      `${dir}provenance.jsonl`,
      `${receipt('licensed')}\n${receipt('stock')}\n${receipt('licensed', '2020-01-01T00:00:00.000Z')}\n`,
    );
    const input = [
      { id: 'licensed-allowed', license: { type: 'licensed' } },
      { id: 'stock-always-allowed', license: { type: 'stock' } },
      { id: 'cc-always-allowed', license: { type: 'cc-by' } },
    ];
    const allowed = await applyBudgetGate(dir, 2, input);
    assert.deepEqual(allowed.candidates, input);
    assert.deepEqual(allowed.logs, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
