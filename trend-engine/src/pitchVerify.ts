import { config } from './config.js';
import { research } from './llm.js';
import type { Pitch } from './types.js';

const DAY_MS = 86_400_000;
const UNKNOWN_DATE = /\b(?:upcoming|date\s+(?:pending|unknown|unconfirmed|not\s+confirmed)|pending\s+date|tbd|to\s+be\s+(?:dated|determined|announced)|unscheduled)\b/i;
const MONTH_NUMBER: Readonly<Record<string, number>> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};
const MONTH_NAME = Object.keys(MONTH_NUMBER).join('|');
const MONTH_FIRST = new RegExp(`\\b(${MONTH_NAME})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,)?\\s+(\\d{4})\\b`, 'i');
const DAY_FIRST = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_NAME})\\.?(?:,)?\\s+(\\d{4})\\b`, 'i');

export interface ParsedEventPeg {
  event: string;
  date: string;
}

export interface PitchVerificationResult {
  /** Pitches allowed to proceed to the human gate. */
  allowed: Pitch[];
  /** Pitches hard-blocked before the human gate. */
  blocked: Pitch[];
  /** Append-only audit records for every verification attempted or skipped. */
  records: Pitch[];
}

function normalizedDate(year: number, month: number, day: number): string | null {
  const parsed = new Date(Date.UTC(year, month, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function dateMatch(value: string): { date: string; text: string } | null {
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(value);
  if (iso) {
    const date = normalizedDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    if (date) return { date, text: iso[0] };
  }

  const monthFirst = MONTH_FIRST.exec(value);
  if (monthFirst) {
    const month = MONTH_NUMBER[monthFirst[1]!.toLocaleLowerCase('en-US')];
    const date = month == null
      ? null
      : normalizedDate(Number(monthFirst[3]), month, Number(monthFirst[2]));
    if (date) return { date, text: monthFirst[0] };
  }

  const dayFirst = DAY_FIRST.exec(value);
  if (dayFirst) {
    const month = MONTH_NUMBER[dayFirst[2]!.toLocaleLowerCase('en-US')];
    const date = month == null
      ? null
      : normalizedDate(Number(dayFirst[3]), month, Number(dayFirst[1]));
    if (date) return { date, text: dayFirst[0] };
  }

  return null;
}

function eventName(value: string, matchedDate: string): string {
  return value
    .replace(matchedDate, ' ')
    .replace(/\b\d+\s+days?\s+(?:away|ago)\b/gi, ' ')
    .replace(/\b(?:scheduled\s+for|set\s+for|on)\s*(?=[\s,;:()\[\]—–-]*$)/i, ' ')
    .replace(/^\s*(?:event|date)\s*:\s*/i, '')
    .replace(/[\s,;:()\[\]—–-]+$/g, '')
    .replace(/^[\s,;:()\[\]—–-]+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Parse only explicit full calendar dates; relative terms such as "upcoming" never qualify. */
export function parseEventPeg(value: string | null | undefined): ParsedEventPeg | null {
  if (!value?.trim()) return null;
  const matched = dateMatch(value);
  if (!matched) return null;
  return { event: eventName(value, matched.text), date: matched.date };
}

/** Unknown-date markers are verified only so they leave a blocked audit record. */
export function requiresEventVerification(value: string | null | undefined): boolean {
  return Boolean(parseEventPeg(value) || (value && UNKNOWN_DATE.test(value)));
}

function utcDay(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (year == null || month == null || day == null) return null;
  if (normalizedDate(year, month - 1, day) !== value) return null;
  return Date.UTC(year, month - 1, day);
}

function compactAnswer(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 500);
}

function answerDecision(answer: string): { confirmed: boolean; reason: string } {
  const compact = compactAnswer(answer);
  if (!compact) return { confirmed: false, reason: 'verification returned no answer' };

  const lower = compact.toLocaleLowerCase('en-US')
    .replace(/\b(?:(?:has|had|was|is|did)\s+not|never|hasn't|hadn't|wasn't|didn't)\s+(?:already\s+)?(?:happened|occurred|taken\s+place|been\s+held|concluded|ended)\b/g, '')
    .replace(/\bnot\s+unconfirmed\b/g, '');

  if (/\bverdict\s*:\s*(?:already[_ -]?occurred|unconfirmed)\b/i.test(compact)) {
    return { confirmed: false, reason: compact };
  }

  const adverse = [
    /\balready\s+(?:happened|occurred|took\s+place|was\s+held|concluded|ended)\b/,
    /\b(?:has|had)\s+(?:already\s+)?(?:happened|occurred|taken\s+place|been\s+held|concluded|ended)\b/,
    /\b(?:happened|occurred|took\s+place|was\s+held|concluded|ended)(?:\s+on|\s+in|\s+\w+day|\s+\w+\s+\d)/,
    /\b(?:event|wedding|ceremony|launch|conference|game|match|show)\s+(?:is|was)\s+(?:over|finished|complete)\b/,
    /\b(?:was|were|got)\s+married\b/,
    /\bdate\s+(?:is|remains|was)?\s*(?:pending|unknown|unconfirmed|not\s+confirmed)\b/,
    /\b(?:no|without)\s+(?:an\s+)?(?:official|confirmed)?\s*date\b/,
    /\b(?:cannot|can't|could\s+not|couldn't|unable\s+to|did\s+not|didn't)\s+(?:independently\s+)?(?:confirm|verify)\b/,
    /\bno\s+(?:reliable|official|credible|public)?\s*(?:source|evidence|confirmation)\s+(?:confirms?|supports?|for)\b/,
    /\b(?:unverified|unconfirmed|unsubstantiated)\b/,
    /\b(?:conflicting|inconsistent)\s+(?:dates|reports|sources)\b/,
    /\b(?:postponed|cancelled|canceled|rumou?red|tentative(?:ly)?)\b/,
  ];
  if (adverse.some((pattern) => pattern.test(lower))) {
    return { confirmed: false, reason: compact };
  }

  const affirmative =
    /\bverdict\s*:\s*confirmed\b/i.test(compact) ||
    /\byes\b[\s\S]{0,180}\bscheduled\b/i.test(compact) ||
    /\b(?:is|remains)\s+(?:officially\s+)?scheduled\s+(?:for|on)\b/i.test(compact) ||
    /\b(?:official|confirmed)\s+date\b/i.test(compact);
  return affirmative
    ? { confirmed: true, reason: compact }
    : { confirmed: false, reason: `verification did not affirm the date: ${compact}` };
}

function auditPitch(
  pitch: Pitch,
  status: 'confirmed' | 'skipped' | 'blocked',
  checkedAt: string,
  reason: string,
  eventDate?: string,
): Pitch {
  return {
    ...pitch,
    ...(status === 'blocked'
      ? { status: 'blocked-verification' as Pitch['status'], decidedAt: checkedAt }
      : {}),
    verificationStatus: status,
    verificationCheckedAt: checkedAt,
    verificationReason: reason,
    ...(eventDate ? { verifiedEventDate: eventDate } : {}),
  } as Pitch;
}

/**
 * Research each explicitly dated (or explicitly unknown-date) event peg exactly
 * once. Anything short of a clear confirmation is blocked before Telegram.
 */
export async function verifyEventPitches(
  pitches: Pitch[],
  today: string,
): Promise<PitchVerificationResult> {
  const todayMillis = utcDay(today);
  if (todayMillis == null) {
    throw new Error(`Pitch verification requires today in YYYY-MM-DD form; received ${JSON.stringify(today)}`);
  }

  const checked = await Promise.all(pitches.map(async (pitch) => {
    if (!requiresEventVerification(pitch.eventPeg)) {
      return { disposition: 'allowed' as const, pitch, record: null };
    }

    const parsed = parseEventPeg(pitch.eventPeg);
    const checkedAt = `${today}T00:00:00.000Z`;
    if (config.dryRun) {
      const skipped = auditPitch(
        pitch,
        'skipped',
        checkedAt,
        'DRY_RUN: event-date research verification skipped (zero network)',
        parsed?.date,
      );
      console.log(`[pitch-verify] DRY_RUN skipped ${pitch.id}`);
      return { disposition: 'allowed' as const, pitch: skipped, record: skipped };
    }

    const namedEvent = parsed?.event || pitch.topicTitle || pitch.headline;
    const namedDate = parsed?.date ?? 'an unconfirmed date';
    let answer = '';
    let researchFailure: string | null = null;
    try {
      answer = await research(
        `Verify: is ${namedEvent} scheduled for ${namedDate}? Has it already happened as of ${today}? ` +
          `Start with exactly one verdict line: VERDICT: CONFIRMED, VERDICT: ALREADY_OCCURRED, or ` +
          `VERDICT: UNCONFIRMED. Use reliable current sources. If the date is unofficial, pending, ` +
          `ambiguous, or sources conflict, choose VERDICT: UNCONFIRMED.`,
      );
    } catch (error) {
      researchFailure = `verification research failed: ${error instanceof Error ? error.message : String(error)}`;
    }

    let reason = researchFailure;
    if (!reason && !parsed) reason = 'event peg has no explicit confirmed calendar date';
    const eventMillis = parsed ? utcDay(parsed.date) : null;
    if (!reason && (eventMillis == null || eventMillis <= todayMillis)) {
      reason = `event date ${parsed?.date ?? 'unknown'} is not after ${today}`;
    }
    if (!reason) {
      const decision = answerDecision(answer);
      if (!decision.confirmed) reason = decision.reason;
    }

    if (reason) {
      const blocked = auditPitch(pitch, 'blocked', checkedAt, reason, parsed?.date);
      console.warn(`[pitch-verify] blocked ${pitch.id}: ${reason}`);
      return { disposition: 'blocked' as const, pitch: blocked, record: blocked };
    }

    const confirmed = auditPitch(
      pitch,
      'confirmed',
      checkedAt,
      compactAnswer(answer),
      parsed?.date,
    );
    return { disposition: 'allowed' as const, pitch: confirmed, record: confirmed };
  }));

  return {
    allowed: checked.filter((entry) => entry.disposition === 'allowed').map((entry) => entry.pitch),
    blocked: checked.filter((entry) => entry.disposition === 'blocked').map((entry) => entry.pitch),
    records: checked.flatMap((entry) => entry.record ? [entry.record] : []),
  };
}

export function renderExplicitEventPeg(
  value: string | null | undefined,
  today: string,
): string | null {
  const parsed = parseEventPeg(value);
  const todayMillis = utcDay(today);
  const eventMillis = parsed ? utcDay(parsed.date) : null;
  if (!parsed || todayMillis == null || eventMillis == null) return null;

  const days = Math.round((eventMillis - todayMillis) / DAY_MS);
  const prettyDate = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(eventMillis));
  const relative = days > 0
    ? `${days} day${days === 1 ? '' : 's'} away`
    : days < 0
      ? `${-days} day${days === -1 ? '' : 's'} ago`
      : 'today';
  const label = `(event: ${prettyDate} — ${relative})`;
  return parsed.event ? `${parsed.event} ${label}` : label;
}
