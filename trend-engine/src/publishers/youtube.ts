/**
 * YouTube Shorts — official Data API v3, resumable upload protocol.
 *
 * Flow (https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol):
 *   1. POST /upload/youtube/v3/videos?uploadType=resumable  (snippet + status
 *      metadata; X-Upload-Content-* headers describe the coming file)
 *      → 200 with a `Location` header: the one-time upload session URI.
 *   2. PUT the video bytes to that session URI → the created `video` resource.
 *
 * There is no dedicated "Short" flag in the API: YouTube auto-classifies a
 * vertical video ≤ 3 minutes as a Short, and the documented convention is to
 * include #Shorts in the title/description — we do both (the pipeline renders
 * 9:16 clips) so uploads land on the Shorts shelf.
 *
 * Credentials: YOUTUBE_OAUTH_TOKEN — an OAuth 2.0 *access token* authorized
 * with the https://www.googleapis.com/auth/youtube.upload scope. (An API key
 * is not sufficient: uploads always require user authorization.)
 */

import type { ClipDraft, Platform, PublishResult } from '../types.js';
import {
  composeCaption,
  dryRunResult,
  expectJson,
  isDryRun,
  loadVideo,
  readCreds,
  skippedResult,
  truncate,
} from './common.js';

const PLATFORM: Platform = 'youtube-shorts';
const INIT_URL =
  'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';

interface VideoResource {
  id: string;
}

export async function publishToYouTube(draft: ClipDraft, caption: string): Promise<PublishResult> {
  if (isDryRun()) return dryRunResult(PLATFORM, draft);

  const { values, missing } = readCreds(['YOUTUBE_OAUTH_TOKEN'] as const);
  if (missing.length > 0) return skippedResult(PLATFORM, missing);
  const token = values.YOUTUBE_OAUTH_TOKEN;

  const { bytes, size } = await loadVideo(draft.outputPath);

  // Titles are capped at 100 chars; keep room for the #Shorts marker.
  const firstLine = caption.split('\n')[0] ?? caption;
  const title = `${truncate(firstLine, 90)} #Shorts`;
  // Descriptions allow 5000 chars; include full caption + hashtags + marker.
  const description = composeCaption(`${caption}\n\n#Shorts`, draft.hashtags, 4900);
  const attribution = draft.license.requiresAttribution ? draft.license.attributionText : undefined;

  // Step 1 — open the resumable upload session.
  const initRes = await fetch(INIT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Length': String(size),
      'X-Upload-Content-Type': 'video/mp4',
    },
    body: JSON.stringify({
      snippet: {
        title,
        description: attribution ? `${description}\n\n${attribution}` : description,
        tags: draft.hashtags,
        categoryId: '24', // Entertainment; harmless default for shorts
      },
      status: {
        privacyStatus: process.env.YOUTUBE_PRIVACY_STATUS ?? 'public',
        selfDeclaredMadeForKids: false,
      },
    }),
  });
  if (!initRes.ok) {
    const body = await initRes.text().catch(() => '');
    throw new Error(
      `YouTube resumable-session init failed: HTTP ${initRes.status} — ${truncate(body, 500)}`,
    );
  }
  const sessionUri = initRes.headers.get('location');
  if (!sessionUri) {
    throw new Error('YouTube resumable-session init returned no Location header');
  }

  // Step 2 — upload the bytes to the session URI.
  const uploadRes = await fetch(sessionUri, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/mp4' },
    body: bytes,
  });
  const video = await expectJson<VideoResource>(uploadRes, 'YouTube video upload');
  if (!video.id) throw new Error('YouTube upload response had no video id');

  return {
    platform: PLATFORM,
    status: 'published',
    postId: video.id,
    url: `https://www.youtube.com/shorts/${video.id}`,
  };
}
