/**
 * X (Twitter) — official API v2: chunked media upload + create post.
 *
 * Flow (https://docs.x.com/x-api/media/quickstart/media-upload-chunked):
 *   1. POST /2/media/upload/initialize    — declare media_type, total_bytes,
 *      media_category=tweet_video → { data: { id } }.
 *   2. POST /2/media/upload/{id}/append   — multipart segments (≤ 5 MB each,
 *      with segment_index), repeated until all bytes are sent.
 *   3. POST /2/media/upload/{id}/finalize — may return processing_info for
 *      async video transcode.
 *   4. GET  /2/media/upload?media_id=…&command=STATUS — poll until the
 *      processing state is `succeeded` (honoring check_after_secs).
 *   5. POST /2/tweets with { text, media: { media_ids: [id] } }.
 *
 * Credentials: X_ACCESS_TOKEN — an OAuth 2.0 *user-context* access token with
 * the tweet.write, users.read and media.write scopes. An app-only bearer token
 * cannot create posts or upload media.
 */

import type { ClipDraft, Platform, PublishResult } from '../types.js';
import {
  composeCaption,
  dryRunResult,
  expectJson,
  expectOk,
  isDryRun,
  loadVideo,
  poll,
  readCreds,
  skippedResult,
} from './common.js';

const PLATFORM: Platform = 'x';
const API = 'https://api.x.com/2';
const SEGMENT_SIZE = 4 * 1024 * 1024; // ≤ 5 MB per APPEND; 4 MB keeps headroom

interface MediaData {
  id?: string;
  processing_info?: {
    state?: string; // pending | in_progress | succeeded | failed
    check_after_secs?: number;
    error?: { message?: string };
  };
}

export async function publishToX(draft: ClipDraft, caption: string): Promise<PublishResult> {
  if (isDryRun()) return dryRunResult(PLATFORM, draft);

  const { values, missing } = readCreds(['X_ACCESS_TOKEN'] as const);
  if (missing.length > 0) return skippedResult(PLATFORM, missing);
  const auth = { Authorization: `Bearer ${values.X_ACCESS_TOKEN}` };

  const { bytes, size } = await loadVideo(draft.outputPath);

  // Step 1 — initialize the chunked upload.
  const initRes = await fetch(`${API}/media/upload/initialize`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      media_type: 'video/mp4',
      total_bytes: size,
      media_category: 'tweet_video',
    }),
  });
  const init = await expectJson<{ data?: MediaData }>(initRes, 'X media initialize');
  const mediaId = init.data?.id;
  if (!mediaId) throw new Error('X media initialize returned no media id');

  // Step 2 — append the bytes in segments.
  const totalSegments = Math.ceil(size / SEGMENT_SIZE);
  for (let i = 0; i < totalSegments; i++) {
    const segment = bytes.subarray(i * SEGMENT_SIZE, Math.min(size, (i + 1) * SEGMENT_SIZE));
    const form = new FormData();
    form.set('segment_index', String(i));
    form.set('media', new Blob([segment], { type: 'application/octet-stream' }), 'clip.mp4');
    const appendRes = await fetch(`${API}/media/upload/${mediaId}/append`, {
      method: 'POST',
      headers: auth, // Content-Type (multipart boundary) is set by fetch
      body: form,
    });
    await expectOk(appendRes, `X media append segment ${i + 1}/${totalSegments}`);
  }

  // Step 3 — finalize; videos usually enter async processing.
  const finalizeRes = await fetch(`${API}/media/upload/${mediaId}/finalize`, {
    method: 'POST',
    headers: auth,
  });
  const finalized = await expectJson<{ data?: MediaData }>(finalizeRes, 'X media finalize');

  // Step 4 — poll processing status until the transcode succeeds.
  if (finalized.data?.processing_info && finalized.data.processing_info.state !== 'succeeded') {
    await poll<true>('X media processing', 30, 5000, async () => {
      const statusRes = await fetch(
        `${API}/media/upload?media_id=${encodeURIComponent(mediaId)}&command=STATUS`,
        { headers: auth },
      );
      const status = await expectJson<{ data?: MediaData }>(statusRes, 'X media status');
      const info = status.data?.processing_info;
      if (!info || info.state === 'succeeded') return { done: true };
      if (info.state === 'failed') {
        throw new Error(`X media processing failed: ${info.error?.message ?? 'unknown reason'}`);
      }
      return { retryInMs: (info.check_after_secs ?? 5) * 1000 };
    });
  }

  // Step 5 — create the post referencing the uploaded media.
  const postRes = await fetch(`${API}/tweets`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: composeCaption(caption, draft.hashtags, 280),
      media: { media_ids: [mediaId] },
    }),
  });
  const post = await expectJson<{ data?: { id?: string } }>(postRes, 'X create post');
  const postId = post.data?.id;
  if (!postId) throw new Error('X create post returned no post id');

  return {
    platform: PLATFORM,
    status: 'published',
    postId,
    url: `https://x.com/i/status/${postId}`,
  };
}
