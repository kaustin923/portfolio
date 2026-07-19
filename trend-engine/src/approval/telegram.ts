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

import { config } from '../config.js';
import type { ApprovalDecision, ClipDraft, ComplianceResult, Topic } from '../types.js';

const API = (method: string) =>
  `https://api.telegram.org/bot${config.approval.telegramBotToken}/${method}`;

function renderCard(topic: Topic, draft: ClipDraft, compliance: ComplianceResult): string {
  const lic = draft.license;
  return [
    `🎬 *Review needed*`,
    ``,
    `*Topic:* ${topic.title}`,
    `*Angle:* ${topic.suggestedAngle}`,
    `*Opportunity:* ${topic.opportunityScore}/100 · ${topic.momentum} · ${topic.longevity}`,
    ``,
    `*Caption:*`,
    draft.caption,
    ``,
    `*Hashtags:* ${draft.hashtags.map((h) => `#${h}`).join(' ')}`,
    `*Platforms:* ${draft.targetPlatforms.join(', ')}`,
    ``,
    `*License:* ${lic.type}${lic.requiresAttribution ? ` (attribution: ${lic.attributionText})` : ''}`,
    `*Commercial use:* ${lic.commercialUse}`,
    `*Source:* ${lic.sourceUrl}`,
    ``,
    `*Compliance:* ${compliance.reasons.join('; ')}`,
  ].join('\n');
}

async function tg(method: string, body: unknown): Promise<any> {
  const res = await fetch(API(method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
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
): Promise<ApprovalDecision> {
  const card = renderCard(topic, draft, compliance);

  if (config.dryRun) {
    console.log('\n──── Telegram approval card (DRY_RUN, auto-approving) ────');
    console.log(card.replace(/\*/g, ''));
    console.log('─────────────────────────────────────────────────────────\n');
    return { status: 'approved', decidedBy: 'dry-run', note: 'auto-approved in DRY_RUN' };
  }

  if (!config.approval.telegramBotToken || !config.approval.telegramChatId) {
    throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set for live approval');
  }

  const sent = await tg('sendMessage', {
    chat_id: config.approval.telegramChatId,
    text: card,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Approve', callback_data: `approve:${draft.id}` },
          { text: '❌ Reject', callback_data: `reject:${draft.id}` },
        ],
      ],
    },
  });
  const messageId = sent?.result?.message_id;

  return pollForDecision(draft.id, messageId);
}

/** Long-poll getUpdates until a button press (or text override) for this draft. */
async function pollForDecision(draftId: string, messageId?: number): Promise<ApprovalDecision> {
  const deadline = Date.now() + config.approval.timeoutMinutes * 60_000;
  let offset = 0;

  while (Date.now() < deadline) {
    const updates = await tg('getUpdates', { offset, timeout: 30 });
    for (const u of updates?.result ?? []) {
      offset = u.update_id + 1;

      // Button press
      const cb = u.callback_query;
      if (cb?.data?.endsWith(`:${draftId}`)) {
        const action = cb.data.split(':')[0];
        await tg('answerCallbackQuery', { callback_query_id: cb.id, text: `Recorded: ${action}` });
        return {
          status: action === 'approve' ? 'approved' : 'rejected',
          decidedBy: cb.from?.username ?? String(cb.from?.id),
        };
      }

      // Text reply to the review message = caption override + approve
      const msg = u.message;
      if (msg?.reply_to_message?.message_id === messageId && msg.text) {
        return {
          status: 'approved',
          decidedBy: msg.from?.username ?? String(msg.from?.id),
          editedCaption: msg.text,
          note: 'caption overridden via reply',
        };
      }
    }
  }

  return { status: 'timeout', note: `no decision within ${config.approval.timeoutMinutes} min` };
}
