import { readFile, stat } from 'node:fs/promises';

import { config } from '../config.js';
import type { ClipDraft, PublishResult } from '../types.js';
import { composeCaption, expectJson, expectOk, getFetch, requireEnv } from './http.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const UPLOAD_URL =
  'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';

interface TokenResponse {
  access_token?: string;
}

interface VideoResponse {
  id?: string;
}

export async function publishYouTube(
  draft: ClipDraft,
  caption: string,
): Promise<PublishResult> {
  if (config.dryRun) {
    throw new Error('publishYouTube refused: DRY_RUN is enabled — no live API calls');
  }
  const env = requireEnv('YouTube', [
    'YOUTUBE_CLIENT_ID',
    'YOUTUBE_CLIENT_SECRET',
    'YOUTUBE_REFRESH_TOKEN',
  ]);
  const clientId = env.YOUTUBE_CLIENT_ID!;
  const clientSecret = env.YOUTUBE_CLIENT_SECRET!;
  const refreshToken = env.YOUTUBE_REFRESH_TOKEN!;
  const privacyStatus = process.env.YOUTUBE_PRIVACY_STATUS || 'private';
  const categoryId = process.env.YOUTUBE_CATEGORY_ID || '24';
  const fileSize = (await stat(draft.outputPath)).size;
  const fetch = getFetch();

  const tokenBody = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });
  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenBody,
  });
  const tokenJson = await expectJson<TokenResponse>(tokenRes, 'YouTube token refresh');
  if (!tokenJson.access_token) {
    throw new Error('YouTube token refresh: response missing access_token');
  }

  const fullCaption = composeCaption(caption, draft.hashtags, 4900);
  const title = (caption.split(/\r?\n/, 1)[0] ?? '').slice(0, 95);

  // There is no Shorts API flag: a 9:16 video no longer than 180 seconds is
  // classified automatically, and the Editor guarantees that render shape.
  // videos.insert also has its own roughly 100-uploads/day quota bucket since
  // December 2025.
  const initRes = await fetch(UPLOAD_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenJson.access_token}`,
      'Content-Type': 'application/json',
      'X-Upload-Content-Type': 'video/mp4',
      'X-Upload-Content-Length': String(fileSize),
    },
    body: JSON.stringify({
      snippet: {
        title,
        description: fullCaption,
        categoryId,
      },
      status: {
        privacyStatus,
        selfDeclaredMadeForKids: false,
        // YouTube altered-content disclosure for AI-generated narration.
        ...(draft.syntheticMedia ? { containsSyntheticMedia: true } : {}),
      },
    }),
  });
  await expectOk(initRes, 'YouTube resumable upload init');
  const location = initRes.headers.get('Location');
  if (!location) {
    throw new Error('YouTube resumable upload init: response missing Location header');
  }

  const bytes = await readFile(draft.outputPath);
  let uploadRes = await fetch(location, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/mp4' },
    body: bytes,
  });

  if (uploadRes.status === 308) {
    const range = uploadRes.headers.get('Range');
    const match = range?.match(/^bytes=0-(\d+)$/i);
    if (!match) {
      throw new Error('YouTube resumable upload: 308 response missing a valid Range header');
    }

    const nextByte = Number(match[1]) + 1;
    if (!Number.isSafeInteger(nextByte) || nextByte < 0 || nextByte >= bytes.length) {
      throw new Error(`YouTube resumable upload: invalid resume Range ${range}`);
    }

    uploadRes = await fetch(location, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Range': `bytes ${nextByte}-${bytes.length - 1}/${bytes.length}`,
      },
      body: bytes.subarray(nextByte),
    });
  }

  const videoJson = await expectJson<VideoResponse>(uploadRes, 'YouTube video upload');
  if (!videoJson.id) {
    throw new Error('YouTube video upload: response missing video id');
  }

  return {
    platform: 'youtube-shorts',
    status: 'published',
    postId: videoJson.id,
    url: `https://www.youtube.com/shorts/${videoJson.id}`,
  };
}
