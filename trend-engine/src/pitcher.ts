import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { config } from './config.js';
import { structured } from './llm.js';
import { parseEventPeg } from './pitchVerify.js';
import type { Pitch, PitchStatus, PitchVertical, Topic } from './types.js';

const PITCH_QUALITY_BAR = `THE #1 RULE — THE "WHO CARES" TEST: every pitch must pass a brutal so-what check. A normal person scrolling must instantly feel "wait, that affects ME / something I watch / my money / my week." Corporate mechanics for their own sake FAIL — nobody scrolling cares about a company's balance sheet, a rights deal, or an industry-strategy chess move UNLESS you make the stakes personal and visceral. Bad (rejected): "Netflix bought the NFL's streaming rights", "AMC's box-office bet", "Samsung is baiting Apple". Good: reframe every one around what the VIEWER feels/loses/gains — "The reason your live sports are about to cost more", "Why the movie you're hyped for might get buried", "The phone upgrade you should actually wait for". The stakes line must name the concrete personal payoff (money, time, something they use/watch/buy, a visible change in their world in the next days/weeks), NOT "this is an interesting business story".

Each pitch also needs: a curiosity-gap headline (≤9 words, stops a scroll as silent text AND implies the personal stakes), an unexpected angle (a real insight or twist, not just coverage), and a vertical tag (finance/sports/tech/culture). Prefer topics with a clear human hook over clever-but-cold business angles. eventPeg must be null unless pegged to a named event with an explicit full date; when present use "<event name> on YYYY-MM-DD". Never use "upcoming", "date pending", an unknown date, or a past event as a future peg. Pitches must be DIVERSE (no two same vertical+format) and NEVER generic ('X explained' headlines auto-rejected — regenerate once).`;

const SYSTEM = `You are the pitch editor for a bold short-form media studio. Turn the
highest-opportunity forecast topics into specific, surprising stories that can win
attention before the wave peaks. Stay grounded in the supplied forecasts and owner
taste history. Return 3–5 pitches.

PITCH QUALITY BAR — follow this requirement exactly:
${PITCH_QUALITY_BAR}`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    pitches: {
      type: 'array',
      // NOTE: Anthropic structured-output rejects minItems/maxItems > 1.
      // The 3-5 count is enforced via the prompt + a post-parse slice instead.
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          topicId: { type: 'string' },
          topicTitle: { type: 'string' },
          headline: { type: 'string' },
          stakes: { type: 'string' },
          angle: { type: 'string' },
          eventPeg: { type: ['string', 'null'] },
          vertical: {
            type: 'string',
            enum: ['finance', 'sports', 'tech', 'culture'],
          },
          format: { type: 'string' },
        },
        required: [
          'topicId',
          'topicTitle',
          'headline',
          'stakes',
          'angle',
          'eventPeg',
          'vertical',
          'format',
        ],
      },
    },
  },
  required: ['pitches'],
} as const;

interface PitchDraft {
  topicId: string;
  topicTitle: string;
  headline: string;
  stakes: string;
  angle: string;
  eventPeg: string | null;
  vertical: PitchVertical;
  format: string;
}

interface PitchResponse {
  pitches: PitchDraft[];
}

export interface PitchFeedbackRecord {
  at: string;
  pitchId: string;
  headline: string;
  vertical: PitchVertical;
  decision: PitchStatus;
  feedback: string;
}

const VERTICALS: readonly PitchVertical[] = ['finance', 'sports', 'tech', 'culture'];
const DRY_RUN_FORMATS = ['analysis', 'timeline', 'deep dive', 'counterintuitive take', 'forecast'] as const;
const GENERIC_HEADLINE_PATTERNS = [
  /\bexplained\b/i,
  /what is\b/i,
  /everything you need to know/i,
] as const;

function targetDir(dir?: string): string {
  return dir ?? config.dataDir;
}

function isMissingFile(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
}

