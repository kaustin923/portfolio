/**
 * TikTok — official Content Posting API (Direct Post flow).
 *
 * Flow (https://developers.tiktok.com/doc/content-posting-api-get-started):
 *   1. POST /v2/post/publish/video/init/  — declare post_info (caption,
 *      privacy…) + source_info (FILE_UPLOAD, size, chunking plan)
 *      → { publish_id, upload_url }.
 *   2. PUT the bytes to upload_url with Content-Range headers (chunked).
 *   3. Poll POST /v2/post/publish/status/fetch/ until PUBLISH_COMPLETE —
 *      Direct Post publishes automatically once the upload finishes.
 *
 * Chunking rules per the docs: a file ≤ 64 MB must be sent as a single chunk;
 * larger files are split into fixed-size chunks (5–64 MB), with
 * total_chunk_count = floor(size / chunk_size) and the FINAL chunk absorbing
 * the remainder (so it may exceed chunk_size).
 *
 * Credentials: TIKTOK_ACCESS_TOKEN — a user access token from TikTok's OAuth
 * flow, with the video.publish scope. Note: unaudited TikTok apps may only
 * post SELF_ONLY (private); set TIKTOK_PRIVACY_LEVEL=PUBLIC_TO_EVERYONE once
 * your app passes TikTok's audit.
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

const PLATFORM: Platform = 'tiktok';
const BASE = 'https://open.tiktokapis.com/v2/post/publish';
const SINGLE_CHUNK_MAX = 64 * 1024 * 1024; // ≤ 64 MB ⇒ must be one chunk
// 32 MB base: the final chunk absorbs the remainder (< chunk_size), so it stays
// < 64 MB — TikTok's per-chunk maximum — for any file size.
const CHUNK_SIZE = 32 * 1024 * 1024; //       chunk size for larger files (5–64 MB allowed)

interface TikTokEnvelope<T> {
  data?: T;
  error?: { code?: string; message?: string };
}
interface InitData {
  publish_id?: string;
  upload_url?: string;
}
interface StatusData {
  status?: string;
  fail_reason?: string;
  publicaly_available_post_id?: Array<number | string>; // [sic] — TikTok's field name
}

function unwrap<T>(envelope: TikTokEnvelope<T>, context: string): T {
  const code = envelope.error?.code;
  if (code && code !== 'ok') {
    throw new Error(`${context} failed: ${code} — ${envelope.error?.message ?? 'no message'}`);
  }
  if (!envelope.data) throw new Error(`${context} returned no data`);
  return envelope.data;
}

export async function publishToTikTok(draft: ClipDraft, caption: string): Promise<PublishResult> {
  if (isDryRun()) return dryRunResult(PLATFORM, draft);

  const { values, missing } = readCreds(['TIKTOK_ACCESS_TOKEN'] as const);
  if (missing.length > 0) return skippedResult(PLATFORM, missing);
  const token = values.TIKTOK_ACCESS_TOKEN;
  const authHeaders = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json; charset=UTF-8',
  };

  const { bytes, size } = await loadVideo(draft.outputPath);
  const chunkSize = size <= SINGLE_CHUNK_MAX ? size : CHUNK_SIZE;
  const totalChunks = Math.max(1, Math.floor(size / chunkSize));

  // Step 1 — initialize the direct post.
  const initRes = await fetch(`${BASE}/video/init/`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      post_info: {
        title: composeCaption(caption, draft.hashtags, 2200),
        privacy_level: process.env.TIKTOK_PRIVACY_LEVEL ?? 'SELF_ONLY',
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
        video_cover_timestamp_ms: 1000,
      },
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: size,
        chunk_size: chunkSize,
        total_chunk_count: totalChunks,
      },
    }),
  });
  const init = unwrap(
    await expectJson<TikTokEnvelope<InitData>>(initRes, 'TikTok post init'),
    'TikTok post init',
  );
  const { publish_id: publishId, upload_url: uploadUrl } = init;
  if (!publishId || !uploadUrl) throw new Error('TikTok init returned no publish_id/upload_url');

  // Step 2 — upload chunks; the final chunk absorbs any remainder.
  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = i === totalChunks - 1 ? size : start + chunkSize; // exclusive
    const chunkRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Range': `bytes ${start}-${end - 1}/${size}`,
      },
      body: bytes.subarray(start, end),
    });
    await expectOk(chunkRes, `TikTok chunk ${i + 1}/${totalChunks} upload`);
  }

  // Step 3 — poll until TikTok finishes processing + publishing.
  const postId = await poll<string>('TikTok publish status', 30, 3000, async () => {
    const statusRes = await fetch(`${BASE}/status/fetch/`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ publish_id: publishId }),
    });
    const status = unwrap(
      await expectJson<TikTokEnvelope<StatusData>>(statusRes, 'TikTok status fetch'),
      'TikTok status fetch',
    );
    if (status.status === 'PUBLISH_COMPLETE') {
      return { done: String(status.publicaly_available_post_id?.[0] ?? publishId) };
    }
    if (status.status === 'FAILED') {
      throw new Error(`TikTok publish failed: ${status.fail_reason ?? 'unknown reason'}`);
    }
    return {}; // PROCESSING_UPLOAD / PROCESSING_DOWNLOAD / SEND_TO_USER_INBOX…
  });

  return { platform: PLATFORM, status: 'published', postId };
}
