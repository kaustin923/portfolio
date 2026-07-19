import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { appendFile, mkdir } from 'node:fs/promises';

import { config } from './config.js';
import type {
  ApprovalDecision,
  ClipDraft,
  ProvenanceReceipt,
  PublishResult,
} from './types.js';

export async function computeFileSha256(filePath: string): Promise<string | null> {
  try {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(filePath)) hash.update(chunk);
    return hash.digest('hex');
  } catch (err) {
    console.warn(`[provenance] failed to hash ${filePath}:`, err);
    return null;
  }
}

export function pipelineVersion(): string {
  return process.env.GIT_SHA?.trim() || 'unknown';
}

export async function appendPublishReceipt(
  draft: ClipDraft,
  decision: ApprovalDecision,
  captionUsed: string,
  result: PublishResult,
): Promise<void> {
  try {
    const recordedAt = new Date().toISOString();
    const receipt: ProvenanceReceipt = {
      receiptVersion: 1,
      recordedAt,
      draftId: draft.id,
      topicId: draft.topicId,
      platform: result.platform,
      status: result.status,
      postId: result.postId,
      url: result.url,
      error: result.error,
      ...(result.status === 'published' ? { publishedAt: recordedAt } : {}),
      outputPath: draft.outputPath,
      sha256: await computeFileSha256(draft.outputPath),
      license: { ...draft.license },
      attributionText: draft.license.requiresAttribution
        ? draft.license.attributionText
        : undefined,
      captionUsed,
      syntheticMedia: draft.syntheticMedia ?? false,
      // draftId joins this receipt to the timestamped record in approvals.jsonl.
      approval: {
        status: decision.status,
        decidedBy: decision.decidedBy,
        note: decision.note,
        editedCaptionUsed: decision.editedCaption !== undefined,
      },
      pipelineVersion: pipelineVersion(),
    };

    await mkdir(config.dataDir, { recursive: true });
    await appendFile(`${config.dataDir}provenance.jsonl`, `${JSON.stringify(receipt)}\n`);
  } catch (err) {
    if (/^(1|true|yes|on)$/i.test(process.env.PROVENANCE_STRICT ?? '')) throw err;
    console.warn('[provenance] failed to append receipt:', err);
  }
}