async function readJsonl(path: string): Promise<unknown[]> {
  let contents: string;
  try {
    contents = await readFile(path, 'utf8');
  } catch (error) {
    if (isMissingFile(error)) return [];
    throw error;
  }

  const records: unknown[] = [];
  for (const line of contents.split('\n')) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line) as unknown);
    } catch {
      // Keep valid history usable even if a partial or malformed line exists.
    }
  }
  return records;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function loadPitchFeedback(dir?: string): Promise<PitchFeedbackRecord[]> {
  const records = await readJsonl(join(targetDir(dir), 'pitch-feedback.jsonl'));
  return records.filter((record): record is PitchFeedbackRecord => {
    if (!isRecord(record)) return false;
    return (
      typeof record.at === 'string' &&
      typeof record.pitchId === 'string' &&
      typeof record.headline === 'string' &&
      VERTICALS.includes(record.vertical as PitchVertical) &&
      typeof record.decision === 'string' &&
      typeof record.feedback === 'string'
    );
  });
}

export async function appendPitchRecords(pitches: Pitch[], dir?: string): Promise<void> {
  if (pitches.length === 0) return;
  const destination = targetDir(dir);
  await mkdir(destination, { recursive: true });
  const lines = `${pitches.map((pitch) => JSON.stringify(pitch)).join('\n')}\n`;
  await appendFile(join(destination, 'pitches.jsonl'), lines);
}

export async function loadPitches(dir?: string): Promise<Pitch[]> {
  const records = await readJsonl(join(targetDir(dir), 'pitches.jsonl'));
  const byId = new Map<string, Pitch>();
  for (const record of records) {
    if (!isRecord(record) || typeof record.id !== 'string') continue;
    // Reinsert so iteration order also reflects the record's latest occurrence.
    byId.delete(record.id);
    byId.set(record.id, record as unknown as Pitch);
  }
  return [...byId.values()];
}

export async function appendPitchFeedback(
  record: PitchFeedbackRecord,
  dir?: string,
): Promise<void> {
  const destination = targetDir(dir);
  await mkdir(destination, { recursive: true });
  await appendFile(join(destination, 'pitch-feedback.jsonl'), `${JSON.stringify(record)}\n`);
}

function normalizedDay(today: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || Number.isNaN(Date.parse(`${today}T00:00:00.000Z`))) {
    throw new Error(`Pitch generation requires today in YYYY-MM-DD form; received ${JSON.stringify(today)}`);
  }
  return today;
}

function wordCount(value: string): number {
  const trimmed = value.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function pairKey(pitch: PitchDraft): string {
  return `${pitch.vertical}:${pitch.format.trim().toLocaleLowerCase('en-US')}`;
}

function draftViolations(pitches: PitchDraft[]): string[] {
  const violations: string[] = [];
  if (pitches.length < 3 || pitches.length > 5) {
    violations.push(`pitch count is ${pitches.length}; it must be between 3 and 5`);
  }

  const firstPairIndex = new Map<string, number>();
  pitches.forEach((pitch, index) => {
    const label = `pitch ${index + 1}`;
    if (typeof pitch.headline !== 'string' || wordCount(pitch.headline) === 0) {
      violations.push(`${label} has an empty headline`);
    } else {
      const words = wordCount(pitch.headline);
      if (words > 9) {
        violations.push(`${label} headline has ${words} words (maximum 9): ${JSON.stringify(pitch.headline)}`);
      }
      for (const pattern of GENERIC_HEADLINE_PATTERNS) {
        if (pattern.test(pitch.headline)) {
          violations.push(
            `${label} headline matches forbidden generic pattern ${pattern}: ${JSON.stringify(pitch.headline)}`,
          );
          break;
        }
      }
    }

    if (typeof pitch.format !== 'string' || !pitch.format.trim()) {
      violations.push(`${label} has an empty format`);
      return;
    }
    if (pitch.eventPeg !== null && parseEventPeg(pitch.eventPeg) == null) {
      violations.push(
        `${label} eventPeg lacks an explicit full date; use "<event name> on YYYY-MM-DD" or null`,
      );
    }
    const key = pairKey(pitch);
    const first = firstPairIndex.get(key);
    if (first != null) {
      violations.push(
        `${label} duplicates the vertical+format pair from pitch ${first + 1}: ${JSON.stringify(key)}`,
      );
    } else {
      firstPairIndex.set(key, index);
    }
  });
  return violations;
}

function validDrafts(pitches: PitchDraft[]): PitchDraft[] {
  const seenPairs = new Set<string>();
  const valid: PitchDraft[] = [];
  for (const pitch of pitches) {
    if (
      typeof pitch.headline !== 'string' ||
      wordCount(pitch.headline) === 0 ||
      wordCount(pitch.headline) > 9 ||
      GENERIC_HEADLINE_PATTERNS.some((pattern) => pattern.test(pitch.headline)) ||
      typeof pitch.format !== 'string' ||
      !pitch.format.trim() ||
      (pitch.eventPeg !== null && parseEventPeg(pitch.eventPeg) == null)
    ) {
      continue;
    }
    const key = pairKey(pitch);
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);
    valid.push(pitch);
  }
  return valid.slice(0, 5);
}

