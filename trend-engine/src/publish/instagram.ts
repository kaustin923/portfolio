import path from 'node:path';

import { config } from '../config.js';
import type { ClipDraft, PublishResult } from '../types.js';
import { expectOk, getFetch, requireEnv, sleep } from './http.js';

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

export interface InstagramPublishOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
}

function captionWithHashtags(draft: ClipDraft, caption: string): string {
  return `${caption}\n\n${draft.hashtags.map((hashtag) => `#${hashtag}`).join(' ')}`;
}

export async function publishInstagram(
  draft: ClipDraft,
  caption: string,
  opts: InstagramPublishOptions = {},
): Promise<PublishResult> {
  if (config.dryRun) {
    throw new Error('publishInstagram refused: DRY_RUN is enabled — no live API calls');
  }
  const env = requireEnv('Instagram', [
    'IG_USER_ID',
    'IG_ACCESS_TOKEN',
    'PUBLIC_VIDEO_BASE_URL',
  ]);
  const userId = env.IG_USER_ID!;
  const accessToken = env.IG_ACCESS_TOKEN!;
  const publicBaseUrl = env.PUBLIC_VIDEO_BASE_URL!;
  const pollIntervalMs = opts.pollIntervalMs ?? 5_000;
  const timeoutMs = opts.timeoutMs ?? 300_000;
  const videoUrl = `${publicBaseUrl.replace(/\/+$/, '')}/${encodeURIComponent(path.basename(draft.outputPath))}`;
  const fetch = getFetch();

  // Graph cannot read local files. The clips directory must be served over
  // public HTTPS at PUBLIC_VIDEO_BASE_URL before live publishing is enabled.
  const createRes = await fetch(`${GRAPH}/${encodeURIComponent(userId)}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      media_type: 'REELS',
      video_url: videoUrl,
      caption: captionWithHashtags(draft, caption).slice(0, 2200),
      access_token: accessToken,
    }),
  });
  await expectOk(createRes, 'Instagram Reels container creation');
  const createJson = (await createRes.json()) as InstagramIdResponse;
  if (!createJson.id) {
    throw new Error('Instagram Reels container creation: response missing container id');
  }
  const containerId = createJson.id;

  const deadline = Date.now() + timeoutMs;
  while (true) {
    const statusRes = await fetch(
      `${GRAPH}/${encodeURIComponent(containerId)}?fields=status_code&access_token=${encodeURIComponent(accessToken)}`,
    );
    await expectOk(statusRes, 'Instagram container status');
    const statusJson = (await statusRes.json()) as InstagramStatusResponse;
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
  await expectOk(publishRes, 'Instagram Reels publish');
  const publishJson = (await publishRes.json()) as InstagramIdResponse;
  if (!publishJson.id) {
    throw new Error('Instagram Reels publish: response missing media id');
  }
  const mediaId = publishJson.id;

  let permalink: string | undefined;
  try {
    const permalinkRes = await fetch(
      `${GRAPH}/${encodeURIComponent(mediaId)}?fields=permalink&access_token=${encodeURIComponent(accessToken)}`,
    );
    await expectOk(permalinkRes, 'Instagram permalink lookup');
    permalink = ((await permalinkRes.json()) as InstagramPermalinkResponse).permalink;
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
