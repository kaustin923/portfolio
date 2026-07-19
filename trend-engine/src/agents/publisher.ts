/**
 * Publisher agent — pushes an approved draft to each target platform via their
 * *official* APIs.
 *
 * Official APIs only — no automating the consumer app, which violates ToS and
 * gets accounts banned. Each platform adapter lives in `src/publishers/`:
 *   - TikTok    → Content Posting API (init → chunked upload → status poll)
 *   - YouTube   → Data API v3 (resumable videos.insert, Shorts conventions)
 *   - Instagram → Graph API (resumable Reels container → media_publish)
 *   - X         → API v2 (chunked media upload → POST /2/tweets)
 *
 * Behavior contract (per platform, never aborting the whole run):
 *   - DRY_RUN                  → mocked `published` result, zero network.
 *   - live, missing creds      → `skipped` with a message naming the env vars.
 *   - live, API/upload failure → `error` with the failure message.
 */

import { config } from '../config.js';
import type { ApprovalDecision, ClipDraft, Platform, PublishResult } from '../types.js';
import { dryRunResult } from '../publishers/common.js';
import { publishToInstagram } from '../publishers/instagram.js';
import { publishToTikTok } from '../publishers/tiktok.js';
import { publishToX } from '../publishers/x.js';
import { publishToYouTube } from '../publishers/youtube.js';

type Adapter = (draft: ClipDraft, caption: string) => Promise<PublishResult>;

const ADAPTERS: Record<Platform, Adapter> = {
  tiktok: publishToTikTok,
  'youtube-shorts': publishToYouTube,
  'instagram-reels': publishToInstagram,
  x: publishToX,
};

export async function publish(
  draft: ClipDraft,
  decision: ApprovalDecision,
): Promise<PublishResult[]> {
  // Defense in depth: the orchestrator already gates on approval, but a
  // publisher that can post unapproved content is one refactor away from an
  // incident. Never publish without an explicit human/dry-run approval.
  if (decision.status !== 'approved') {
    return draft.targetPlatforms.map((platform) => ({
      platform,
      status: 'skipped',
      error: `not published: approval decision was '${decision.status}'`,
    }));
  }

  const caption = decision.editedCaption ?? draft.caption;
  const results: PublishResult[] = [];

  for (const platform of draft.targetPlatforms) {
    if (config.dryRun) {
      console.log(`   [publish:${platform}] would upload ${draft.outputPath}`);
      console.log(`   [publish:${platform}] caption: ${caption.slice(0, 80)}…`);
      results.push(dryRunResult(platform, draft));
      continue;
    }

    try {
      // Adapters return `skipped` themselves when credentials are missing.
      results.push(await ADAPTERS[platform](draft, caption));
    } catch (err) {
      results.push({
        platform,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}
