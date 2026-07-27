import { spawn } from 'node:child_process';
import { appendFile, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { config } from './config.js';
import { deriveContentFeatures } from './learning.js';
import { composeCaption } from './publish/http.js';
import type { ApprovalDecision, ClipDraft } from './types.js';

export type Opener = (dir: string) => void;

let injectedOpener: Opener | undefined;

function defaultOpener(dir: string): void {
  const child = spawn('open', [dir], {
    shell: false,
    stdio: 'ignore',
    detached: false,
  });
  child.on('error', (err) => {
    console.warn('[outbox] failed to open manual-post kit:', err);
  });
}

export function setOpener(opener: Opener): void {
  injectedOpener = opener;
}

export function resetOpener(): void {
  injectedOpener = undefined;
}

/**
 * Kit captions must never lose required license attribution to the platform
 * character cap: composeCaption() truncates from the tail, which is exactly
 * where resolveCaption() appends the attribution. When truncation would drop
 * it, reserve room for the attribution, truncate the body, and re-append.
 */
function composeKitCaption(
  caption: string,
  hashtags: string[],
  limit: number,
  attribution: string | undefined,
): string {
  const composed = composeCaption(caption, hashtags, limit);
  if (!attribution || composed.includes(attribution)) return composed;
  const suffix = `\n\n${attribution}`;
  if (suffix.length >= limit) return attribution.slice(0, limit);
  return `${composeCaption(caption, hashtags, limit - suffix.length)}${suffix}`;
}

async function findApprovalTier(draftId: string): Promise<string | null> {
  let jsonl: string;
  try {
    jsonl = await readFile(`${config.dataDir}approvals.jsonl`, 'utf8');
  } catch {
    return null;
  }

  let tier: string | null = null;
  for (const line of jsonl.split('\n')) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line) as { draftId?: unknown; tier?: unknown };
      if (record.draftId === draftId) {
        tier = typeof record.tier === 'string' ? record.tier : null;
      }
    } catch {
      // A malformed approval record must not hide later valid records.
    }
  }
  return tier;
}

async function appendOutboxProvenance(
  draft: ClipDraft,
  dir: string,
  reason: 'approved' | 'missing-credentials',
  recordedAt: string,
): Promise<void> {
  try {
    const record = {
      recordVersion: 1,
      kind: 'outbox',
      recordedAt,
      draftId: draft.id,
      topicId: draft.topicId,
      outboxPath: dir,
      reason,
      syntheticMedia: draft.syntheticMedia ?? false,
    };
    await mkdir(config.dataDir, { recursive: true });
    await appendFile(`${config.dataDir}provenance.jsonl`, `${JSON.stringify(record)}\n`);
  } catch (err) {
    if (/^(1|true|yes|on)$/i.test(process.env.PROVENANCE_STRICT ?? '')) throw err;
    console.warn('[outbox] failed to append provenance record:', err);
  }
}

export async function writeManualPostKit(opts: {
  draft: ClipDraft;
  decision: ApprovalDecision;
  caption: string;
  reason: 'approved' | 'missing-credentials';
}): Promise<string | null> {
  if (config.dryRun) return null;

  const { draft, decision, caption, reason } = opts;
  const createdAt = new Date().toISOString();
  const yyyymmdd = createdAt.slice(0, 10).replace(/-/g, '');
  const safeTopicId = draft.topicId.replace(/[^A-Za-z0-9._-]/g, '-');
  const dir = join(config.dataDir, 'outbox', `${yyyymmdd}-${safeTopicId}`);
  await mkdir(dir, { recursive: true });

  try {
    await copyFile(draft.outputPath, join(dir, basename(draft.outputPath)));
  } catch (err) {
    console.warn(`[outbox] failed to copy rendered MP4 ${draft.outputPath}:`, err);
  }

  const tier = await findApprovalTier(draft.id);
  const meta = {
    kitVersion: 1,
    createdAt,
    topicId: draft.topicId,
    draftId: draft.id,
    reason,
    tier,
    contentFeatures: {
      ...deriveContentFeatures({ draft, tier }),
      postHourLocal: new Date(createdAt).getHours(),
    },
    license: { ...draft.license },
    approvalRecordRef: { file: 'approvals.jsonl', draftId: draft.id },
    approval: {
      status: decision.status,
      decidedBy: decision.decidedBy ?? null,
      note: decision.note ?? null,
      editedCaptionUsed: decision.editedCaption !== undefined,
    },
    syntheticMedia: draft.syntheticMedia ?? false,
    suggestedHashtags: draft.hashtags,
    targetPlatforms: draft.targetPlatforms,
  };
  const readme = draft.syntheticMedia
    ? 'post manually; AI-disclosure toggle required on YT/TikTok'
    : 'post manually';
  const attribution = draft.license.requiresAttribution
    ? draft.license.attributionText
    : undefined;

  await Promise.all([
    writeFile(
      join(dir, 'caption-youtube.txt'),
      composeKitCaption(caption, draft.hashtags, 4900, attribution),
      'utf8',
    ),
    writeFile(
      join(dir, 'caption-instagram.txt'),
      composeKitCaption(caption, draft.hashtags, 2200, attribution),
      'utf8',
    ),
    writeFile(
      join(dir, 'caption-tiktok.txt'),
      composeKitCaption(caption, draft.hashtags, 2200, attribution),
      'utf8',
    ),
    writeFile(join(dir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8'),
    writeFile(join(dir, 'README.txt'), readme, 'utf8'),
  ]);

  console.log(`[outbox] manual-post kit written: ${dir} (${reason})`);
  await appendOutboxProvenance(draft, dir, reason, createdAt);

  if (process.platform === 'darwin' && !config.dryRun && config.outbox.open) {
    (injectedOpener ?? defaultOpener)(dir);
  }

  return dir;
}
