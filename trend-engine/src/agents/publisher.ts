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
 * In DRY_RUN adapters report what they *would* post without touching the
 * network. Live mode uses official APIs for TikTok, YouTube, and Instagram;
 * X remains intentionally unimplemented.
 */

import { config } from '../config.js';
import { publishInstagram } from '../publish/instagram.js';
import { publishTikTok } from '../publish/tiktok.js';
import { publishYouTube } from '../publish/youtube.js';
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

function liveAdapter(
  platform: Platform,
  publishLive: (draft: ClipDraft, caption: string) => Promise<PublishResult>,
): Adapter {
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
    return publishLive(draft, caption);
  };
}

const ADAPTERS: Record<Platform, Adapter> = {
  tiktok: liveAdapter('tiktok', publishTikTok),
  'youtube-shorts': liveAdapter('youtube-shorts', publishYouTube),
  'instagram-reels': liveAdapter('instagram-reels', publishInstagram),
  x: stubAdapter('x'),
};

/**
 * A human-edited caption must never drop required license attribution: the
 * Editor bakes it into draft.caption, but a Telegram reply-to-approve replaces
 * the caption wholesale, so re-append attribution when it went missing.
 */
function resolveCaption(draft: ClipDraft, decision: ApprovalDecision): string {
  const caption = decision.editedCaption ?? draft.caption;
  const attribution = draft.license.requiresAttribution
    ? draft.license.attributionText
    : undefined;
  if (!attribution || caption.includes(attribution)) return caption;
  return `${caption}\n\n${attribution}`;
}

export async function publish(
  draft: ClipDraft,
  decision: ApprovalDecision,
): Promise<PublishResult[]> {
  const caption = resolveCaption(draft, decision);
  const results: PublishResult[] = [];

  for (const platform of draft.targetPlatforms) {
    try {
      results.push(await ADAPTERS[platform](draft, caption));
    } catch (err) {
      console.error(
        `[publish:${platform}] FAILED:`,
        err instanceof Error ? err.message : String(err),
      );
      results.push({
        platform,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}