function slug(value: string): string {
  return (
    value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'pitch'
  );
}

function materializePitches(drafts: PitchDraft[], today: string): Pitch[] {
  const dateId = today.replace(/-/g, '');
  const createdAt = `${today}T00:00:00.000Z`;
  return drafts.map((draft, index) => ({
    id: `pitch-${dateId}-${index + 1}-${slug(draft.headline)}`,
    createdAt,
    topicId: draft.topicId,
    topicTitle: draft.topicTitle,
    headline: draft.headline.trim(),
    stakes: draft.stakes,
    angle: draft.angle,
    eventPeg: draft.eventPeg,
    vertical: draft.vertical,
    format: draft.format.trim(),
    status: 'pending',
  }));
}

function dryRunDrafts(topics: Topic[]): PitchDraft[] {
  const count = Math.min(5, Math.max(3, topics.length));
  return Array.from({ length: count }, (_, index) => {
    const topic = topics[index % topics.length];
    if (!topic) throw new Error('Cannot build DRY_RUN pitches without forecast topics');
    const headline = topic.title.trim().split(/\s+/).filter(Boolean).slice(0, 9).join(' ') || `Forecast Pitch ${index + 1}`;
    return {
      topicId: topic.id,
      topicTitle: topic.title,
      headline,
      stakes: `This forecast has a live opportunity window ${topic.postWindow}.`,
      angle: topic.suggestedAngle,
      eventPeg: topic.catalyst && parseEventPeg(topic.catalyst) ? topic.catalyst : null,
      vertical: VERTICALS[index % VERTICALS.length] ?? 'finance',
      format: DRY_RUN_FORMATS[index % DRY_RUN_FORMATS.length] ?? 'analysis',
    };
  });
}

function renderPrompt(topics: Topic[], feedback: PitchFeedbackRecord[], today: string): string {
  const tasteHistory = feedback.length > 0
    ? feedback.slice(-20).map((record) => JSON.stringify(record)).join('\n')
    : '(no owner feedback recorded yet)';

  return `Today is ${today}. Generate 3–5 bold pitches from these top forecast topics.

TOP FORECAST TOPICS:
${JSON.stringify(topics, null, 2)}

OWNER TASTE HISTORY — feedback on past pitches; bias hard toward what the owner approved and honor recurring feedback themes:
${tasteHistory}`;
}

/** Turn the top trend forecasts into pending, append-only editorial pitches. */
export async function generatePitches(
  scout: { topics: Topic[] },
  today = new Date().toISOString().slice(0, 10),
): Promise<Pitch[]> {
  const day = normalizedDay(today);
  const topics = scout.topics.slice(0, 5);
  if (topics.length === 0) throw new Error('Cannot generate pitches without forecast topics');

  if (config.dryRun) {
    const pitches = materializePitches(dryRunDrafts(topics), day).map((pitch, index) => ({
      ...pitch,
      id: `pitch-dryrun-${index + 1}`,
    }));
    await appendPitchRecords(pitches);
    return pitches;
  }

  const feedback = await loadPitchFeedback();
  const user = renderPrompt(topics, feedback, day);
  let response = await structured<PitchResponse>({
    system: SYSTEM,
    user,
    schema: SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 5000,
  });
  const violations = draftViolations(response.pitches);

  if (violations.length > 0) {
    response = await structured<PitchResponse>({
      system: SYSTEM,
      user:
        `${user}\n\nREGENERATION REQUIRED. The previous set had these exact violations:\n` +
        `${violations.map((violation) => `- ${violation}`).join('\n')}\n\n` +
        'Regenerate the complete 3–5 pitch set and fix every named violation.',
      schema: SCHEMA as unknown as Record<string, unknown>,
      maxTokens: 5000,
    });
  }

  const survivors = validDrafts(response.pitches);
  if (survivors.length === 0) {
    throw new Error('Pitch generation produced zero pitches that passed the quality bar');
  }

  const pitches = materializePitches(survivors, day);
  await appendPitchRecords(pitches);
  return pitches;
}
