import { appendFile, mkdir } from 'node:fs/promises';
import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { getTelegramFetch } from './approval/telegram.js';
import { config } from './config.js';
import type { SourceClipCandidate } from './types.js';

export type ClaimKind = 'claim' | 'takedown' | 'strike';
export type ClaimStatus = 'open' | 'disputed' | 'released' | 'resolved';

export interface ClaimRecord {
  ts: string;
  platform: string;
  videoId: string;
  rightsHolder: string;
  kind: ClaimKind;
  status: ClaimStatus;
  notes?: string;
}

export interface BlacklistEntry {
  rightsHolder: string;
  matchTerms: string[];
  addedAt: string;
  reason?: string;
}

interface BlacklistFile {
  entries: BlacklistEntry[];
}

const CLAIM_KINDS = new Set<ClaimKind>(['claim', 'takedown', 'strike']);
const CLAIM_STATUSES = new Set<ClaimStatus>([
  'open',
  'disputed',
  'released',
  'resolved',
]);
const RIGHTS_HOLDER_STOPWORDS = new Set([
  'co',
  'company',
  'corp',
  'corporation',
  'inc',
  'incorporated',
  'limited',
  'llc',
  'ltd',
  'plc',
  'the',
  // Generic industry words: a single token like "media" or "news" would match
  // unrelated providers (wikimedia, NASA descriptions, stock libraries), so
  // they are never auto-added as standalone match terms. The full normalized
  // rights-holder name still covers them in context.
  'agency',
  'brands',
  'broadcasting',
  'channel',
  'communications',
  'digital',
  'distribution',
  'entertainment',
  'film',
  'films',
  'global',
  'group',
  'holdings',
  'international',
  'interactive',
  'media',
  'music',
  'network',
  'networks',
  'news',
  'official',
  'partners',
  'pictures',
  'productions',
  'publishing',
  'records',
  'rights',
  'studio',
  'studios',
  'video',
  'worldwide',
]);

function dataPath(dir: string | undefined, name: string): string {
  return join(dir ?? config.dataDir, name);
}

function isErrno(err: unknown, code: string): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === code;
}

function isClaimKind(value: unknown): value is ClaimKind {
  return typeof value === 'string' && CLAIM_KINDS.has(value as ClaimKind);
}

function isClaimStatus(value: unknown): value is ClaimStatus {
  return typeof value === 'string' && CLAIM_STATUSES.has(value as ClaimStatus);
}

function isClaimRecord(value: unknown): value is ClaimRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Partial<ClaimRecord>;
  return (
    typeof record.ts === 'string' &&
    typeof record.platform === 'string' &&
    typeof record.videoId === 'string' &&
    typeof record.rightsHolder === 'string' &&
    isClaimKind(record.kind) &&
    isClaimStatus(record.status) &&
    (record.notes === undefined || typeof record.notes === 'string')
  );
}

function isBlacklistEntry(value: unknown): value is BlacklistEntry {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = value as Partial<BlacklistEntry>;
  return (
    typeof entry.rightsHolder === 'string' &&
    entry.rightsHolder.trim().length > 0 &&
    Array.isArray(entry.matchTerms) &&
    entry.matchTerms.every((term) => typeof term === 'string') &&
    typeof entry.addedAt === 'string' &&
    (entry.reason === undefined || typeof entry.reason === 'string')
  );
}

function isBlacklistFile(value: unknown): value is BlacklistFile {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = (value as { entries?: unknown }).entries;
  return Array.isArray(entries) && entries.every(isBlacklistEntry);
}

