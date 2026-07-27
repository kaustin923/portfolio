/**
 * X publishing via the API v2 chunked-media and post endpoints.
 *
 * Required env:
 * - X_ACCESS_TOKEN: an OAuth 2.0 user-context token with tweet.read,
 *   tweet.write, users.read, and media.write scopes. An app-only bearer token
 *   cannot post or upload media.
 *
 * X user tokens expire after roughly two hours unless offline.access was
 * requested. Refresh tokens rotate on every use and are single-use, so adding
 * X_CLIENT_ID/X_CLIENT_SECRET/X_REFRESH_TOKEN auto-refresh (like YouTube) also
 * requires persisting the rotated token; state.ts is the natural home. This
 * adapter intentionally ships with a static X_ACCESS_TOKEN for now.
 *
 * Owner registration:
 * 1. Create a project and app at developer.x.com. Free-tier write quotas are
 *    very small (roughly 500 posts/month, plus per-24-hour caps); Basic and Pro
 *    cost money.
 * 2. Enable OAuth 2.0 under User authentication settings, set a redirect URI,
 *    and request tweet.read tweet.write users.read media.write (plus
 *    offline.access if refresh is wanted).
 * 3. Run Authorization Code + PKCE as the posting account and copy the token.
 * 4. Set X_ACCESS_TOKEN in trend-engine/.env.
 * 5. Add x to PUBLISH_PLATFORMS. Defaults deliberately exclude it.
 */

import { readFile, stat } from 'node:fs/promises';

import { config } from '../config.js';
import type { ClipDraft, PublishResult } from '../types.js';
import { composeCaption, expectJson, expectOk, getFetch, requireEnv, sleep } from './http.js';

const MEDIA_INITIALIZE_URL = 'https://api.x.com/2/media/upload/initialize';
const MEDIA_STATUS_URL = 'https://api.x.com/2/media/upload';
const TWEETS_URL = 'https://api.x.com/2/tweets';
const SEGMENT_SIZE = 4 * 1024 * 1024;

interface XProcessingInfo {
  state: 'pending' | 'in_progress' | 'succeeded' | 'failed';
  check_after_secs?: number;
  error?: { message?: string };
}

interface XMediaResponse {
  data?: {
    id?: string;
    processing_info?: XProcessingInfo;
  };
}

interface XPostResponse {
  data?: { id?: string };
}

export interface XPublishOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
}

/**
 * X's 280-char cap must never truncate required license attribution: the
 * attribution block sits at the end of the caption, so a plain slice cuts
 * exactly the text CC-BY requires. Trim the caption body instead, keep the
 * attribution verbatim, and refuse to post when it cannot fit at all.
 */
function composeXCaption(draft: ClipDraft, caption: string): string {
  const attribution = draft.license.requiresAttribution
    ? draft.license.attributionText
    : undefined;
  const composed = composeCaption(caption, draft.hashtags, 280);
  if (!attribution || composed.includes(attribution)) return composed;

  if (attribution.length > 280) {
    throw new Error(
      'publishX refused: required license attribution does not fit within the 280-character limit',
    );
  }

  const body = caption.replace(attribution, '').trimEnd();
  const trimmedBody = body.slice(0, Math.max(0, 280 - attribution.length - 2)).trimEnd();
  return trimmedBody.length > 0 ? `${trimmedBody}\n\n${attribution}` : attribution;
}

export async function publishX(
  draft: ClipDraft,
  caption: string,
  opts: XPublishOptions = {},
): Promise<PublishResult> {
  if (config.dryRun) throw new Error('publishX refused: DRY_RUN is enabled — no live API calls');
  const env = requireEnv('X', ['X_ACCESS_TOKEN']);
  const fetch = getFetch();
  const fileSize = (await stat(draft.outputPath)).size;
  const bytes = await readFile(draft.outputPath);
  const cappedCaption = composeXCaption(draft, caption);
  const pollIntervalMs = opts.pollIntervalMs ?? 5_000;
  const timeoutMs = opts.timeoutMs ?? 300_000;
  const authHeaders = { Authorization: `Bearer ${env.X_ACCESS_TOKEN}` };

  const initializeRes = await fetch(MEDIA_INITIALIZE_URL, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      media_type: 'video/mp4',
      total_bytes: fileSize,
      media_category: 'tweet_video',
    }),
  });
  const initializeJson = await expectJson<XMediaResponse>(
    initializeRes,
    'X media initialize',
  );
  const mediaId = initializeJson.data?.id;
  if (!mediaId) throw new Error('X media initialize: response missing media id');

  const totalSegments = Math.max(1, Math.ceil(fileSize / SEGMENT_SIZE));
  for (let index = 0; index < totalSegments; index += 1) {
    const start = index * SEGMENT_SIZE;
    const end = Math.min(start + SEGMENT_SIZE, bytes.length);
    const form = new FormData();
    form.set('segment_index', String(index));
    form.set(
      'media',
      new Blob([bytes.subarray(start, end)], { type: 'application/octet-stream' }),
      'clip.mp4',
    );
    const appendRes = await fetch(
      `https://api.x.com/2/media/upload/${encodeURIComponent(mediaId)}/append`,
      { method: 'POST', headers: authHeaders, body: form },
    );
    await expectOk(appendRes, `X media append segment ${index + 1}/${totalSegments}`);
  }

  const finalizeRes = await fetch(
    `https://api.x.com/2/media/upload/${encodeURIComponent(mediaId)}/finalize`,
    { method: 'POST', headers: authHeaders },
  );
  const finalizeJson = await expectJson<XMediaResponse>(finalizeRes, 'X media finalize');
  let info = finalizeJson.data?.processing_info;

  if (info && info.state !== 'succeeded') {
    const deadline = Date.now() + timeoutMs;
    while (true) {
      if (info.state === 'failed') {
        throw new Error(`X media processing failed: ${info.error?.message ?? 'unknown reason'}`);
      }
      if (Date.now() >= deadline) throw new Error('X media processing timed out');
      await sleep((info.check_after_secs ?? pollIntervalMs / 1000) * 1000);

      const statusRes = await fetch(
        `${MEDIA_STATUS_URL}?media_id=${encodeURIComponent(mediaId)}&command=STATUS`,
        { headers: authHeaders },
      );
      const statusJson = await expectJson<XMediaResponse>(statusRes, 'X media status');
      info = statusJson.data?.processing_info;
      if (!info || info.state === 'succeeded') break;
    }
  }

  const postRes = await fetch(TWEETS_URL, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: cappedCaption, media: { media_ids: [mediaId] } }),
  });
  const postJson = await expectJson<XPostResponse>(postRes, 'X post creation');
  const postId = postJson.data?.id;
  if (!postId) throw new Error('X post creation: response missing post id');

  return {
    platform: 'x',
    status: 'published',
    postId,
    url: `https://x.com/i/status/${postId}`,
  };
}
