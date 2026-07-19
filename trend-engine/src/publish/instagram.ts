import { readFile, stat } from 'node:fs/promises';

import { config } from '../config.js';
import type { ClipDraft, PublishResult } from '../types.js';
import { composeCaption, expectJson, getFetch, requireEnv, sleep } from './http.js';

const GRAPH = 'https://graph.facebook.com/v23.0';

interface InstagramIdResponse {
  id?: string;
}

interface InstagramStatusResponse {
  status_code?: string;
}

interface InstagramPermalinkResponse {
  permalink?: string;
}

interface InstagramUploadResponse {
  success?: boolean;
}

interface InstagramPublishingLimitResponse {
  data?: Array<{
    quota_usage?: number;
    config?: {
      quota_total?: number;
      quota_duration?: number;
    };
  }>;
}

export interface InstagramPublishOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
}

export async function preflightInstagram(): Promise<{ ok: boolean; reason?: string }> {
  const env = requireEnv('Instagram', ['IG_USER_ID', 'IG_ACCESS_TOKEN']);
  const userId = env.IG_USER_ID!;
  const accessToken = env.IG_ACCESS_TOKEN!;

  try {
    const response = await getFetch()(
      `${GRAPH}/${encodeURIComponent(userId)}/content_publishing_limit?fields=quota_usage,config`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const json = await expectJson<InstagramPublishingLimitResponse>(
      response,
      'Instagram content publishing limit preflight',
    );
    const limit = json.data?.[0];
    const usage = limit?.quota_usage;
    const total = limit?.config?.quota_total;
    if (typeof usage === 'number' && typeof total === 'number' && usage >= total) {
      return {
        ok: false,
        reason: `IG content_publishing_limit reached (${usage}/${total})`,
      };
    }
    return { ok: true };
  } catch (err) {
    console.warn(
      '[publish:instagram-reels] quota preflight failed open:',
      err instanceof Error ? err.message : String(err),
    );
    return { ok: true };
  }
}

export async function publishInstagram(
  draft: ClipDraft,
  caption: string,
  opts: InstagramPublishOptions = {},
): Promise<PublishResult> {
  if (config.dryRun) {
    throw new Error('publishInstagram refused: DRY_RUN is enabled — no live API calls');
  }
  const env = requireEnv('Instagram', ['IG_USER_ID', 'IG_ACCESS_TOKEN']);
  const userId = env.IG_USER_ID!;
  const accessToken = env.IG_ACCESS_TOKEN!;
  const pollIntervalMs = opts.pollIntervalMs ?? 5_000;
  const timeoutMs = opts.timeoutMs ?? 300_000;
  const fetch = getFetch();
  const fileSize = (await stat(draft.outputPath)).size;
  const bytes = await readFile(draft.outputPath);

  const createRes = await fetch(`${GRAPH}/${encodeURIComponent(userId)}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      media_type: 'REELS',
      upload_type: 'resumable',
      caption: composeCaption(caption, draft.hashtags, 2200),
      share_to_feed: 'true',
      access_token: accessToken,
    }),
  });
  const createJson = await expectJson<InstagramIdResponse>(
    createRes,
    'Instagram Reels container creation',
  );
  if (!createJson.id) {
    throw new Error('Instagram Reels container creation: response missing container id');
  }
  const containerId = createJson.id;

  const uploadRes = await fetch(
    `https://rupload.facebook.com/ig-api-upload/v23.0/${encodeURIComponent(containerId)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `OAuth ${accessToken}`,
        offset: '0',
        file_size: String(fileSize),
        'Content-Type': 'application/octet-stream',
      },
      body: bytes,
    },
  );
  const uploadJson = await expectJson<InstagramUploadResponse>(
    uploadRes,
    'Instagram Reels video upload',
  );
  if (uploadJson.success === false) {
    throw new Error('Instagram Reels video upload: response reported success=false');
  }

  const deadline = Date.now() + timeoutMs;
  while (true) {
    const statusRes = await fetch(
      `${GRAPH}/${encodeURIComponent(containerId)}?fields=status_code&access_token=${encodeURIComponent(accessToken)}`,
    );
    const statusJson = await expectJson<InstagramStatusResponse>(
      statusRes,
      'Instagram container status',
    );
    const status = statusJson.status_code;

    if (status === 'FINISHED') break;
    if (status === 'ERROR' || status === 'EXPIRED') {
      throw new Error(`Instagram container processing failed with status ${status}`);
    }
    if (Date.now() >= deadline) {
      throw new Error('Instagram container processing timed out');
    }
    await sleep(pollIntervalMs);
  }

  // Instagram enforces 100 API-published posts per rolling 24 hours for each
  // account at the media_publish step.
  const publishRes = await fetch(`${GRAPH}/${encodeURIComponent(userId)}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      creation_id: containerId,
      access_token: accessToken,
    }),
  });
  const publishJson = await expectJson<InstagramIdResponse>(
    publishRes,
    'Instagram Reels publish',
  );
  if (!publishJson.id) {
    throw new Error('Instagram Reels publish: response missing media id');
  }
  const mediaId = publishJson.id;

  let permalink: string | undefined;
  try {
    const permalinkRes = await fetch(
      `${GRAPH}/${encodeURIComponent(mediaId)}?fields=permalink&access_token=${encodeURIComponent(accessToken)}`,
    );
    permalink = (
      await expectJson<InstagramPermalinkResponse>(
        permalinkRes,
        'Instagram permalink lookup',
      )
    ).permalink;
  } catch {
    // Publishing succeeded; permalink lookup is deliberately best-effort.
  }

  return {
    platform: 'instagram-reels',
    status: 'published',
    postId: mediaId,
    ...(permalink ? { url: permalink } : {}),
  };
}
