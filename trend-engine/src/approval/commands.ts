import { readFileSync, unlinkSync } from 'node:fs';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { config } from '../config.js';
import { loadState, utcDateKey } from '../state.js';
import type { ApprovalDecision } from '../types.js';
import {
  getTelegramFetch,
  isApprovalPollActive,
  isFromApproverChat,
  loadTelegramOffset,
  persistTelegramOffset,
  stashPendingDecision,
} from './telegram.js';

interface TelegramActor {
  id?: unknown;
  username?: unknown;
}

interface TelegramMessage {
  text?: unknown;
  chat?: { id?: unknown };
  from?: TelegramActor;
}

interface TelegramCallbackQuery {
  id?: unknown;
  data?: unknown;
  from?: TelegramActor;
  message?: { chat?: { id?: unknown } };
}

interface TelegramUpdate {
  update_id?: unknown;
  callback_query?: TelegramCallbackQuery;
  message?: TelegramMessage;
}

interface SourceHealth {
  source: string;
  status: string;
  count: number;
  ms: number;
}

const HELP_TEXT = 'commands: /status /health /pause /resume /run /track /report';

function dataPath(dir: string | undefined, name: string): string {
  return join(dir ?? config.dataDir, name);
}

function telegramApiUrl(method: string): string {
  return `https://api.telegram.org/bot${config.approval.telegramBotToken}/${method}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function actorName(actor: TelegramActor | undefined): string {
  if (typeof actor?.username === 'string' && actor.username) return actor.username;
  if (actor?.id != null) return String(actor.id);
  return 'unknown';
}

function isErrno(err: unknown, code: string): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === code;
}

async function sendTelegram(method: string, body: unknown): Promise<void> {
  try {
    const response = await getTelegramFetch()(telegramApiUrl(method), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload: unknown = await response.json();
    if (!response.ok || (isRecord(payload) && payload.ok === false)) {
      throw new Error('Telegram Bot API rejected the request');
    }
  } catch {
    console.warn(`[telegram-commands] ${method} failed (non-fatal)`);
  }
}

async function sendMessage(text: string): Promise<void> {
  await sendTelegram('sendMessage', {
    chat_id: config.approval.telegramChatId,
    text,
  });
}

async function readJson(path: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch {
    return undefined;
  }
}

async function readLastJsonlRecord(path: string): Promise<unknown | undefined> {
  try {
    const lines = (await readFile(path, 'utf8'))
      .split('\n')
      .filter((line) => line.trim().length > 0);
    const last = lines.at(-1);
    return last == null ? undefined : JSON.parse(last) as unknown;
  } catch {
    return undefined;
  }
}

function sourceHealth(record: unknown): SourceHealth[] {
  if (!isRecord(record) || !Array.isArray(record.sources)) return [];
  const sources: SourceHealth[] = [];
  for (const value of record.sources) {
    if (!isRecord(value)) continue;
    if (
      typeof value.source !== 'string' ||
      typeof value.status !== 'string' ||
      typeof value.count !== 'number' ||
      typeof value.ms !== 'number'
    ) {
      continue;
    }
    sources.push({
      source: value.source,
      status: value.status,
      count: value.count,
      ms: value.ms,
    });
  }
  return sources;
}

function summarizeSourceHealth(sources: SourceHealth[]): string {
  if (sources.length === 0) return 'unavailable';
  const statuses = new Map<string, number>();
  for (const source of sources) {
    statuses.set(source.status, (statuses.get(source.status) ?? 0) + 1);
  }
  const summary = [...statuses]
    .map(([status, count]) => `${count} ${status}`)
    .join(', ');
  return `${sources.length} sources: ${summary}`;
}

async function provenanceCounts(dir?: string): Promise<{
  published: number;
  blocked: number;
}> {
  let contents: string;
  try {
    contents = await readFile(dataPath(dir, 'provenance.jsonl'), 'utf8');
  } catch {
    return { published: 0, blocked: 0 };
  }

  let published = 0;
  let blocked = 0;
  for (const line of contents.split('\n')) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line) as { status?: unknown };
      if (record.status === 'published') published++;
      if (record.status === 'skipped' || record.status === 'error') blocked++;
    } catch {
      // A malformed receipt must not hide valid status information.
    }
  }
  return { published, blocked };
}

async function statusText(dir?: string): Promise<string> {
  const state = loadState(dir);
  const [counts, healthRecord, nextRun] = await Promise.all([
    provenanceCounts(dir),
    readLastJsonlRecord(dataPath(dir, 'source-health.jsonl')),
    readJson(dataPath(dir, 'next-run.json')),
  ]);
  const todayCounts = state.dailyPublishCounts?.[utcDateKey()] ?? {};
  const today = Object.entries(todayCounts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([platform, count]) => `${platform}: ${count}`)
    .join(', ');
  const nextRunEta =
    isRecord(nextRun) && typeof nextRun.eta === 'string' ? nextRun.eta : 'unknown';

  return [
    `lastRunAt: ${state.lastRunAt ?? 'never'}`,
    `runCount: ${state.runCount}`,
    `published: ${counts.published}`,
    `blocked: ${counts.blocked}`,
    `today: ${today || 'none'}`,
    `next run: ${nextRunEta}`,
    `source health: ${summarizeSourceHealth(sourceHealth(healthRecord))}`,
    `paused: ${isPaused(dir) ? 'yes' : 'no'}`,
  ].join('\n');
}

async function healthText(dir?: string): Promise<string> {
  const record = await readLastJsonlRecord(dataPath(dir, 'source-health.jsonl'));
  const sources = sourceHealth(record);
  if (sources.length === 0) return 'source health: unavailable';
  return sources
    .map(
      (source) =>
        `${source.source}: ${source.status} (${source.count} signals, ${source.ms}ms)`,
    )
    .join('\n');
}

async function writePauseState(
  paused: boolean,
  by: string,
  dir?: string,
): Promise<void> {
  const targetDir = dir ?? config.dataDir;
  await mkdir(targetDir, { recursive: true });
  await writeFile(
    dataPath(targetDir, 'paused.json'),
    JSON.stringify({ paused, at: new Date().toISOString(), by }),
  );
}

async function writeRunNow(by: string, dir?: string): Promise<void> {
  const targetDir = dir ?? config.dataDir;
  await mkdir(targetDir, { recursive: true });
  await writeFile(
    dataPath(targetDir, 'run-now.json'),
    JSON.stringify({ requestedAt: new Date().toISOString(), by }),
  );
}

async function dispatchCommand(
  text: string,
  actor: TelegramActor | undefined,
  dir?: string,
): Promise<void> {
  const token = text.trim().split(/\s+/, 1)[0] ?? '';
  const command = token.replace(/@[A-Za-z0-9_]+$/, '').toLowerCase();
  const by = actorName(actor);

  // ─── /track manual metric entry [owned by task manual-era-tracking] ───
  if (command === '/track') {
    const [, postUrl, viewsText, ...extra] = text.trim().split(/\s+/);
    if (!postUrl || viewsText === undefined || extra.length > 0) {
      await sendMessage('usage: /track <postUrl> <views>');
      return;
    }
    try {
      const { recordManualOutcome } = await import('../manualPosts.js');
      const views = Number(viewsText);
      await recordManualOutcome(postUrl, views);
      await sendMessage(`recorded: ${views} views for ${postUrl}`);
    } catch (err) {
      await sendMessage(err instanceof Error ? err.message : String(err));
    }
    return;
  }
  // ─── end /track manual metric entry ───

  // ─── /report eval digest [owned by task eval-report] ───
  if (command === '/report') {
    try {
      const [{ buildEvalReport }, { escapeMarkdownV2 }] = await Promise.all([
        import('../report.js'),
        import('./telegram.js'),
      ]);
      const report = await buildEvalReport();
      const eligibleFeatures = report.features.dimensions.flatMap((dimension) =>
        dimension.best
          ? [{ dimension: dimension.dimension, bucket: dimension.best }]
          : [],
      );
      const top = [...eligibleFeatures].sort((left, right) =>
        right.bucket.score - left.bucket.score ||
        left.dimension.localeCompare(right.dimension) ||
        String(left.bucket.value).localeCompare(String(right.bucket.value)),
      )[0];
      const bottom = [...eligibleFeatures].sort((left, right) =>
        left.bucket.score - right.bucket.score ||
        left.dimension.localeCompare(right.dimension) ||
        String(left.bucket.value).localeCompare(String(right.bucket.value)),
      )[0];
      const renderFeature = (
        feature: typeof top,
      ): string => feature
        ? `${feature.dimension}=${String(feature.bucket.value)} P${Math.round(feature.bucket.score)} n=${feature.bucket.n}`
        : 'cold start';
      const lines = [
        `Calibration: ${report.calibration.summary.replace(/\s+/g, ' ')}`,
        `Top feature: ${renderFeature(top)}`,
        `Bottom feature: ${renderFeature(bottom)}`,
        `Hit rate: ${report.forecastHitRate.summary}`,
        `Coverage: ${report.manualPostCoverage.summary}`,
        'Recommendations:',
        ...report.recommendations.map((recommendation, index) => `${index + 1}. ${recommendation}`),
      ];
      await sendTelegram('sendMessage', {
        chat_id: config.approval.telegramChatId,
        text: lines.map((line) => escapeMarkdownV2(line)).join('\n'),
        parse_mode: 'MarkdownV2',
      });
    } catch {
      await sendMessage('report unavailable');
    }
    return;
  }
  // ─── end /report eval digest ───

  if (command === '/status') {
    await sendMessage(await statusText(dir));
    return;
  }
  if (command === '/health') {
    await sendMessage(await healthText(dir));
    return;
  }
  if (command === '/pause') {
    await writePauseState(true, by, dir);
    await sendMessage('paused — daemon will skip runs until /resume');
    return;
  }
  if (command === '/resume') {
    await writePauseState(false, by, dir);
    await sendMessage('resumed');
    return;
  }
  if (command === '/run') {
    if (isPaused(dir)) {
      await sendMessage('daemon is paused — /resume first');
      return;
    }
    await writeRunNow(by, dir);
    await sendMessage('immediate run queued');
    return;
  }
  await sendMessage(HELP_TEXT);
}

export async function pollCommandsOnce(opts: {
  dir?: string;
  timeoutSec?: number;
} = {}): Promise<void> {
  if (
    config.dryRun ||
    !config.approval.telegramBotToken ||
    !config.approval.telegramChatId ||
    isApprovalPollActive()
  ) {
    return;
  }

  let offset = await loadTelegramOffset(opts.dir);
  try {
    let payload: unknown;
    try {
      const response = await getTelegramFetch()(telegramApiUrl('getUpdates'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offset,
          timeout: Math.max(0, Math.min(25, opts.timeoutSec ?? 25)),
        }),
      });
      payload = await response.json() as unknown;
      if (!response.ok || (isRecord(payload) && payload.ok === false)) {
        throw new Error('Telegram Bot API rejected getUpdates');
      }
    } catch {
      console.warn('[telegram-commands] command poll failed (non-fatal)');
      return;
    }

    const updates =
      isRecord(payload) && Array.isArray(payload.result)
        ? payload.result as TelegramUpdate[]
        : [];
    for (const candidate of updates) {
      if (!isRecord(candidate)) continue;
      const update = candidate as unknown as TelegramUpdate;
      if (
        typeof update.update_id === 'number' &&
        Number.isInteger(update.update_id)
      ) {
        offset = Math.max(offset, update.update_id + 1);
      }

      const updateChatId = update.callback_query
        ? update.callback_query.message?.chat?.id
        : update.message?.chat?.id;
      if (!isFromApproverChat(updateChatId)) continue;

      const callback = update.callback_query;
      const callbackData =
        typeof callback?.data === 'string' ? callback.data.match(/^(approve|reject):(.+)$/) : null;
      if (callback && callbackData) {
        const action = callbackData[1]!;
        const draftId = callbackData[2]!;
        const decision: ApprovalDecision = action === 'approve'
          ? { status: 'approved', decidedBy: actorName(callback.from) }
          : {
              status: 'rejected',
              decidedBy: actorName(callback.from),
              note: 'decided while the command poller was active',
            };
        stashPendingDecision(draftId, decision, opts.dir);
        if (callback.id != null) {
          await sendTelegram('answerCallbackQuery', {
            callback_query_id: callback.id,
            text: 'Recorded',
          });
        }
        continue;
      }

      const message = update.message;
      if (typeof message?.text === 'string' && message.text.trimStart().startsWith('/')) {
        await dispatchCommand(message.text, message.from, opts.dir);
      }
    }
  } finally {
    await persistTelegramOffset(offset, opts.dir);
  }
}

export function isPaused(dir?: string): boolean {
  try {
    const parsed: unknown = JSON.parse(readFileSync(dataPath(dir, 'paused.json'), 'utf8'));
    return isRecord(parsed) && parsed.paused === true;
  } catch {
    return false;
  }
}

export function consumeRunNow(dir?: string): boolean {
  try {
    unlinkSync(dataPath(dir, 'run-now.json'));
    return true;
  } catch (err) {
    if (!isErrno(err, 'ENOENT')) {
      console.warn('[telegram-commands] failed to consume /run request');
    }
    return false;
  }
}

function sleep(delayMs: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

function canPollTelegramCommands(): boolean {
  return (
    !config.dryRun &&
    Boolean(config.approval.telegramBotToken) &&
    Boolean(config.approval.telegramChatId) &&
    !isApprovalPollActive()
  );
}

export async function awaitNextRun(
  delayMs: number,
  opts: { dir?: string } = {},
): Promise<void> {
  const boundedDelayMs = Number.isFinite(delayMs) ? Math.max(0, delayMs) : 0;
  const deadline = Date.now() + boundedDelayMs;
  const targetDir = opts.dir ?? config.dataDir;
  const nextRunPath = dataPath(targetDir, 'next-run.json');
  await mkdir(targetDir, { recursive: true });
  await writeFile(nextRunPath, JSON.stringify({ eta: new Date(deadline).toISOString() }));

  try {
    while (Date.now() < deadline) {
      const remainingMs = Math.max(0, deadline - Date.now());
      if (!canPollTelegramCommands()) {
        await sleep(Math.min(30_000, remainingMs));
      } else {
        await pollCommandsOnce({
          dir: opts.dir,
          timeoutSec: Math.min(25, Math.ceil(remainingMs / 1000)),
        });
      }

      if (consumeRunNow(opts.dir)) {
        console.log('[daemon] /run requested — starting immediately');
        return;
      }
      if (isPaused(opts.dir)) return;
    }
  } finally {
    try {
      await unlink(nextRunPath);
    } catch (err) {
      if (!isErrno(err, 'ENOENT')) {
        console.warn('[telegram-commands] failed to clear next-run state');
      }
    }
  }
}

export async function pauseGate(opts: { dir?: string } = {}): Promise<void> {
  while (isPaused(opts.dir)) {
    console.log('[daemon] paused — skipping runs (send /resume)');
    if (!canPollTelegramCommands()) {
      await sleep(60_000);
    } else {
      await pollCommandsOnce({ dir: opts.dir, timeoutSec: 25 });
    }
  }
}
