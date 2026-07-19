import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { afterEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { trackResults } from '../src/agents/monitor.js';
import {
  appendApprovalRecord,
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
import { escapeFilterFilename } from '../src/media/captions.js';
import { captionTextfileFilter } from '../src/media/ffmpeg.js';
import { resetFetch, setFetch, type FetchFn } from '../src/publish/http.js';
import type {
  ClipDraft,
  ComplianceResult,
  Platform,
  PublishResult,
  Topic,
} from '../src/types.js';

type MutableConfig = {
  dryRun: boolean;
  dataDir: string;
  approval: {
    telegramBotToken: string;
    telegramChatId: string;
    timeoutMinutes: number;
  };
};

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const daemonInstallScript = join(repoRoot, 'scripts', 'daemon-install.sh');

function temporaryDir(prefix = 'hardening-sweep-'): string {
  return `${mkdtempSync(join(tmpdir(), prefix))}${sep}`;
}

function configure(dataDir: string, dryRun: boolean): () => void {
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

function setEnv(name: string, value: string | undefined): () => void {
  const original = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  return () => {
    if (original === undefined) delete process.env[name];
    else process.env[name] = original;
  };
}

function topic(overrides: Partial<Topic> = {}): Topic {
  return {
    id: 'hardening-topic',
    title: 'Hardening review',
    summary: 'A test topic',
    whyTrending: 'It exercises reviewed boundaries',
    momentum: 'rising',
    longevity: 'sustained',
    stage: 'rising',
    leadTimeDays: 1,
    postWindow: 'now',
    catalyst: null,
    recommendation: 'post-now',
    domains: ['testing'],
    suggestedAngle: 'Explain the hardening changes',
    saturationRisk: 'low',
    opportunityScore: 90,
    contributingSources: ['mock'],
    ...overrides,
  };
}

function draft(outputPath: string, overrides: Partial<ClipDraft> = {}): ClipDraft {
  return {
    id: 'hardening-draft',
    topicId: 'hardening-topic',
    sourceCandidateId: 'hardening-source',
    outputPath,
    aspectRatio: '9:16',
    caption: 'Review this clip',
    hashtags: ['hardening'],
    targetPlatforms: ['tiktok'],
    license: {
      type: 'original',
      requiresAttribution: false,
      commercialUse: true,
      sourceUrl: 'self',
    },
    ...overrides,
  };
}

const compliance: ComplianceResult = {
  approved: true,
  reasons: ['license verified'],
  requiresHumanReview: true,
};

const approvalRecord: ApprovalRecord = {
  timestamp: '2026-07-19T12:00:00.000Z',
  topicId: 'hardening-topic',
  draftId: 'hardening-draft',
  decision: 'approved',
};

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function requestUrl(input: string | URL | Request): string {
  return typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
}

function telegramMethod(input: string | URL | Request): string {
  const url = requestUrl(input);
  return url.slice(url.lastIndexOf('/') + 1);
}

function jsonBody(init?: RequestInit): Record<string, unknown> {
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

afterEach(() => {
  resetTelegramFetch();
  resetPendingDecisions();
  resetFetch();
});

test('oversized Telegram video cards use a safe plain caption and keep the video path', async () => {
  const dataDir = temporaryDir('hardening-telegram-video-');
  const restore = configure(dataDir, false);
  const videoPath = join(dataDir, 'clip.mp4');
  writeFileSync(videoPath, Buffer.from('small fake mp4'));
  const calls: Array<{ method: string; init?: RequestInit }> = [];

  setTelegramFetch((async (input, init) => {
    const method = telegramMethod(input);
    calls.push({ method, init });
    if (method === 'sendVideo') return jsonResponse({ ok: true, result: { message_id: 700 } });
    if (method === 'sendMessage') return jsonResponse({ ok: true, result: { message_id: 701 } });
    if (method === 'getUpdates') {
      return jsonResponse({
        ok: true,
        result: [
          {
            update_id: 1,
            callback_query: {
              id: 'approve-long-video',
              data: 'approve:hardening-draft',
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
    const longDraft = draft(videoPath, {
      caption: 'Escaped markdown _value_ and a literal \\ path. '.repeat(80),
    });
    assert.ok(renderCard(topic(), longDraft, compliance).length > 1024);

    const decision = await requestApproval(topic(), longDraft, compliance);
    assert.equal(decision.status, 'approved');

    const videoCall = calls.find((call) => call.method === 'sendVideo');
    assert.ok(videoCall?.init?.body instanceof FormData);
    const form = videoCall.init.body;
    const caption = String(form.get('caption'));
    assert.equal(form.has('parse_mode'), false);
    assert.ok(caption.length <= 1024);
    assert.equal(caption.endsWith('\\'), false);
    assert.equal(calls.filter((call) => call.method === 'sendVideo').length, 1);
    assert.equal(calls.filter((call) => call.method === 'sendMessage').length, 1);
  } finally {
    restore();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('a callback consumed by another draft poll is answered and queued for its owner', async () => {
  const dataDir = temporaryDir('hardening-telegram-queue-');
  const restore = configure(dataDir, false);
  const answered: string[] = [];
  let getUpdatesCalls = 0;

  setTelegramFetch((async (input, init) => {
    const method = telegramMethod(input);
    if (method === 'getUpdates') {
      getUpdatesCalls += 1;
      if (getUpdatesCalls === 1) {
        return jsonResponse({
          ok: true,
          result: [
            {
              update_id: 10,
              callback_query: {
                id: 'callback-draft-b',
                data: 'approve:draft-B',
                from: { username: 'reviewer-b' },
                message: { chat: { id: 'test-chat' } },
              },
            },
          ],
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 650));
      return jsonResponse({ ok: true, result: [] });
    }
    if (method === 'answerCallbackQuery') {
      answered.push(String(jsonBody(init).callback_query_id));
    }
    return jsonResponse({ ok: true, result: true });
  }) as TelegramFetchFn);

  try {
    assert.equal((await pollForDecision('draft-A')).status, 'timeout');
    assert.deepEqual(answered, ['callback-draft-b']);
    const callsBeforeQueuedPoll = getUpdatesCalls;
    assert.deepEqual(await pollForDecision('draft-B'), {
      status: 'approved',
      decidedBy: 'reviewer-b',
    });
    assert.equal(getUpdatesCalls, callsBeforeQueuedPoll);
  } finally {
    restore();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('zero-view TikTok, Instagram, and X analytics do not create learning records', async () => {
  const dataDir = temporaryDir('hardening-zero-views-');
  const restoreConfig = configure(dataDir, false);
  const restoreTikTok = setEnv('TIKTOK_ACCESS_TOKEN', 'tiktok-token');
  const restoreInstagram = setEnv('IG_ACCESS_TOKEN', 'instagram-token');
  const restoreX = setEnv('X_ACCESS_TOKEN', 'x-token');
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(' '));

  setFetch((async (input) => {
    const url = requestUrl(input);
    if (url.startsWith('https://open.tiktokapis.com/')) {
      return jsonResponse({
        data: {
          videos: [{ view_count: 0, like_count: 10, comment_count: 2, share_count: 1 }],
        },
      });
    }
    if (url.startsWith('https://graph.facebook.com/')) {
      return jsonResponse({
        data: [
          { name: 'views', values: [{ value: 0 }] },
          { name: 'likes', values: [{ value: 10 }] },
          { name: 'comments', values: [{ value: 2 }] },
          { name: 'shares', values: [{ value: 1 }] },
        ],
      });
    }
    if (url.startsWith('https://api.x.com/')) {
      return jsonResponse({
        data: {
          public_metrics: {
            impression_count: 0,
            like_count: 10,
            reply_count: 2,
            retweet_count: 1,
          },
        },
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as FetchFn);

  const platforms: Platform[] = ['tiktok', 'instagram-reels', 'x'];
  const results: PublishResult[] = platforms.map((platform) => ({
    platform,
    status: 'published',
    postId: `zero-${platform}`,
  }));

  try {
    assert.deepEqual(await trackResults(results, topic()), []);
    for (const platform of platforms) {
      assert.ok(warnings.some((warning) => warning.includes(`[monitor:${platform}]`) && warning.includes('no usable data')));
    }
    assert.equal(existsSync(join(dataDir, 'metrics.jsonl')), false);
    assert.equal(existsSync(join(dataDir, 'outcomes.jsonl')), false);
  } finally {
    console.warn = originalWarn;
    restoreTikTok();
    restoreInstagram();
    restoreX();
    restoreConfig();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('Instagram analytics keeps its token out of the URL and round-trips bearer-authenticated stats', async () => {
  const dataDir = temporaryDir('hardening-instagram-auth-');
  const restoreConfig = configure(dataDir, false);
  const restoreInstagram = setEnv('IG_ACCESS_TOKEN', 'secret-instagram-token');
  let capturedUrl = '';
  let capturedAuthorization: string | null = null;

  setFetch((async (input, init) => {
    capturedUrl = requestUrl(input);
    capturedAuthorization = new Headers(init?.headers).get('Authorization');
    return jsonResponse({
      data: [
        { name: 'views', values: [{ value: 345 }] },
        { name: 'likes', values: [{ value: 34 }] },
        { name: 'comments', values: [{ value: 5 }] },
        { name: 'shares', values: [{ value: 6 }] },
      ],
    });
  }) as FetchFn);

  try {
    const [metric] = await trackResults([
      { platform: 'instagram-reels', status: 'published', postId: 'ig-post' },
    ]);
    assert.ok(metric);
    assert.deepEqual(
      { ...metric, capturedAt: '' },
      {
        postId: 'ig-post',
        platform: 'instagram-reels',
        views: 345,
        likes: 34,
        comments: 5,
        shares: 6,
        capturedAt: '',
      },
    );
    assert.equal(capturedUrl.includes('access_token'), false);
    assert.equal(capturedAuthorization, 'Bearer secret-instagram-token');
  } finally {
    restoreInstagram();
    restoreConfig();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('daemon installer XML-escapes interpolated values and shell-quotes its command', (t) => {
  const script = readFileSync(daemonInstallScript, 'utf8');
  assert.match(script, /xml_escape\(\) \{/);
  assert.match(script, /value="\$\{value\/\/&\/&amp;\}"/);
  assert.match(script, /SHELL_CMD="cd \$\(printf '%q' "\$REPO_ROOT"\) && exec \$\(printf '%q' "\$NPM_BIN"\) start"/);
  assert.match(script, /<string>\$\(xml_escape "\$SHELL_CMD"\)<\/string>/);
  assert.match(script, /<string>\$\(xml_escape "\$REPO_ROOT"\)<\/string>/);
  assert.match(script, /<string>\$\(xml_escape "\$LOG_PATH"\)<\/string>/);
  assert.doesNotMatch(script, /<string>\$PLIST_REPO_ROOT<\/string>/);

  const bash = spawnSync('bash', ['-n', daemonInstallScript], { encoding: 'utf8' });
  if (bash.error && 'code' in bash.error && bash.error.code === 'ENOENT') {
    t.diagnostic('bash is unavailable; static daemon assertions still passed');
  } else {
    assert.equal(bash.status, 0, bash.stderr);
  }
});

test('filter filenames receive two tokenizer escapes without drawtext percent expansion', () => {
  const path = String.raw`/tmp/100% dir\x.ass`;
  const escaped = escapeFilterFilename(path);
  assert.equal(escaped, String.raw`/tmp/100% dir\\\\x.ass`);
  assert.equal(escaped.includes('\\%'), false);

  const filter = captionTextfileFilter(path, 1080);
  assert.ok(filter.includes('100% dir'));
  assert.equal(filter.includes('\\%'), false);
});

test('strict approval auditing rejects when its data directory cannot be created', async () => {
  const root = temporaryDir('hardening-audit-strict-');
  const blocker = join(root, 'not-a-directory');
  writeFileSync(blocker, 'file');
  const restoreConfig = configure(`${blocker}${sep}sub${sep}`, false);
  const restoreStrict = setEnv('APPROVALS_AUDIT_STRICT', 'true');

  try {
    await assert.rejects(appendApprovalRecord(approvalRecord));
    assert.equal(existsSync(join(blocker, 'sub', 'approvals.jsonl')), false);
  } finally {
    restoreStrict();
    restoreConfig();
    rmSync(root, { recursive: true, force: true });
  }
});

test('default approval auditing warns but resolves when persistence fails', async () => {
  const root = temporaryDir('hardening-audit-default-');
  const blocker = join(root, 'not-a-directory');
  writeFileSync(blocker, 'file');
  const restoreConfig = configure(`${blocker}${sep}sub${sep}`, false);
  const restoreStrict = setEnv('APPROVALS_AUDIT_STRICT', undefined);
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(' '));

  try {
    await appendApprovalRecord(approvalRecord);
    assert.ok(warnings.some((warning) => warning.includes('failed to persist approval record')));
    assert.equal(existsSync(join(blocker, 'sub', 'approvals.jsonl')), false);
  } finally {
    console.warn = originalWarn;
    restoreStrict();
    restoreConfig();
    rmSync(root, { recursive: true, force: true });
  }
});