function normalizedTerm(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function defaultMatchTerms(rightsHolder: string): string[] {
  const fullName = normalizedTerm(rightsHolder);
  const tokens = fullName.match(/[\p{L}\p{N}]+/gu) ?? [];
  return uniqueTerms([
    fullName,
    ...tokens.filter(
      (token) => token.length >= 4 && !RIGHTS_HOLDER_STOPWORDS.has(token),
    ),
  ]);
}

function uniqueTerms(terms: string[]): string[] {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const value of terms) {
    const term = normalizedTerm(value);
    if (!term || seen.has(term)) continue;
    seen.add(term);
    unique.push(term);
  }
  return unique;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Match a blacklist term only on word boundaries. Substring matching let a
 * generic auto-generated token ("media") blacklist entire unrelated providers
 * ("wikimedia", commons.wikimedia.org pageUrls).
 */
function termPattern(term: string): RegExp {
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${escapeRegExp(term).replace(/ /g, '\\s+')}(?![\\p{L}\\p{N}])`,
    'iu',
  );
}

function stopTheLineMessage(record: ClaimRecord): string {
  return `STOP-THE-LINE: ${record.kind} from ${record.rightsHolder} — rights holder blacklisted in the source router`;
}

async function sendStopTheLineAlert(record: ClaimRecord, message: string): Promise<void> {
  const { telegramBotToken, telegramChatId } = config.approval;
  if (config.dryRun || !telegramBotToken || !telegramChatId) {
    console.error(`[claims] Telegram alert (console only): ${message}`);
    return;
  }

  const response = await getTelegramFetch()(
    `https://api.telegram.org/bot${telegramBotToken}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramChatId,
        text: `${message}\nPlatform: ${record.platform}\nVideo: ${record.videoId}`,
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`Telegram sendMessage returned HTTP ${response.status}`);
  }
}

export async function recordClaim(record: ClaimRecord, dir?: string): Promise<void> {
  const targetDir = dir ?? config.dataDir;
  await mkdir(targetDir, { recursive: true });
  await appendFile(dataPath(targetDir, 'claims.jsonl'), `${JSON.stringify(record)}\n`);

  if (record.kind !== 'takedown' && record.kind !== 'strike') return;

  addToBlacklist(
    record.rightsHolder,
    undefined,
    `auto: ${record.kind} on ${record.platform} ${record.videoId}`,
    targetDir,
  );
  const message = stopTheLineMessage(record);
  console.error(message);
  try {
    await sendStopTheLineAlert(record, message);
  } catch {
    console.error('[claims] Telegram STOP-THE-LINE alert failed (non-fatal)');
  }
}

