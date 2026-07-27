import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { after, afterEach, test } from 'node:test';

import {
  resetPendingDecisions,
  resetTelegramFetch,
  setTelegramFetch,
} from '../src/approval/telegram.js';
import { config } from '../src/config.js';
import { resetLLM, setLLM, type LLM, type StructuredRequest } from '../src/llm.js';
import { runOnce } from '../src/orchestrator.js';
import {
  produceStudioEpisode,
  resetRenderRunner,
  setRenderRunner,
  type RenderRunnerResult,
} from '../src/studioBridge.js';
import { makeMockLLM } from '../src/testing/mockLlm.js';
import type { Pitch, Topic } from '../src/types.js';

const temporaryDirs: string[] = [];

interface MutableConfig {
  dryRun: boolean;
  dataDir: string;
  studio: {
    mode: boolean;
    dir: string;
    renderTimeoutMin: number;
  };
  approval: {
    telegramBotToken: string;
    telegramChatId: string;
    timeoutMinutes: number;
  };
}

const mutableConfig = config as unknown as MutableConfig;
const originalConfig = {
  dryRun: mutableConfig.dryRun,
  dataDir: mutableConfig.dataDir,
  studio: { ...mutableConfig.studio },
  approval: { ...mutableConfig.approval },
};

function temporaryDataDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'trend-engine-studio-bridge-'));
  temporaryDirs.push(dir);
  return `${dir}${sep}`;
}

function configure(dryRun: boolean): string {
  const dataDir = temporaryDataDir();
  mutableConfig.dryRun = dryRun;
  mutableConfig.dataDir = dataDir;
  mutableConfig.studio.mode = true;
  mutableConfig.studio.dir = originalConfig.studio.dir;
  mutableConfig.studio.renderTimeoutMin = 0.01;
  mutableConfig.approval.telegramBotToken = dryRun ? '' : 'test-token-never-sent';
  mutableConfig.approval.telegramChatId = dryRun ? '' : '4242';
  mutableConfig.approval.timeoutMinutes = 0.1;
  return dataDir;
}

function restoreConfig(): void {
  mutableConfig.dryRun = originalConfig.dryRun;
  mutableConfig.dataDir = originalConfig.dataDir;
  Object.assign(mutableConfig.studio, originalConfig.studio);
  Object.assign(mutableConfig.approval, originalConfig.approval);
}

afterEach(() => {
  resetLLM();
  resetRenderRunner();
  resetTelegramFetch();
  resetPendingDecisions();
  restoreConfig();
});

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

const topic: Topic = {
  id: 'studio-topic',
  title: 'A studio bridge forecast',
  summary: 'A forecast used to test the studio path.',
  whyTrending: 'A scheduled event creates a useful teaching opportunity.',
  momentum: 'rising',
  longevity: 'sustained',
  stage: 'rising',
  leadTimeDays: 5,
  postWindow: 'publish this week',
  catalyst: 'Studio test day',
  recommendation: 'prepare',
  domains: ['educational', 'tech'],
  suggestedAngle: 'The original forecast angle.',
  saturationRisk: 'low',
  opportunityScore: 88,
  contributingSources: ['mock'],
};

const pitch: Pitch = {
  id: 'pitch-studio-topic',
  createdAt: '2026-07-19T00:00:00.000Z',
  topicId: topic.id,
  topicTitle: topic.title,
  headline: 'The Hidden Clock Behind Every Trend',
  stakes: 'Timing changes whether useful information reaches people today.',
  angle: 'Teach the three signals that separate timing from hype.',
  eventPeg: 'Studio test day — July 24',
  vertical: 'tech',
  format: 'analysis',
  status: 'approved',
};

const narration =
  'Why does this story matter now? First, timing explains attention: a visible event gives people a reason to care today, while the larger pattern was already forming. Second, stakes turn information into a useful decision because they show exactly who is affected and what may change next. Third, context keeps the lesson honest by separating evidence, interpretation, and uncertainty. Notice the early payoff: follow the event, identify the stakes, then test the angle against what actually happened. That simple sequence makes a fast story educational instead of merely urgent. So, why does this story matter now? Because timing, stakes, and context make the answer useful.';

