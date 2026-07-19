import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

import { applySourcingFilters } from '../src/agents/sourcing.js';
import {
  resetTelegramFetch,
  setTelegramFetch,
} from '../src/approval/telegram.js';
import {
  addToBlacklist,
  listOpenClaims,
  loadBlacklist,
  matchesBlacklist,
  recordClaim,
  type BlacklistEntry,
  type ClaimRecord,
} from '../src/claims.js';
import { config } from '../src/config.js';
import type { SourceClipCandidate } from '../src/types.js';

type MutableConfig = {
  dryRun: boolean;
  approval: {
    telegramBotToken: string;
    telegramChatId: string;
  };
};

const mutableConfig = config as unknown as MutableConfig;
const originalConfig = {
  dryRun: mutableConfig.dryRun,
  telegramBotToken: mutableConfig.approval.telegramBotToken,
  telegramChatId: mutableConfig.approval.telegramChatId,
};
const temporaryDirs: string[] = [];

async function temporaryDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'claims-'));
  temporaryDirs.push(dir);
  return dir;
}

function claim(overrides: Partial<ClaimRecord> = {}): ClaimRecord {
  return {
    ts: '2026-07-19T12:00:00.000Z',
    platform: 'youtube',
    videoId: 'video-123',
    rightsHolder: 'Acme Media Inc',
    kind: 'claim',
    status: 'open',
    ...overrides,
  };
}

function candidate(
  id: string,
  overrides: Partial<SourceClipCandidate> = {},
): SourceClipCandidate {
  return {
    id,
    provider: 'clean-stock',
    title: 'Clean landscape footage',
    url: `https://media.example.test/${id}.mp4`,
    durationSec: 15,
    pageUrl: `https://example.test/assets/${id}`,
    license: {
      type: 'stock',
      requiresAttribution: false,
      commercialUse: true,
      sourceUrl: 'https://example.test/license',
    },
    ...overrides,
  };
}

function blacklistEntry(matchTerms: string[]): BlacklistEntry {
  return {
    rightsHolder: 'Acme Rights Group',
    matchTerms,
    addedAt: '2026-07-19T12:00:00.000Z',
  };
}

beforeEach(() => {
  mutableConfig.dryRun = true;
  setTelegramFetch(async () => {
    throw new Error('Telegram fetch must not run in DRY_RUN');
  });
});

afterEach(async () => {
  resetTelegramFetch();
  mutableConfig.dryRun = originalConfig.dryRun;
  mutableConfig.approval.telegramBotToken = originalConfig.telegramBotToken;
  mutableConfig.approval.telegramChatId = originalConfig.telegramChatId;
  await Promise.all(
    temporaryDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

test('recordClaim appends valid JSONL and a claim does not auto-blacklist', async () => {
  const dir = await temporaryDir();
  const record = claim({ notes: 'Content ID match under review' });

  await recordClaim(record, dir);

  const lines = (await readFile(join(dir, 'claims.jsonl'), 'utf8'))
    .trim()
    .split('\n');
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]!) as ClaimRecord, record);
  assert.deepEqual(loadBlacklist(dir), []);
});

test('takedown and strike records automatically blacklist rights holders', async () => {
  const dir = await temporaryDir();
  const errors: string[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => errors.push(args.map(String).join(' '));

  try {
    await recordClaim(
      claim({
        videoId: 'take-1',
        rightsHolder: 'Acme Media Inc',
        kind: 'takedown',
      }),
      dir,
    );
    await recordClaim(
      claim({
        videoId: 'strike-1',
        rightsHolder: 'The Atlas Co',
        kind: 'strike',
      }),
      dir,
    );
  } finally {
    console.error = originalError;
  }

  const entries = loadBlacklist(dir);
  assert.equal(entries.length, 2);
  assert.deepEqual(entries[0]?.matchTerms, ['acme media inc', 'acme']);
  assert.deepEqual(entries[1]?.matchTerms, ['the atlas co', 'atlas']);
  assert.match(entries[0]?.reason ?? '', /^auto: takedown on youtube take-1$/);
  assert.match(entries[1]?.reason ?? '', /^auto: strike on youtube strike-1$/);
  assert.ok(errors.some((line) => line.includes('STOP-THE-LINE: takedown from Acme Media Inc')));
  assert.ok(errors.some((line) => line.includes('STOP-THE-LINE: strike from The Atlas Co')));
});

test('addToBlacklist is case-insensitively idempotent and unions match terms', async () => {
  const dir = await temporaryDir();

  addToBlacklist('Example Rights', ['Example', 'Archive'], 'manual', dir);
  addToBlacklist('example rights', ['archive', 'Documentary'], undefined, dir);

  const entries = loadBlacklist(dir);
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.rightsHolder, 'Example Rights');
  assert.deepEqual(entries[0]?.matchTerms, ['example', 'archive', 'documentary']);
  assert.equal(entries[0]?.reason, 'manual');
});