export function listOpenClaims(dir?: string): ClaimRecord[] {
  let contents: string;
  try {
    contents = readFileSync(dataPath(dir, 'claims.jsonl'), 'utf8');
  } catch (err) {
    if (!isErrno(err, 'ENOENT')) {
      console.warn('[claims] failed to read claims ledger:', err);
    }
    return [];
  }

  const records: ClaimRecord[] = [];
  for (const [index, line] of contents.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (!isClaimRecord(parsed)) throw new Error('invalid claim record shape');
      if (parsed.status === 'open' || parsed.status === 'disputed') records.push(parsed);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[claims] skipping corrupt claims.jsonl line ${index + 1}: ${message}`,
      );
    }
  }
  return records;
}

export function loadBlacklist(dir?: string): BlacklistEntry[] {
  try {
    const parsed: unknown = JSON.parse(readFileSync(dataPath(dir, 'blacklist.json'), 'utf8'));
    if (!isBlacklistFile(parsed)) throw new Error('invalid blacklist file shape');
    return parsed.entries;
  } catch (err) {
    if (!isErrno(err, 'ENOENT')) {
      console.warn('[claims] failed to load blacklist; using an empty blacklist:', err);
    }
    return [];
  }
}

export function addToBlacklist(
  rightsHolder: string,
  matchTerms?: string[],
  reason?: string,
  dir?: string,
): void {
  const normalizedHolder = rightsHolder.trim();
  if (!normalizedHolder) throw new Error('rightsHolder is required');

  const targetDir = dir ?? config.dataDir;
  mkdirSync(targetDir, { recursive: true });
  const entries = loadBlacklist(targetDir);
  const holderKey = normalizedHolder.toLowerCase();
  const matchingIndexes = entries.flatMap((entry, index) =>
    entry.rightsHolder.trim().toLowerCase() === holderKey ? [index] : [],
  );
  const suppliedTerms =
    matchTerms && matchTerms.length > 0
      ? uniqueTerms(matchTerms)
      : defaultMatchTerms(normalizedHolder);

  if (matchingIndexes.length === 0) {
    entries.push({
      rightsHolder: normalizedHolder,
      matchTerms: suppliedTerms,
      addedAt: new Date().toISOString(),
      ...(reason ? { reason } : {}),
    });
  } else {
    const firstIndex = matchingIndexes[0]!;
    const existing = entries[firstIndex]!;
    const duplicates = matchingIndexes.slice(1).map((index) => entries[index]!);
    entries[firstIndex] = {
      ...existing,
      matchTerms: uniqueTerms([
        ...existing.matchTerms,
        ...duplicates.flatMap((entry) => entry.matchTerms),
        ...suppliedTerms,
      ]),
      reason: existing.reason ?? reason ?? duplicates.find((entry) => entry.reason)?.reason,
    };
    for (const index of matchingIndexes.slice(1).reverse()) entries.splice(index, 1);
  }

  const temporary = dataPath(targetDir, 'blacklist.tmp');
  writeFileSync(temporary, JSON.stringify({ entries }, null, 2));
  renameSync(temporary, dataPath(targetDir, 'blacklist.json'));
}

export function matchesBlacklist(
  candidate: SourceClipCandidate,
  entries: BlacklistEntry[],
): { entry: BlacklistEntry; term: string; field: string } | undefined {
  const fields: Array<[string, string]> = [
    ['title', candidate.title],
    ['description', candidate.description ?? ''],
    ...(candidate.tags ?? []).map((tag): [string, string] => ['tag', tag]),
    ['provider', candidate.provider],
    ['pageUrl', candidate.pageUrl ?? ''],
  ];

  for (const entry of entries) {
    for (const rawTerm of entry.matchTerms) {
      const term = normalizedTerm(rawTerm);
      if (term.length < 3) continue;
      const pattern = termPattern(term);
      for (const [field, value] of fields) {
        if (pattern.test(value)) return { entry, term, field };
      }
    }
  }
  return undefined;
}

const USAGE = `Usage:
  npx tsx src/claims.ts record --platform <p> --video-id <id> --rights-holder <name> --kind claim|takedown|strike [--status open|disputed|released|resolved] [--notes "..."]
  npx tsx src/claims.ts list
  npx tsx src/claims.ts blacklist
  npx tsx src/claims.ts blacklist add <rightsHolder> [term ...]`;

class CliUsageError extends Error {}

function parseRecordOptions(args: string[]): Record<string, string> {
  const allowed = new Set([
    '--platform',
    '--video-id',
    '--rights-holder',
    '--kind',
    '--status',
    '--notes',
  ]);
  const options: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag || !allowed.has(flag)) {
      throw new CliUsageError(`unknown record option: ${flag ?? '(missing)'}`);
    }
    if (!value || value.startsWith('--')) {
      throw new CliUsageError(`${flag} requires a value`);
    }
    if (options[flag] !== undefined) {
      throw new CliUsageError(`${flag} may only be provided once`);
    }
    options[flag] = value;
  }
  return options;
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const [command, ...rest] = args;
  if (command === 'record') {
    const options = parseRecordOptions(rest);
    const platform = options['--platform'];
    const videoId = options['--video-id'];
    const rightsHolder = options['--rights-holder'];
    const kind = options['--kind'];
    const status = options['--status'] ?? 'open';
    if (
      !platform?.trim() ||
      !videoId?.trim() ||
      !rightsHolder?.trim() ||
      !kind?.trim()
    ) {
      throw new CliUsageError(
        'record requires --platform, --video-id, --rights-holder, and --kind',
      );
    }
    if (!isClaimKind(kind)) {
      throw new CliUsageError(`invalid claim kind: ${kind}`);
    }
    if (!isClaimStatus(status)) {
      throw new CliUsageError(`invalid claim status: ${status}`);
    }
    const record: ClaimRecord = {
      ts: new Date().toISOString(),
      platform,
      videoId,
      rightsHolder,
      kind,
      status,
      ...(options['--notes'] ? { notes: options['--notes'] } : {}),
    };
    await recordClaim(record);
    console.log(JSON.stringify(record, null, 2));
    return;
  }

  if (command === 'list' && rest.length === 0) {
    console.log(JSON.stringify(listOpenClaims(), null, 2));
    return;
  }

  if (command === 'blacklist') {
    if (rest.length === 0) {
      console.log(JSON.stringify(loadBlacklist(), null, 2));
      return;
    }
    const [subcommand, rightsHolder, ...terms] = rest;
    if (subcommand !== 'add' || !rightsHolder?.trim()) {
      throw new CliUsageError('blacklist accepts no arguments or: add <rightsHolder> [term ...]');
    }
    addToBlacklist(
      rightsHolder,
      terms.length > 0 ? terms : undefined,
      'manual CLI entry',
    );
    console.log(JSON.stringify(loadBlacklist(), null, 2));
    return;
  }

  throw new CliUsageError(`unknown command: ${command ?? '(missing)'}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[claims] ${message}`);
    if (err instanceof CliUsageError) console.error(`\n${USAGE}`);
    process.exitCode = 1;
  });
}