function validCopy() {
  return {
    title: 'WHY THIS STORY MATTERS NOW',
    narration,
    scenes: [
      { id: 'hook', type: 'edu-hook', cue: 'Why does this story matter now' },
      { id: 'timing', type: 'edu-cloud', cue: 'First, timing explains attention: a visible' },
      { id: 'stakes', type: 'edu-shrink', cue: 'Second, stakes turn information into a' },
      { id: 'context', type: 'edu-privacy', cue: 'Third, context keeps the lesson honest' },
      { id: 'payoff', type: 'edu-everywhere', cue: 'Notice the early payoff: follow the' },
      { id: 'outro', type: 'edu-outro', cue: 'So, why does this story matter' },
    ],
    caption: 'Three checks turn a trend into a useful lesson.',
    hashtags: ['education', 'trends', 'context'],
  } as const;
}

function queuedLlm(responses: unknown[]): {
  llm: LLM;
  requests: StructuredRequest[];
} {
  const requests: StructuredRequest[] = [];
  let index = 0;
  return {
    requests,
    llm: {
      async structured<T>(request: StructuredRequest): Promise<T> {
        requests.push(request);
        const response = responses[index++];
        if (response === undefined) throw new Error('unexpected structured LLM call');
        return response as T;
      },
      async research(): Promise<string> {
        throw new Error('research must not run in studio bridge tests');
      },
    },
  };
}

function counters() {
  return { published: 0, originals: 0, rejected: 0, blocked: 0 };
}

function state() {
  return { version: 1 as const, publishedTopics: {}, runCount: 0 };
}

