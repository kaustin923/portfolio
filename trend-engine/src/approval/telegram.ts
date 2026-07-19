/**
 * Telegram approval gate — the human-in-the-loop.
 *
 * Before anything is published, the studio sends you a Telegram message with:
 *   - the topic + the angle
 *   - the caption + hashtags
 *   - the license/provenance and any attribution
 *   - the source link and a note that a clip is attached
 * and two buttons: ✅ Approve / ❌ Reject. You can also reply with text to
 * override the caption before approving.
 *
 * Implementation uses the raw Bot API over fetch (no dependency). It long-polls
 * getUpdates for your reply. In DRY_RUN it auto-approves after printing the card
 * so the pipeline is exercisable end-to-end offline.
 *
 * Setup: talk to @BotFather to create a bot + token, then send it any message
 * and read your chat id from getUpdates (or set TELEGRAM_CHAT_ID directly).
 */

import { appendFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';

import { config } from '../config.js';
import type {
  ApprovalDecision,
  ClipDraft,
  ComplianceResult,
  ComplianceTier,
  Topic,
} from '../types.js';

export type TelegramApprovalDecision = ApprovalDecision & {
  conditionsConfirmed?: boolean;
};

const API = (method: string) =>
  `https://api.telegram.org/bot${config.approval.telegramBotToken}/${method}`;

const VIDEO_UPLOAD_LIMIT_BYTES = 50 * 1024 * 1024;
const MEDIA_CAPTION_LIMIT = 1024;
const REJECTION_REASON_WAIT_MS = 120_000;

export type TelegramFetchFn = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

let injectedTelegramFetch: TelegramFetchFn | undefined;
const pendingDecisions = new Map<string, ApprovalDecision>();

/** Every live Telegram request goes through this seam so tests stay offline. */
export function getTelegramFetch(): TelegramFetchFn {
  return injectedTelegramFetch ?? ((input, init) => globalThis.fetch(input, init));
}

export function setTelegramFetch(fn: TelegramFetchFn): void {
  injectedTelegramFetch = fn;
}

export function resetTelegramFetch(): void {
  injectedTelegramFetch = undefined;
}

/** Clear decisions consumed by another draft's active long poll (primarily for tests). */
export function resetPendingDecisions(): void {
  pendingDecisions.clear();
}

/** Escape Telegram's complete MarkdownV2 reserved-character set (and backslash itself). */
export function escapeMarkdownV2(text: string): string {
  return text.replace(/[\\_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

export function renderCard(
  topic: Topic,
  draft: ClipDraft,
  compliance: ComplianceResult,
): string {
  const lic = draft.license;
  const tier = compliance.tier ?? 'green';
  const escapedHashtags = draft.hashtags
    .map((hashtag) => escapeMarkdownV2(`#${hashtag}`))
    .join(' ');
  const lines = [
    `🎬 *Review needed*`,
    ``,
    `*Topic:* ${escapeMarkdownV2(topic.title)}`,
    `*Angle:* ${escapeMarkdownV2(topic.suggestedAngle)}`,
    `*Forecast:* ${escapeMarkdownV2(String(topic.opportunityScore))}/100 · ${escapeMarkdownV2(topic.stage)} · ${escapeMarkdownV2(topic.recommendation)}`,
    `*Timing:* ${escapeMarkdownV2(topic.postWindow)} \\(lead ${escapeMarkdownV2(String(topic.leadTimeDays))}d${topic.catalyst ? ` · ${escapeMarkdownV2(topic.catalyst)}` : ''}\\)`,
    ``,
    `*Caption:*`,
    escapeMarkdownV2(draft.caption),
    ``,
    `*Hashtags:* ${escapedHashtags}`,
    `*Platforms:* ${escapeMarkdownV2(draft.targetPlatforms.join(', '))}`,
    ``,
    `*License:* ${escapeMarkdownV2(lic.type)}${lic.requiresAttribution ? ` \\(attribution: ${escapeMarkdownV2(lic.attributionText ?? '')}\\)` : ''}`,
    `*Commercial use:* ${escapeMarkdownV2(String(lic.commercialUse))}`,
    `*Source:* ${escapeMarkdownV2(lic.sourceUrl)}`,
    ``,
    `*Tier:* ${escapeMarkdownV2(tier)}`,
    `*Compliance:* ${compliance.reasons.map(escapeMarkdownV2).join('; ')}`,
  ];

  if (tier === 'yellow') {
    lines.push(
      ``,
      `*${escapeMarkdownV2('Yellow-tier conditions - ALL must be true:')}*`,
      ...(compliance.tierReasons ?? []).map(
        (reason) => `• ${escapeMarkdownV2(reason)}`,
      ),
      escapeMarkdownV2(
        'Reply YES to this card to confirm every condition. The Approve button alone will NOT publish a yellow draft.',
      ),
    );
  }

  return lines.join('\n');
}

async function tg(method: string, body: unknown): Promise<any> {
  const multipart = body instanceof FormData;
  const res = await getTelegramFetch()(API(method), {
    method: 'POST',
    ...(multipart ? {} : { headers: { 'Content-Type': 'application/json' } }),
    body: multipart ? body : JSON.stringify(body),
  });
  return res.json();
}

export interface ApprovalRecord {
  timestamp: string;
  topicId: string;
  draftId: string;
  decision: ApprovalDecision['status'];
  decidedBy?: string;
  reason?: string;
  editedCaption?: string;
  tier?: string;
  conditions_confirmed?: boolean;
}

/** Append an auditable approval decision, optionally failing closed in strict mode. */
export async function appendApprovalRecord(record: ApprovalRecord): Promise<void> {
  try {
    await mkdir(config.dataDir, { recursive: true });
    await appendFile(`${config.dataDir}approvals.jsonl`, `${JSON.stringify(record)}\n`);
  } catch (err) {
    if (/^(1|true|yes|on)$/i.test(process.env.APPROVALS_AUDIT_STRICT ?? '')) throw err;
    console.warn('[telegram] failed to persist approval record:', err);
  }
}

async function loadTelegramOffset(): Promise<number> {
  try {
    const parsed: unknown = JSON.parse(
      await readFile(`${config.dataDir}telegram-offset.json`, 'utf8'),
    );
    const offset = (parsed as { offset?: unknown } | null)?.offset;
    return typeof offset === 'number' && Number.isInteger(offset) && offset >= 0 ? offset : 0;
  } catch {
    return 0;
  }
}

async function persistTelegramOffset(offset: number): Promise<void> {
  try {
    await mkdir(config.dataDir, { recursive: true });
    await writeFile(`${config.dataDir}telegram-offset.json`, JSON.stringify({ offset }));
  } catch (err) {
    console.warn('[telegram] failed to persist update offset:', err);
  }
}

/**
 * Only the configured approver chat may drive decisions. getUpdates returns
 * traffic from ANY chat that can reach the bot, and message ids are per-chat
 * and low/sequential, so an unauthenticated chat could otherwise collide with
 * a review-card message id and satisfy an approval. Fail closed when the chat
 * id is absent or different.
 */
function isFromApproverChat(chatId: unknown): boolean {
  return chatId != null && String(chatId) === String(config.approval.telegramChatId);
}

function approvalKeyboard(draftId: string): {
  inline_keyboard: { text: string; callback_data: string }[][];
} {
  return {
    inline_keyboard: [
      [
        { text: '✅ Approve', callback_data: `approve:${draftId}` },
        { text: '❌ Reject', callback_data: `reject:${draftId}` },
      ],
    ],
  };
}

async function sendMessageReview(card: string, draftId: string): Promise<number | undefined> {
  const sent = await tg('sendMessage', {
    chat_id: config.approval.telegramChatId,
    text: card,
    parse_mode: 'MarkdownV2',
    reply_markup: approvalKeyboard(draftId),
  });
  return sent?.result?.message_id;
}

async function trySendVideoReview(
  card: string,
  draft: ClipDraft,
): Promise<{ sent: boolean; messageId?: number }> {
  try {
    const file = await stat(draft.outputPath);
    if (file.size > VIDEO_UPLOAD_LIMIT_BYTES) return { sent: false };

    const form = new FormData();
    form.append('chat_id', config.approval.telegramChatId);
    if (card.length > MEDIA_CAPTION_LIMIT) {
      const plainCaption = card
        .replace(/\\([_*\[\]()~`>#+\-=|{}.!\\])/g, '$1')
        .slice(0, MEDIA_CAPTION_LIMIT);
      form.append('caption', plainCaption.endsWith('\\') ? plainCaption.slice(0, -1) : plainCaption);
    } else {
      form.append('caption', card);
      form.append('parse_mode', 'MarkdownV2');
    }
    form.append('reply_markup', JSON.stringify(approvalKeyboard(draft.id)));
    form.append('video', new Blob([await readFile(draft.outputPath)]), basename(draft.outputPath));

    const sent = await tg('sendVideo', form);
    if (sent?.ok === false) return { sent: false };
    return { sent: true, messageId: sent?.result?.message_id };
  } catch {
    return { sent: false };
  }
}

/**
 * Send the review card and wait for a decision.
 *
 * @returns the human's decision, or a `timeout` decision if no reply arrives
 * within `APPROVAL_TIMEOUT_MIN` minutes.
 */
export async function requestApproval(
  topic: Topic,
  draft: ClipDraft,
  compliance: ComplianceResult,
): Promise<TelegramApprovalDecision> {
  const tier = compliance.tier;
  if (tier === 'red') {
    throw new Error('red-tier draft must never reach the approval card');
  }

  const card = renderCard(topic, draft, compliance);

  if (config.dryRun) {
    const yellowNote =
      'auto-approved in DRY_RUN (yellow conditions NOT confirmed - live mode requires a YES reply)';
    const decision: TelegramApprovalDecision = {
      status: 'approved',
      decidedBy: 'dry-run',
      note: tier === 'yellow' ? yellowNote : 'auto-approved in DRY_RUN',
      ...(tier === 'yellow' ? { conditionsConfirmed: false } : {}),
    };
    console.log('\n──── Telegram approval card (DRY_RUN, auto-approving) ────');
    console.log(card.replace(/\*/g, ''));
    if (tier === 'yellow') console.log(yellowNote);
    console.log('─────────────────────────────────────────────────────────\n');
    return decision;
  }

  if (!config.approval.telegramBotToken || !config.approval.telegramChatId) {
    throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set for live approval');
  }

  const videoReview = await trySendVideoReview(card, draft);
  const messageId = videoReview.sent
    ? videoReview.messageId
    : await sendMessageReview(card, draft.id);
  if (messageId == null) {
    throw new Error(
      'Telegram review card failed to send; refusing to poll for a decision without a delivered card.',
    );
  }

  if (videoReview.sent && card.length > MEDIA_CAPTION_LIMIT) {
    await tg('sendMessage', {
      chat_id: config.approval.telegramChatId,
      text: card,
      parse_mode: 'MarkdownV2',
    });
  }

  const decision = await pollForDecision(draft.id, messageId, { tier });
  await appendApprovalRecord({
    timestamp: new Date().toISOString(),
    topicId: topic.id,
    draftId: draft.id,
    decision: decision.status,
    decidedBy: decision.decidedBy,
    reason: decision.note,
    editedCaption: decision.editedCaption,
    tier,
    conditions_confirmed: tier === 'yellow' ? decision.conditionsConfirmed === true : undefined,
  });
  return decision;
}

/** Long-poll getUpdates until a button press (or text override) for this draft. */
export async function pollForDecision(
  draftId: string,
  messageId?: number,
  opts?: { tier?: ComplianceTier },
): Promise<TelegramApprovalDecision> {
  const pendingDecision = pendingDecisions.get(draftId);
  const pendingYellowButtonApproval =
    opts?.tier === 'yellow' && pendingDecision?.status === 'approved';
  if (pendingDecision && !pendingYellowButtonApproval) {
    pendingDecisions.delete(draftId);
    return pendingDecision;
  }
  if (pendingYellowButtonApproval) pendingDecisions.delete(draftId);

  const deadline = Date.now() + config.approval.timeoutMinutes * 60_000;
  let offset = await loadTelegramOffset();
  let pendingRejection:
    | { decidedBy: string; promptMessageId?: number; deadline: number }
    | undefined;
  const yellowPromptMessageIds = new Set<number>();
  let yellowReprompted = false;

  async function sendYellowPrompt(): Promise<void> {
    const prompt = await tg('sendMessage', {
      chat_id: config.approval.telegramChatId,
      text: 'Yellow-tier draft: reply YES to the review card to confirm all conditions are met.',
    });
    if (typeof prompt?.result?.message_id === 'number') {
      yellowPromptMessageIds.add(prompt.result.message_id);
    }
  }

  if (pendingYellowButtonApproval) await sendYellowPrompt();

  while (
    Date.now() < deadline &&
    (pendingRejection == null || Date.now() < pendingRejection.deadline)
  ) {
    const activeDeadline = pendingRejection?.deadline ?? deadline;
    const timeout = Math.max(0, Math.min(30, Math.ceil((activeDeadline - Date.now()) / 1000)));
    const updates = await tg('getUpdates', { offset, timeout });
    let decision: TelegramApprovalDecision | undefined;

    try {
      for (const u of updates?.result ?? []) {
        if (typeof u.update_id === 'number') offset = Math.max(offset, u.update_id + 1);

        // Drop anything that did not originate in the configured approver chat
        // BEFORE any decision processing (buttons, YES confirmations, caption
        // overrides, rejection reasons).
        const updateChatId = u.callback_query
          ? u.callback_query.message?.chat?.id
          : u.message?.chat?.id;
        if (!isFromApproverChat(updateChatId)) continue;

        const cb = u.callback_query;
        if (cb?.data && !cb.data.endsWith(`:${draftId}`)) {
          const separator = cb.data.indexOf(':');
          const action = separator < 0 ? cb.data : cb.data.slice(0, separator);
          const callbackDraftId = separator < 0 ? '' : cb.data.slice(separator + 1);
          const decidedBy = cb.from?.username ?? String(cb.from?.id);

          await tg('answerCallbackQuery', {
            callback_query_id: cb.id,
            text: 'Recorded for its own review',
          });

          if (callbackDraftId && action === 'approve') {
            pendingDecisions.set(callbackDraftId, { status: 'approved', decidedBy });
          } else if (callbackDraftId && action === 'reject') {
            pendingDecisions.set(callbackDraftId, {
              status: 'rejected',
              decidedBy,
              note: 'decided while another review was active',
            });
          }
          continue;
        }

        if (pendingRejection) {
          const reasonMessage = u.message;
          const repliedTo = reasonMessage?.reply_to_message?.message_id;
          if (
            reasonMessage?.text &&
            repliedTo != null &&
            ((messageId != null && repliedTo === messageId) ||
              (pendingRejection.promptMessageId != null &&
                repliedTo === pendingRejection.promptMessageId))
          ) {
            decision = {
              status: 'rejected',
              decidedBy: pendingRejection.decidedBy,
              note: reasonMessage.text,
            };
            break;
          }
          continue;
        }

        // Button press
        if (cb?.data?.endsWith(`:${draftId}`)) {
          const action = cb.data.split(':')[0];
          const decidedBy = cb.from?.username ?? String(cb.from?.id);
          if (action === 'approve' && opts?.tier === 'yellow') {
            await tg('answerCallbackQuery', {
              callback_query_id: cb.id,
              text: 'Reply YES to confirm yellow-tier conditions',
            });
            await sendYellowPrompt();
            continue;
          }

          await tg('answerCallbackQuery', {
            callback_query_id: cb.id,
            text: `Recorded: ${action}`,
          });

          if (action === 'approve') {
            decision = { status: 'approved', decidedBy };
            break;
          }

          const prompt = await tg('sendMessage', {
            chat_id: config.approval.telegramChatId,
            text: 'Reply to this message with a rejection reason (or ignore).',
          });
          pendingRejection = {
            decidedBy,
            promptMessageId: prompt?.result?.message_id,
            deadline: Math.min(deadline, Date.now() + REJECTION_REASON_WAIT_MS),
          };
          continue;
        }

        // Text reply to the review message = caption override + approve (green/legacy only).
        const msg = u.message;
        const repliedTo = msg?.reply_to_message?.message_id;
        const isReplyToReview = messageId != null && repliedTo === messageId;
        const isReplyToYellowPrompt =
          repliedTo != null && yellowPromptMessageIds.has(repliedTo);
        if (
          opts?.tier === 'yellow' &&
          msg?.text &&
          (isReplyToReview || isReplyToYellowPrompt)
        ) {
          if (/^yes$/i.test(msg.text.trim())) {
            decision = {
              status: 'approved',
              decidedBy: msg.from?.username ?? String(msg.from?.id),
              note: 'yellow-tier conditions confirmed via YES reply',
              conditionsConfirmed: true,
            };
            break;
          }
          if (!yellowReprompted) {
            yellowReprompted = true;
            await sendYellowPrompt();
          }
          continue;
        }
        if (isReplyToReview && msg?.text) {
          decision = {
            status: 'approved',
            decidedBy: msg.from?.username ?? String(msg.from?.id),
            editedCaption: msg.text,
            note: 'caption overridden via reply',
          };
          break;
        }
      }
    } finally {
      await persistTelegramOffset(offset);
    }

    if (decision) return decision;
  }

  if (pendingRejection) {
    return { status: 'rejected', decidedBy: pendingRejection.decidedBy };
  }
  return { status: 'timeout', note: `no decision within ${config.approval.timeoutMinutes} min` };
}