test('listOpenClaims filters closed statuses and skips a corrupt JSONL line', async () => {
  const dir = await temporaryDir();
  const records = [
    claim({ videoId: 'open', status: 'open' }),
    claim({ videoId: 'disputed', status: 'disputed' }),
    claim({ videoId: 'released', status: 'released' }),
    claim({ videoId: 'resolved', status: 'resolved' }),
  ];
  await writeFile(
    join(dir, 'claims.jsonl'),
    `${JSON.stringify(records[0])}\n{not-json}\n${records
      .slice(1)
      .map((record) => JSON.stringify(record))
      .join('\n')}\n`,
  );
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(' '));

  let openClaims: ClaimRecord[];
  try {
    openClaims = listOpenClaims(dir);
  } finally {
    console.warn = originalWarn;
  }

  assert.deepEqual(
    openClaims.map((record) => record.videoId),
    ['open', 'disputed'],
  );
  assert.equal(warnings.length, 1);
  assert.match(warnings[0]!, /skipping corrupt claims\.jsonl line 2/);
});

test('matchesBlacklist checks title, description, tags, provider, and pageUrl', () => {
  const entries = [blacklistEntry(['acme'])];
  assert.equal(matchesBlacklist(candidate('title', { title: 'ACME archive' }), entries)?.field, 'title');
  assert.equal(
    matchesBlacklist(candidate('description', { description: 'Licensed by Acme' }), entries)?.field,
    'description',
  );
  assert.equal(matchesBlacklist(candidate('tag', { tags: ['ACME-news'] }), entries)?.field, 'tag');
  assert.equal(
    matchesBlacklist(candidate('provider', { provider: 'acme-library' }), entries)?.field,
    'provider',
  );
  assert.equal(
    matchesBlacklist(
      candidate('page-url', { pageUrl: 'https://rights.example.test/acme/clip' }),
      entries,
    )?.field,
    'pageUrl',
  );
  assert.equal(
    matchesBlacklist(candidate('short', { title: 'An XY catalog clip' }), [blacklistEntry(['xy'])]),
    undefined,
  );
});

test('applySourcingFilters removes blacklist matches and keeps clean candidates', () => {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(' '));

  let surviving: SourceClipCandidate[];
  try {
    surviving = applySourcingFilters(
      [candidate('blocked', { title: 'Footage from ACME archive' }), candidate('clean')],
      [blacklistEntry(['acme'])],
    );
  } finally {
    console.warn = originalWarn;
  }

  assert.deepEqual(surviving.map((clip) => clip.id), ['clean']);
  assert.deepEqual(warnings, [
    "[sourcing] BLACKLISTED rights holder match: blocked — Acme Rights Group term 'acme' in title (stop-the-line; see data/blacklist.json)",
  ]);
});

test('Telegram sender failure never rejects a stop-the-line record', async () => {
  const dir = await temporaryDir();
  mutableConfig.dryRun = false;
  mutableConfig.approval.telegramBotToken = 'test-token';
  mutableConfig.approval.telegramChatId = 'test-chat';
  setTelegramFetch(async () => {
    throw new Error('simulated Telegram outage');
  });
  const errors: string[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => errors.push(args.map(String).join(' '));

  try {
    await assert.doesNotReject(
      recordClaim(claim({ kind: 'strike', rightsHolder: 'Failure Test Rights' }), dir),
    );
  } finally {
    console.error = originalError;
  }

  assert.equal(loadBlacklist(dir)[0]?.rightsHolder, 'Failure Test Rights');
  assert.equal(
    (await readFile(join(dir, 'claims.jsonl'), 'utf8')).trim().length > 0,
    true,
  );
  assert.ok(errors.some((line) => line.includes('alert failed (non-fatal)')));
});