function response(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function quiet<T>(run: () => Promise<T>): Promise<T> {
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

test('script validation retries once, names violations, then throws', async () => {
  configure(false);
  const tooShort = { ...validCopy(), narration: 'This opening is much too short.' };
  const { llm, requests } = queuedLlm([tooShort, tooShort]);
  setLLM(llm);
  let renderCalls = 0;
  setRenderRunner(async () => {
    renderCalls++;
    return { exitCode: 0 };
  });

  await assert.rejects(
    produceStudioEpisode(pitch, topic, counters(), state()),
    /script validation failed after corrective retry: narration must contain 85-110 words/,
  );
  assert.equal(requests.length, 2);
  assert.match(requests[1]?.user ?? '', /CORRECTIVE RETRY/);
  assert.match(requests[1]?.user ?? '', /narration must contain 85-110 words/);
  assert.equal(renderCalls, 0);
});

test('scene cues must be normalized verbatim narration substrings in order', async () => {
  configure(false);
  const invalid = {
    ...validCopy(),
    scenes: validCopy().scenes.map((scene, index) =>
      index === 2 ? { ...scene, cue: 'these invented words never appear' } : scene,
    ),
  };
  const { llm, requests } = queuedLlm([invalid, invalid]);
  setLLM(llm);

  await assert.rejects(
    produceStudioEpisode(pitch, topic, counters(), state()),
    /cue is not a verbatim normalized narration substring in order/,
  );
  assert.equal(requests.length, 2);
  assert.match(requests[1]?.user ?? '', /these invented words never appear/);
});

test('writes EpisodeScript shape, passes exact CLI argv, preserves feedback, and rejection never publishes', async () => {
  const dataDir = configure(false);
  const feedback = 'Make the payoff about money — not hype.';
  const approvedPitch: Pitch = { ...pitch, feedback };
  const { llm, requests } = queuedLlm([validCopy()]);
  setLLM(llm);

  let spawnArgs: string[] | undefined;
  let draftId = '';
  setRenderRunner(async (executable, args, options): Promise<RenderRunnerResult> => {
    assert.equal(executable, process.execPath);
    assert.equal(options.cwd, config.studio.dir);
    spawnArgs = [...args];
    const scriptPath = args[2];
    const outputPath = args[4];
    assert.ok(scriptPath);
    assert.ok(outputPath);
    const script = JSON.parse(readFileSync(scriptPath, 'utf8')) as { id: string };
    draftId = script.id;
    await writeFile(outputPath, 'fake mp4 bytes');
    return { exitCode: 0, stdout: '[studio] Finished', stderr: '' };
  });

  let updates = 0;
  let telegramCalls = 0;
  setTelegramFetch(async (input, init) => {
    telegramCalls++;
    const method = String(input).split('/').at(-1);
    if (method === 'sendVideo') return response({ ok: true, result: { message_id: 101 } });
    if (method === 'answerCallbackQuery') return response({ ok: true, result: true });
    if (method === 'sendMessage') {
      const body = JSON.parse(String(init?.body)) as { text?: string };
      return response({
        ok: true,
        result: {
          message_id: body.text?.startsWith('Reply to this message') ? 202 : 150,
        },
      });
    }
    if (method === 'getUpdates') {
      updates++;
      if (updates === 1) {
        return response({
          ok: true,
          result: [{
            update_id: 1,
            callback_query: {
              id: 'reject-callback',
              data: `reject:${draftId}`,
              from: { id: 7, username: 'owner' },
              message: { chat: { id: 4242 } },
            },
          }],
        });
      }
      return response({
        ok: true,
        result: [{
          update_id: 2,
          message: {
            text: 'The lesson needs a stronger ending.',
            chat: { id: 4242 },
            from: { id: 7, username: 'owner' },
            reply_to_message: { message_id: 202 },
          },
        }],
      });
    }
    throw new Error(`unexpected Telegram method ${method}`);
  });

  const report = counters();
  await quiet(() => produceStudioEpisode(approvedPitch, topic, report, state()));

  assert.equal(requests.length, 1);
  assert.ok(
    requests[0]?.user.includes(
      `OWNER FEEDBACK (verbatim, must be honored as a constraint): "${feedback}"`,
    ),
  );
  assert.ok(spawnArgs);
  const scriptPath = spawnArgs?.[2];
  const outputPath = spawnArgs?.[4];
  assert.deepEqual(spawnArgs?.slice(1), ['render', scriptPath, '--out', outputPath]);
  assert.ok(scriptPath?.startsWith(join(dataDir, 'studio-scripts')));
  assert.ok(outputPath?.startsWith(join(dataDir, 'clips')));

  const script = JSON.parse(readFileSync(scriptPath!, 'utf8')) as Record<string, unknown>;
  assert.deepEqual(Object.keys(script).sort(), ['id', 'narration', 'scenes', 'title', 'voice']);
  assert.match(String(script.id), /^ep-\d{8}-[a-zA-Z0-9_-]+$/);
  assert.deepEqual(script.voice, { name: 'ElevenLabs', rate: 178 });
  assert.equal(script.narration, narration);
  assert.deepEqual(
    (script.scenes as Array<Record<string, unknown>>).map((scene) => Object.keys(scene).sort()),
    Array(6).fill(['cue', 'id', 'type']),
  );

  assert.equal(report.rejected, 1);
  assert.equal(report.published, 0);
  assert.equal(report.originals, 0);
  assert.ok(telegramCalls > 0);
  assert.equal(existsSync(join(dataDir, 'provenance.jsonl')), false);
  assert.equal(existsSync(join(dataDir, 'outbox')), false);
});

test('render timeout surfaces the bounded stderr tail before approval', async () => {
  configure(false);
  const { llm } = queuedLlm([validCopy()]);
  setLLM(llm);
  let telegramCalls = 0;
  setTelegramFetch(async () => {
    telegramCalls++;
    throw new Error('approval must not run after a render timeout');
  });
  setRenderRunner(async () => ({
    exitCode: null,
    signal: 'SIGKILL',
    timedOut: true,
    stderr: '[studio] ERROR: Whisper stopped responding',
  }));

  await assert.rejects(
    produceStudioEpisode(pitch, topic, counters(), state()),
    (error: unknown) => {
      assert.match(String(error), /studio render timed out/);
      assert.match(String(error), /\[studio\] ERROR: Whisper stopped responding/);
      return true;
    },
  );
  assert.equal(telegramCalls, 0);
});

test('DRY_RUN writes a deterministic fixture and performs no LLM, spawn, or Telegram work', async () => {
  const dataDir = configure(true);
  let llmCalls = 0;
  setLLM({
    async structured<T>(): Promise<T> {
      llmCalls++;
      throw new Error('DRY_RUN must not call the LLM');
    },
    async research(): Promise<string> {
      llmCalls++;
      throw new Error('DRY_RUN must not research');
    },
  });
  let renderCalls = 0;
  setRenderRunner(async () => {
    renderCalls++;
    throw new Error('DRY_RUN must not spawn');
  });
  let telegramCalls = 0;
  setTelegramFetch(async () => {
    telegramCalls++;
    throw new Error('DRY_RUN must not call Telegram');
  });

  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => logs.push(args.map(String).join(' '));
  try {
    await produceStudioEpisode(pitch, topic, counters(), state());
  } finally {
    console.log = originalLog;
  }

  const scriptDir = join(dataDir, 'studio-scripts');
  const scripts = (await import('node:fs/promises')).readdir(scriptDir);
  const scriptNames = await scripts;
  assert.equal(scriptNames.length, 1);
  const script = JSON.parse(readFileSync(join(scriptDir, scriptNames[0]!), 'utf8')) as {
    id: string;
    narration: string;
    voice: unknown;
    scenes: Array<{ cue: string; type: string }>;
  };
  assert.match(script.id, /^ep-\d{8}-[a-zA-Z0-9_-]+$/);
  assert.deepEqual(script.voice, { name: 'ElevenLabs', rate: 178 });
  assert.ok(script.scenes.length >= 4 && script.scenes.length <= 6);
  assert.equal(script.scenes[0]?.type, 'edu-hook');
  assert.equal(script.scenes.at(-1)?.type, 'edu-outro');
  const words = script.narration.match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu) ?? [];
  assert.ok(words.length >= 85 && words.length <= 110);

  assert.equal(llmCalls, 0);
  assert.equal(renderCalls, 0);
  assert.equal(telegramCalls, 0);
  assert.equal(existsSync(join(dataDir, 'clips', `${script.id}.mp4`)), false);
  assert.ok(logs.some((line) => line.includes('CLI argv ["render",')));
  assert.ok(logs.some((line) => line.includes(`planned output ${join(dataDir, 'clips', `${script.id}.mp4`)}`)));
  assert.ok(logs.includes('[studio-bridge] DRY_RUN: render + approval skipped'));
});

test('STUDIO_MODE=true makes the approved-pitch studio path primary in DRY_RUN', async () => {
  const dataDir = configure(true);
  setLLM(makeMockLLM());
  let renderCalls = 0;
  setRenderRunner(async () => {
    renderCalls++;
    return { exitCode: 0 };
  });
  let telegramCalls = 0;
  setTelegramFetch(async () => {
    telegramCalls++;
    throw new Error('studio DRY_RUN must not call Telegram');
  });

  const report = await quiet(() => runOnce());
  const scriptDir = join(dataDir, 'studio-scripts');
  const scriptNames = await (await import('node:fs/promises')).readdir(scriptDir);
  assert.ok(scriptNames.length >= 1);
  assert.ok(scriptNames.every((name) => name.endsWith('.script.json')));
  assert.equal(report.topicsConsidered, scriptNames.length);
  assert.equal(report.published, 0);
  assert.equal(report.originals, 0);
  assert.equal(report.metrics.length, 0);
  assert.equal(renderCalls, 0);
  assert.equal(telegramCalls, 0);
});

test('STUDIO_MODE=false keeps the existing sourcing/editor production path active', async () => {
  const dataDir = configure(true);
  mutableConfig.studio.mode = false;
  setLLM(makeMockLLM());
  let renderCalls = 0;
  setRenderRunner(async () => {
    renderCalls++;
    return { exitCode: 0 };
  });
  setTelegramFetch(async () => {
    throw new Error('legacy DRY_RUN approval must not call Telegram');
  });

  const report = await quiet(() => runOnce());
  assert.ok(report.published > 0, 'legacy drafts should still reach the dry-run publisher');
  assert.ok(report.metrics.length > 0, 'legacy publisher results should still be monitored');
  assert.equal(renderCalls, 0);
  assert.equal(existsSync(join(dataDir, 'studio-scripts')), false);
});
