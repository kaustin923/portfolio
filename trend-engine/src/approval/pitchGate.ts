import { config } from '../config.js';
import {
  appendPitchFeedback,
  appendPitchRecords,
} from '../pitcher.js';
import type { Pitch } from '../types.js';
import {
  escapeMarkdownV2,
  getTelegramFetch,
  isApprovalPollActive,
  isFromApproverChat,
  loadTelegramOffset,
  markExternalPollActive,
  persistTelegramOffset,
  stashPendingDecision,
} from './telegram.js';

export interface ParsedPitchReply {
  index: number;
  decision: 'approved' | 'rejected';
  feedback?: string;
}

interface TelegramActor {
  id?: string | number;
  username?: string;
}

interface TelegramMessage {
  message_id?: number;
  text?: string;
  chat?: { id?: string | number };
  from?: TelegramActor;
}

interface TelegramCallbackQuery {
  id?: string;
  data?: string;
  from?: TelegramActor;
  message?: { chat?: { id?: string | number } };
}

interface TelegramUpdate {
  update_id?: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

const DEFAULT_PITCH_TIMEOUT_MIN = 240;
const POSITIVE_TOKEN = /^(?:\s*[-–—:]?\s*)(yes|yep|yeah|approve|love|go|ship|do\s+it|y)(?![\p{L}\p{N}_])/iu;
const NEGATIVE_TOKEN = /(?<![\p{L}\p{N}_])(nope|nah|pass|skip|reject|kill|drop|no|n)(?![\p{L}\p{N}_])/iu;
const PITCH_NUMBER = /(?<![\p{L}\p{N}_])#?(\d+)(?:[.)])?(?![\p{L}\p{N}_])/gu;

function pitchTimeoutMinutes(): number {
  const raw = process.env.PITCH_TIMEOUT_MIN;
  if (raw == null || raw.trim() === '') return DEFAULT_PITCH_TIMEOUT_MIN;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : DEFAULT_PITCH_TIMEOUT_MIN;
}

function telegramApiUrl(method: string): string {
  return `https://api.telegram.org/bot${config.approval.telegramBotToken}/${method}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function telegramPost(method: string, body: unknown): Promise<Record<string, unknown>> {
  const response = await getTelegramFetch()(telegramApiUrl(method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json();
  if (!response.ok || !isRecord(payload) || payload.ok === false) {
    throw new Error(`Telegram Bot API rejected ${method}`);
  }
  return payload;
}

function trailingFeedback(segment: string, tokenEnd: number): string | undefined {
  const feedback = segment.slice(tokenEnd).trim();
  return feedback || undefined;
}

/** Parse a natural-language pitch decision without reading config or performing I/O. */
export function parsePitchReplies(
  text: string,
  pitchCount: number,
): ParsedPitchReply[] | null {
  if (!Number.isInteger(pitchCount) || pitchCount <= 0) return null;

  const explicit = new Map<number, ParsedPitchReply>();
  let globalDecision: ParsedPitchReply['decision'] | undefined;

  for (const rawSegment of text.split(/[\n,;]+/)) {
    const segment = rawSegment.trim();
    if (!segment) continue;

    if (/(?<![\p{L}\p{N}_])all\s+yes(?![\p{L}\p{N}_])/iu.test(segment)) {
      globalDecision = 'approved';
    }
    if (/(?<![\p{L}\p{N}_])(?:all\s+no|none)(?![\p{L}\p{N}_])/iu.test(segment)) {
      globalDecision = 'rejected';
    }

    const numbers = [...segment.matchAll(PITCH_NUMBER)]
      .map((match) => ({
        index: Number(match[1]) - 1,
        start: match.index,
        end: match.index + match[0].length,
      }))
      .filter(({ index }) => index >= 0 && index < pitchCount);
    if (numbers.length === 0) continue;

    // A positive token immediately after a number approves that pitch even when
    // its feedback contains a negative word ("1 yes but skip the intro"). A
    // negative word in the segment rejects the remaining mentioned pitches,
    // covering natural phrasing such as "nah on 2".
    const negative = NEGATIVE_TOKEN.exec(segment);
    for (const [position, number] of numbers.entries()) {
      const nextStart = numbers[position + 1]?.start ?? segment.length;
      const positive = POSITIVE_TOKEN.exec(segment.slice(number.end, nextStart));
      if (positive) {
        const feedback = trailingFeedback(
          segment.slice(0, nextStart),
          number.end + positive[0].length,
        );
        explicit.set(number.index, {
          index: number.index,
          decision: 'approved',
          ...(feedback ? { feedback } : {}),
        });
        continue;
      }
      if (!negative) continue;
      const feedback = negative.index >= number.end
        ? trailingFeedback(segment.slice(0, nextStart), negative.index + negative[0].length)
        : undefined;
      explicit.set(number.index, {
        index: number.index,
        decision: 'rejected',
        ...(feedback ? { feedback } : {}),
      });
    }
  }

  if (explicit.size === 0 && globalDecision == null) return null;

  const parsed: ParsedPitchReply[] = [];
  for (let index = 0; index < pitchCount; index++) {
    const decision = explicit.get(index);
    if (decision) parsed.push(decision);
    else if (globalDecision) parsed.push({ index, decision: globalDecision });
  }
  return parsed.length > 0 ? parsed : null;
}

function renderPitchBatch(pitches: Pitch[]): string {
  const timeoutMinutes = pitchTimeoutMinutes();
  const lines = ['🗳 *Pitch review — reply naturally*', ''];

  pitches.forEach((pitch, index) => {
    lines.push(
      `*${index + 1}\\.* ${escapeMarkdownV2(pitch.headline)}`,
      `stakes: ${escapeMarkdownV2(pitch.stakes)}`,
      `angle: ${escapeMarkdownV2(pitch.angle)}`,
    );
    if (pitch.eventPeg) lines.push(`peg: ${escapeMarkdownV2(pitch.eventPeg)}`);
    lines.push(
      `\\[${escapeMarkdownV2(pitch.vertical)} · ${escapeMarkdownV2(pitch.format)}\\]`,
      '',
    );
  });

  lines.push(
    `Reply like: 1 yes, 2 no, 3 yes but make it about the money\\. 'all yes' / 'all no' work\\. Unanswered pitches expire in ${escapeMarkdownV2(String(timeoutMinutes))} min\\.`,
  );
  return lines.join('\n');
}

/** Send exactly one MarkdownV2 message containing the whole pitch batch. */
export async function sendPitchBatch(pitches: Pitch[]): Promise<number> {
  const sent = await telegramPost('sendMessage', {
    chat_id: config.approval.telegramChatId,
    text: renderPitchBatch(pitches),
    parse_mode: 'MarkdownV2',
  });
  const result = isRecord(sent.result) ? sent.result : undefined;
  const messageId = result?.message_id;
  if (typeof messageId !== 'number') {
    throw new Error(
      'Telegram pitch review card failed to send; refusing to poll for decisions without a delivered card.',
    );
  }
  return messageId;
}

function actorName(from?: TelegramActor): string {
  return from?.username ?? String(from?.id);
}

async function persistParsedDecisions(
  pitches: Pitch[],
  decisions: ParsedPitchReply[],
  from: TelegramActor | undefined,
  dir: string | undefined,
): Promise<void> {
  const decidedAt = new Date().toISOString();
  const decidedBy = actorName(from);
  const records: Pitch[] = [];

  for (const decision of decisions) {
    const pitch = pitches[decision.index];
    if (!pitch) continue;
    const { feedback: _previousFeedback, ...pitchWithoutFeedback } = pitch;
    const updated = {
      ...pitchWithoutFeedback,
      status: decision.decision,
      ...(decision.feedback ? { feedback: decision.feedback } : {}),
      decidedBy,
      decidedAt,
    } as Pitch;
    pitches[decision.index] = updated;
    records.push(updated);

    if (decision.feedback) {
      await appendPitchFeedback({
        at: decidedAt,
        pitchId: updated.id,
        headline: updated.headline,
        vertical: updated.vertical,
        decision: decision.decision,
        feedback: decision.feedback,
      }, dir);
    }
  }

  if (records.length > 0) await appendPitchRecords(records, dir);
}

async function stashDraftCallback(
  callback: TelegramCallbackQuery,
  dir: string | undefined,
): Promise<boolean> {
  if (typeof callback.data !== 'string') return false;
  const match = callback.data.match(/^(approve|reject):(.+)$/);
  if (!match) return false;

  const action = match[1]!;
  const draftId = match[2]!;
  const decidedBy = actorName(callback.from);
  stashPendingDecision(
    draftId,
    action === 'approve'
      ? { status: 'approved', decidedBy }
      : {
          status: 'rejected',
          decidedBy,
          note: 'decided while pitch review was active',
        },
    dir,
  );
  if (callback.id != null) {
    await telegramPost('answerCallbackQuery', {
      callback_query_id: callback.id,
      text: 'Recorded for its own review',
    });
  }
  return true;
}

async function expirePendingPitches(
  pitches: Pitch[],
  decided: Set<number>,
  dir: string | undefined,
): Promise<void> {
  const decidedAt = new Date().toISOString();
  const expired: Pitch[] = [];
  for (let index = 0; index < pitches.length; index++) {
    if (decided.has(index)) continue;
    const pitch = pitches[index];
    if (!pitch) continue;
    const updated = { ...pitch, status: 'expired', decidedAt } as Pitch;
    pitches[index] = updated;
    expired.push(updated);
  }
  if (expired.length > 0) await appendPitchRecords(expired, dir);
}

/** Send, collect, and append-only persist the Stage-1 human pitch decisions. */
export async function runPitchGate(
  pitches: Pitch[],
  opts: { dir?: string } = {},
): Promise<Pitch[]> {
  if (isApprovalPollActive()) {
    throw new Error('Cannot start pitch review while another Telegram approval poll is active');
  }

  const updatedPitches = pitches.map((pitch) => ({ ...pitch }));
  const card = renderPitchBatch(updatedPitches);

  if (config.dryRun) {
    const decidedAt = new Date().toISOString();
    const approved = updatedPitches.map((pitch) => ({
      ...pitch,
      status: 'approved',
      decidedBy: 'dry-run',
      decidedAt,
    }) as Pitch);
    console.log('\n──── Telegram pitch card (DRY_RUN, auto-approving) ────');
    console.log(card.replace(/\*/g, ''));
    console.log('──────────────────────────────────────────────────────\n');
    if (approved.length > 0) await appendPitchRecords(approved, opts.dir);
    return approved;
  }

  if (!config.approval.telegramBotToken || !config.approval.telegramChatId) {
    throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set for live approval');
  }

  if (updatedPitches.length === 0) return updatedPitches;
  const cardMessageId = await sendPitchBatch(updatedPitches);

  markExternalPollActive(true);
  try {
    const deadline = Date.now() + pitchTimeoutMinutes() * 60_000;
    const decided = new Set<number>();
    let clarified = false;
    let offset = await loadTelegramOffset(opts.dir);

    while (decided.size < updatedPitches.length && Date.now() < deadline) {
      const timeout = Math.max(0, Math.min(30, Math.ceil((deadline - Date.now()) / 1000)));
      const payload = await telegramPost('getUpdates', { offset, timeout });
      const updates = Array.isArray(payload.result)
        ? payload.result as TelegramUpdate[]
        : [];

      try {
        for (const update of updates) {
          if (typeof update.update_id === 'number' && Number.isInteger(update.update_id)) {
            offset = Math.max(offset, update.update_id + 1);
          }

          const updateChatId = update.callback_query
            ? update.callback_query.message?.chat?.id
            : update.message?.chat?.id;
          if (!isFromApproverChat(updateChatId)) continue;

          if (update.callback_query) {
            await stashDraftCallback(update.callback_query, opts.dir);
            continue;
          }

          const message = update.message;
          if (typeof message?.text !== 'string' || message.text.trimStart().startsWith('/')) {
            continue;
          }

          // Telegram message ids increase per chat, so anything at or below the
          // batch card was typed before the owner could have seen these pitches.
          if (typeof message.message_id !== 'number' || message.message_id <= cardMessageId) {
            continue;
          }

          const parsed = parsePitchReplies(message.text, updatedPitches.length);
          if (parsed == null) {
            if (!clarified) {
              clarified = true;
              await telegramPost('sendMessage', {
                chat_id: config.approval.telegramChatId,
                text: "Couldn't parse that — reply like '1 yes, 2 no, 3 yes but shorter'",
              });
            }
            continue;
          }

          await persistParsedDecisions(updatedPitches, parsed, message.from, opts.dir);
          for (const decision of parsed) decided.add(decision.index);
        }
      } finally {
        await persistTelegramOffset(offset, opts.dir);
      }
    }

    if (decided.size < updatedPitches.length) {
      await expirePendingPitches(updatedPitches, decided, opts.dir);
    }
    return updatedPitches;
  } finally {
    markExternalPollActive(false);
  }
}
