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
 * network. Live mode uses official APIs for every registered platform.
 */

import { config } from '../config.js';
import { preflightInstagram, publishInstagram } from '../publish/instagram.js';
import { preflightTikTok, publishTikTok } from '../publish/tiktok.js';
import { publishYouTube, youTubeInsertUnits } from '../publish/youtube.js';
import { publishX } from '../publish/x.js';
import { appendPublishReceipt } from '../provenance.js';
import {
  getDailyPublishCount,
  getYouTubeUnits,
  loadState,
  pacificDateKey,
  recordDailyPublish,
  recordYouTubeUnits,
  saveState,
  utcDateKey,
} from '../state.js';
import type { ApprovalDecision, ClipDraft, Platform, PublishResult } from '../types.js';

type Adapter = (draft: ClipDraft, caption: string) => Promise<PublishResult>;

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
  x: liveAdapter('x', publishX),
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
  if (decision.status !== 'approved') {
    return draft.targetPlatforms.map((platform) => ({
      platform,
      status: 'skipped',
      error: `not published: approval decision was '${decision.status}'`,
    }));
  }

  const caption = resolveCaption(draft, decision);
  const results: PublishResult[] = [];

  for (const platform of draft.targetPlatforms) {
    try {
      // BEGIN quota-preflights: keep this block before the adapter result push.
      if (!config.dryRun) {
        const state = loadState();
        const dailyDate = utcDateKey();
        const dailyCount = getDailyPublishCount(state, platform, dailyDate);
        const dailyMax = config.quotas.maxPostsPerDayPerPlatform;
        if (dailyCount >= dailyMax) {
          const reason = `daily publish cap reached (${dailyCount}/${dailyMax}) — skipping`;
          console.log(`[publish:${platform}] ${reason}`);
          results.push({ platform, status: 'skipped', error: reason });
          continue;
        }

        if (platform === 'instagram-reels') {
          const preflight = await preflightInstagram();
          if (!preflight.ok) {
            const reason = preflight.reason ?? 'Instagram quota preflight blocked publishing';
            console.log(`[publish:${platform}] ${reason}`);
            results.push({ platform, status: 'skipped', error: reason });
            continue;
          }
        }

        if (platform === 'tiktok') {
          const preflight = await preflightTikTok();
          if (!preflight.ok) {
            const reason = preflight.reason ?? 'TikTok creator preflight blocked publishing';
            console.log(`[publish:${platform}] ${reason}`);
            results.push({ platform, status: 'skipped', error: reason });
            continue;
          }
        }

        const youtubeDate = pacificDateKey();
        const youtubeUnits = getYouTubeUnits(state, youtubeDate);
        const insertUnits = youTubeInsertUnits();
        if (
          platform === 'youtube-shorts' &&
          youtubeUnits + insertUnits > config.quotas.youtubeDailyUnits
        ) {
          const reason =
            `YouTube quota ledger: would exceed daily units ` +
            `(${youtubeUnits}+${insertUnits} > ${config.quotas.youtubeDailyUnits})`;
          console.log(`[publish:${platform}] ${reason}`);
          results.push({ platform, status: 'skipped', error: reason });
          continue;
        }

        recordDailyPublish(state, platform, dailyDate);
        if (platform === 'youtube-shorts') {
          recordYouTubeUnits(state, insertUnits, youtubeDate);
        }
        saveState(state);
      }
      // END quota-preflights.
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

    // provenance receipt — one per publish attempt (see src/provenance.ts)
    const lastResult = results[results.length - 1]!;
    await appendPublishReceipt(draft, decision, caption, lastResult);
  }
  return results;
}
