/**
 * Publisher agent — pushes an approved draft to each target platform via their
 * *official* APIs.
 *
 * Official APIs only — no automating the consumer app, which violates ToS and
 * gets accounts banned. Each platform has a real, documented content API:
 *   - TikTok    → Content Posting API
 *   - YouTube   → Data API v3 (videos.insert, Shorts)
 *   - Instagram → Graph API (Reels publishing)
 *   - X         → API v2 media upload + post
 *
 * The adapters are stubbed. In DRY_RUN they report what they *would* post.
 * Live mode intentionally throws until you wire real credentials + upload flow.
 */

import { config } from '../config.js';
import type { ApprovalDecision, ClipDraft, Platform, PublishResult } from '../types.js';

type Adapter = (draft: ClipDraft, caption: string) => Promise<PublishResult>;

function stubAdapter(platform: Platform): Adapter {
  return async (draft, caption) => {
    if (config.dryRun) {
      console.log(`   [publish:${platform}] would upload ${draft.outputPath}`);
      console.log(`   [publish:${platform}] caption: ${caption.slice(0, 80)}…`);
      return {
        platform,
        status: 'published',
        postId: `dryrun-${platform}-${draft.id}`,
        url: `https://${platform}.example/mock`,
      };
    }
    // Live: implement the platform's official upload + publish here.
    throw new Error(`Live publishing to ${platform} not implemented — add official API client`);
  };
}

const ADAPTERS: Record<Platform, Adapter> = {
  tiktok: stubAdapter('tiktok'),
  'youtube-shorts': stubAdapter('youtube-shorts'),
  'instagram-reels': stubAdapter('instagram-reels'),
  x: stubAdapter('x'),
};

export async function publish(
  draft: ClipDraft,
  decision: ApprovalDecision,
): Promise<PublishResult[]> {
  const caption = decision.editedCaption ?? draft.caption;
  const results: PublishResult[] = [];

  for (const platform of draft.targetPlatforms) {
    try {
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
