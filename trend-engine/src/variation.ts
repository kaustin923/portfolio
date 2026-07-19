import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';

import { config } from './config.js';
import type { DraftStructure } from './types.js';

export type { DraftStructure } from './types.js';

export type HookType = 'question' | 'stat' | 'imperative' | 'negation' | 'statement';

export interface FingerprintRecord {
  v: 1;
  at: string;
  draftId: string;
  videoIndex: number;
  hookType: DraftStructure['hookType'];
  openingHash: string;
  openingNgrams: string[];
  captionPattern: string;
  brollCount: number;
}

export interface CaptionPreset {
  name: string;
  fontSize: number;
  alignment: 2 | 5 | 8;
  marginV: number;
}

export const CAPTION_PRESETS: readonly CaptionPreset[] = [
  { name: 'bottom-classic', fontSize: 72, alignment: 2, marginV: 440 },
  { name: 'center-bold', fontSize: 80, alignment: 5, marginV: 0 },
  { name: 'upper-third', fontSize: 64, alignment: 8, marginV: 1250 },
];

const FINGERPRINTS_PATH = (): string => `${config.dataDir}fingerprints.jsonl`;

function sourceText(input: { script?: string; caption: string }): string {
  return input.script ?? input.caption;
}

function firstSentence(text: string): string {
  const normalized = text.trim();
  return normalized.match(/^.*?[.!?](?=\s|$)/s)?.[0] ?? normalized;
}

function classifyHook(sentence: string): HookType {
  const opening = sentence.trim().toLowerCase();
  if (/\?/.test(opening) || /^(?:who|what|why|how|did|is|can)\b/.test(opening)) {
    return 'question';
  }
  if (
    /^(?:\d+(?:[.,]\d+)?%?|%\s*\d+)\b/.test(opening) ||
    /\b\d+(?:[.,]\d+)?\s*%/.test(opening)
  ) {
    return 'stat';
  }
  if (/^(?:no|never|nobody|stop\s+believing)\b/.test(opening)) return 'negation';
  if (/^(?:stop|watch|imagine|meet|look)\b/.test(opening)) return 'imperative';
  return 'statement';
}

function openingNgrams(text: string): string[] {
  const words = (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, 12);
  const ngrams: string[] = [];
  for (let index = 0; index + 2 < words.length; index++) {
    ngrams.push(words.slice(index, index + 3).join(' '));
  }
  return ngrams;
}

function captionPattern(caption: string): string {
  const skeleton = caption
    .toLowerCase()
    .replace(/\p{N}+/gu, '#')
    .replace(/\p{L}+/gu, 'w');
  const lineCount = caption.split(/\r\n|\r|\n/).length;
  return `${skeleton}|lines:${lineCount}`;
}

export function deriveStructure(input: {
  script?: string;
  caption: string;
  brollCount: number;
  videoIndex: number;
}): DraftStructure {
  const source = sourceText(input);
  const ngrams = openingNgrams(source);
  return {
    hookType: classifyHook(firstSentence(source)),
    openingHash: createHash('sha256').update(ngrams.join(' ')).digest('hex'),
    openingNgrams: ngrams,
    captionPattern: captionPattern(input.caption),
    brollCount: input.brollCount,
    videoIndex: input.videoIndex,
  } as DraftStructure;
}

function isFingerprintRecord(value: unknown): value is FingerprintRecord {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Partial<FingerprintRecord>;
  return (
    record.v === 1 &&
    typeof record.at === 'string' &&
    typeof record.draftId === 'string' &&
    Number.isInteger(record.videoIndex) &&
    ['question', 'stat', 'imperative', 'negation', 'statement'].includes(
      record.hookType ?? '',
    ) &&
    typeof record.openingHash === 'string' &&
    Array.isArray(record.openingNgrams) &&
    record.openingNgrams.every((ngram) => typeof ngram === 'string') &&
    typeof record.captionPattern === 'string' &&
    Number.isInteger(record.brollCount)
  );
}

async function validFingerprints(): Promise<FingerprintRecord[]> {
  try {
    const contents = await readFile(FINGERPRINTS_PATH(), 'utf8');
    return contents.split(/\r?\n/).flatMap((line) => {
      if (!line.trim()) return [];
      try {
        const parsed: unknown = JSON.parse(line);
        return isFingerprintRecord(parsed) ? [parsed] : [];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

export async function loadRecentFingerprints(limit = 20): Promise<FingerprintRecord[]> {
  if (!Number.isFinite(limit) || limit <= 0) return [];
  return (await validFingerprints()).slice(-Math.floor(limit));
}

export async function appendFingerprint(record: FingerprintRecord): Promise<void> {
  try {
    await mkdir(config.dataDir, { recursive: true });
    await appendFile(FINGERPRINTS_PATH(), `${JSON.stringify(record)}\n`);
  } catch (err) {
    console.warn('[variation] failed to persist structure fingerprint:', err);
  }
}

export async function fingerprintCount(): Promise<number> {
  return (await validFingerprints()).length;
}

type ComparableStructure = Pick<DraftStructure, 'openingNgrams' | 'captionPattern'>;

export function similarity(a: ComparableStructure, b: ComparableStructure): number {
  const aSet = new Set(a.openingNgrams);
  const bSet = new Set(b.openingNgrams);
  const union = new Set([...aSet, ...bSet]);
  const intersectionSize = [...aSet].filter((ngram) => bSet.has(ngram)).length;
  const jaccard = union.size === 0 ? 0 : intersectionSize / union.size;
  const captionBonus = a.captionPattern === b.captionPattern ? 0.2 : 0;
  return Math.min(1, jaccard + captionBonus);
}

function similarityThreshold(): number {
  // Read directly here because config.ts belongs to the tier-router-cards change.
  const threshold = Number(process.env.VARIATION_SIMILARITY_THRESHOLD);
  return Number.isFinite(threshold) ? threshold : 0.6;
}

export function isTooSimilar(
  candidate: ComparableStructure,
  recent: ComparableStructure[],
  threshold = similarityThreshold(),
): boolean {
  return recent.some((record) => similarity(candidate, record) >= threshold);
}

export function captionPresetFor(videoIndex: number): CaptionPreset {
  const index =
    ((Math.trunc(videoIndex) % CAPTION_PRESETS.length) + CAPTION_PRESETS.length) %
    CAPTION_PRESETS.length;
  return CAPTION_PRESETS[index]!;
}

export function applyCaptionPreset(assText: string, preset: CaptionPreset): string {
  return assText.replace(/^Style: Caption,[^\r\n]*$/m, (line) => {
    const fields = line.slice('Style: '.length).split(',');
    if (fields[0] !== 'Caption' || fields.length <= 21) return line;
    fields[2] = String(preset.fontSize);
    fields[18] = String(preset.alignment);
    fields[21] = String(preset.marginV);
    return `Style: ${fields.join(',')}`;
  });
}
