/**
 * Instagram Reels — official Graph API content publishing.
 *
 * Flow (https://developers.facebook.com/docs/instagram-api/guides/content-publishing):
 *   1. POST /{ig-user-id}/media  with media_type=REELS and
 *      upload_type=resumable → a media *container* id. (The resumable
 *      upload_type lets us push the local file directly instead of having to
 *      host it at a public video_url first.)
 *   2. POST the raw bytes to rupload.facebook.com/ig-api-upload/… for that
 *      container (headers: `Authorization: OAuth <token>`, offset, file_size).
 *   3. Poll GET /{container-id}?fields=status_code until FINISHED (Instagram
 *      transcodes asynchronously; ERROR/EXPIRED are terminal).
 *   4. POST /{ig-user-id}/media_publish with creation_id=<container-id>.
 *
 * Credentials:
 *   IG_USER_ID      — the Instagram *professional* account's IG User id.
 *   IG_ACCESS_TOKEN — a (long-lived) user access token with the
 *                     instagram_content_publish + instagram_basic permissions.
 */

import type { ClipDraft, Platform, PublishResult } from '../types.js';
import {
  composeCaption,
  dryRunResult,
  expectJson,
  isDryRun,
  loadVideo,
  poll,
  readCreds,
  skippedResult,
} from './common.js';

const PLATFORM: Platform = 'instagram-reels';
const GRAPH_VERSION = 'v21.0';
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
const RUPLOAD = `https://rupload.facebook.com/ig-api-upload/${GRAPH_VERSION}`;

export async function publishToInstagram(
  draft: ClipDraft,
  caption: string,
): Promise<PublishResult> {
  if (isDryRun()) return dryRunResult(PLATFORM, draft);

  const { values, missing } = readCreds(['IG_USER_ID', 'IG_ACCESS_TOKEN'] as const);
  if (missing.length > 0) return skippedResult(PLATFORM, missing);
  const { IG_USER_ID: igUserId, IG_ACCESS_TOKEN: token } = values;

  const { bytes, size } = await loadVideo(draft.outputPath);

  // Step 1 — create a resumable Reels media container.
  const containerRes = await fetch(`${GRAPH}/${igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      media_type: 'REELS',
      upload_type: 'resumable',
      caption: composeCaption(caption, draft.hashtags, 2200),
      share_to_feed: 'true',
      access_token: token,
    }),
  });
  const container = await expectJson<{ id?: string }>(containerRes, 'Instagram container create');
  if (!container.id) throw new Error('Instagram container create returned no id');

  // Step 2 — upload the bytes against the container via the rupload endpoint.
  const uploadRes = await fetch(`${RUPLOAD}/${container.id}`, {
    method: 'POST',
    headers: {
      Authorization: `OAuth ${token}`,
      offset: '0',
      file_size: String(size),
      'Content-Type': 'application/octet-stream',
    },
    body: bytes,
  });
  const upload = await expectJson<{ success?: boolean }>(uploadRes, 'Instagram video upload');
  if (upload.success === false) throw new Error('Instagram video upload reported success=false');

  // Step 3 — wait for Instagram to finish ingesting/transcoding the container.
  await poll<true>('Instagram container processing', 30, 3000, async () => {
    const statusRes = await fetch(
      `${GRAPH}/${container.id}?fields=status_code&access_token=${encodeURIComponent(token)}`,
    );
    const status = await expectJson<{ status_code?: string }>(
      statusRes,
      'Instagram container status',
    );
    if (status.status_code === 'FINISHED') return { done: true };
    if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') {
      throw new Error(`Instagram container ended in status ${status.status_code}`);
    }
    return {}; // IN_PROGRESS
  });

  // Step 4 — publish the container as a Reel.
  const publishRes = await fetch(`${GRAPH}/${igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ creation_id: container.id, access_token: token }),
  });
  const media = await expectJson<{ id?: string }>(publishRes, 'Instagram media publish');
  if (!media.id) throw new Error('Instagram media_publish returned no media id');

  // Best-effort: fetch the canonical permalink for the run report.
  let url: string | undefined;
  try {
    const permalinkRes = await fetch(
      `${GRAPH}/${media.id}?fields=permalink&access_token=${encodeURIComponent(token)}`,
    );
    const info = await expectJson<{ permalink?: string }>(permalinkRes, 'Instagram permalink');
    url = info.permalink;
  } catch {
    // The post IS live; a missing permalink should not fail the publish.
  }

  return { platform: PLATFORM, status: 'published', postId: media.id, url };
}
