import { readFile, stat } from 'node:fs/promises';

import { config } from '../config.js';
import type { ClipDraft, PublishResult } from '../types.js';
import { composeCaption, expectJson, expectOk, getFetch, requireEnv, sleep } from './http.js';

const INIT_URL = 'https://open.tiktokapis.com/v2/post/publish/video/init/';
const STATUS_URL = 'https://open.tiktokapis.com/v2/post/publish/status/fetch/';
const MAX_SINGLE_CHUNK_BYTES = 64 * 1024 * 1024;
const LARGE_FILE_CHUNK_BYTES = 10_000_000;

interface TikTokError {
  code?: string;
  message?: string;
  log_id?: string;
}

interface TikTokInitResponse {
  data?: {
    publish_id?: string;
    upload_url?: string;
  };
  error?: TikTokError;
}

interface TikTokStatusResponse {
  data?: {
    status?: string;
    fail_reason?: string;
    publicaly_available_post_id?: Array<number | string>;
  };
  error?: TikTokError;
}

export interface TikTokPublishOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
}

function throwTikTokError(json: { error?: TikTokError }, context: string): void {
  const error = json.error;
  if (error?.code && error.code !== 'ok') {
    const detail = error.message ? `: ${error.message}` : '';
    throw new Error(`${context}: TikTok error ${error.code}${detail}`);
  }
}

export async function publishTikTok(
  draft: ClipDraft,
  caption: string,
  opts: TikTokPublishOptions = {},
): Promise<PublishResult> {
  if (config.dryRun) {
    throw new Error('publishTikTok refused: DRY_RUN is enabled — no live API calls');
  }
  const env = requireEnv('TikTok', ['TIKTOK_ACCESS_TOKEN']);
  const accessToken = env.TIKTOK_ACCESS_TOKEN!;
  const pollIntervalMs = opts.pollIntervalMs ?? 5_000;
  const timeoutMs = opts.timeoutMs ?? 300_000;
  const fileSize = (await stat(draft.outputPath)).size;
  const chunkSize = fileSize > MAX_SINGLE_CHUNK_BYTES ? LARGE_FILE_CHUNK_BYTES : fileSize;
  /*
   * TikTok's FILE_UPLOAD contract: total_chunk_count = floor(video_size /
   * chunk_size), every non-final chunk is exactly chunk_size, and the
   * remainder is MERGED into the final chunk (which may exceed chunk_size).
   */
  const totalChunkCount = Math.max(1, Math.floor(fileSize / chunkSize));
  const fetch = getFetch();

  /*
   * COMPLIANCE: Never replace SELF_ONLY with PUBLIC_TO_EVERYONE from config.
   * Un-audited Content Posting API clients are forced to SELF_ONLY. TikTok also
   * requires creators to actively choose privacy, duet, stitch, and comment
   * settings for each post. Until the Telegram approval card captures those
   * choices, SELF_ONLY is the only compliant default.
   */
  const initRes = await fetch(INIT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      post_info: {
        title: composeCaption(caption, draft.hashtags, 2200),
        privacy_level: 'SELF_ONLY',
        video_cover_timestamp_ms: 1000,
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
      },
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: fileSize,
        chunk_size: chunkSize,
        total_chunk_count: totalChunkCount,
      },
    }),
  });
  const initJson = await expectJson<TikTokInitResponse>(initRes, 'TikTok publish init');
  throwTikTokError(initJson, 'TikTok publish init');
  const publishId = initJson.data?.publish_id;
  const uploadUrl = initJson.data?.upload_url;
  if (!publishId || !uploadUrl) {
    throw new Error('TikTok publish init: response missing publish_id or upload_url');
  }

  const bytes = await readFile(draft.outputPath);
  for (let chunkIndex = 0; chunkIndex < totalChunkCount; chunkIndex += 1) {
    const start = chunkIndex * chunkSize;
    const end =
      chunkIndex === totalChunkCount - 1 ? bytes.length - 1 : start + chunkSize - 1;
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Range': `bytes ${start}-${end}/${bytes.length}`,
      },
      body: bytes.subarray(start, end + 1),
    });
    await expectOk(uploadRes, 'TikTok video upload');
  }

  const deadline = Date.now() + timeoutMs;
  let postId = publishId;
  while (true) {
    const statusRes = await fetch(STATUS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ publish_id: publishId }),
    });
    const statusJson = await expectJson<TikTokStatusResponse>(
      statusRes,
      'TikTok publish status',
    );
    throwTikTokError(statusJson, 'TikTok publish status');
    const status = statusJson.data?.status;

    if (status === 'PUBLISH_COMPLETE') {
      postId = String(statusJson.data?.publicaly_available_post_id?.[0] ?? publishId);
      break;
    }
    if (status === 'FAILED') {
      const reason = statusJson.data?.fail_reason ?? 'unknown reason';
      throw new Error(`TikTok publishing failed: ${reason}`);
    }
    if (Date.now() >= deadline) {
      throw new Error('TikTok publishing timed out');
    }
    await sleep(pollIntervalMs);
  }

  return {
    platform: 'tiktok',
    status: 'published',
    postId,
  };
}
