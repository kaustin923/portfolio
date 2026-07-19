import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, afterEach, test } from 'node:test';

import { publish } from '../src/agents/publisher.js';
import { config } from '../src/config.js';
import { resetFetch, setFetch, type FetchFn } from '../src/publish/http.js';
import { publishInstagram } from '../src/publish/instagram.js';
import { publishTikTok } from '../src/publish/tiktok.js';
import { publishYouTube } from '../src/publish/youtube.js';
import type { ClipDraft, Platform } from '../src/types.js';

const ENV_KEYS = [
  'YOUTUBE_CLIENT_ID',
  'YOUTUBE_CLIENT_SECRET',
  'YOUTUBE_REFRESH_TOKEN',
  'YOUTUBE_PRIVACY_STATUS',
  'YOUTUBE_CATEGORY_ID',
  'IG_USER_ID',
  'IG_ACCESS_TOKEN',
  'PUBLIC_VIDEO_BASE_URL',
  'TIKTOK_ACCESS_TOKEN',
] as const;

const originalEnv = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
const originalDryRun = config.dryRun;

interface FetchCall {
  url: string;
  init?: RequestInit;
}

type FetchStep = Response | ((call: FetchCall) => Response | Promise<Response>);

function makeRecorder(steps: FetchStep[]): FetchCall[] {
  const calls: FetchCall[] = [];
  const remaining = [...steps];
  const fakeFetch: FetchFn = async (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const call = { url, init };
    calls.push(call);
    const step = remaining.shift();
    if (!step) throw new Error(`Unexpected fetch call: ${url}`);
    return typeof step === 'function' ? step(call) : step;
  };
  setFetch(fakeFetch);
  return calls;
}

function jsonResponse(value: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function makeDraft(outputPath: string, targetPlatforms: Platform[] = []): ClipDraft {
  return {
    id: 'draft-1',
    topicId: 'topic-1',
    sourceCandidateId: 'source-1',
    outputPath,
    aspectRatio: '9:16',
    caption: 'Original caption',
    hashtags: ['news', 'today'],
    targetPlatforms,
    license: {
      type: 'original',
      requiresAttribution: false,
      commercialUse: true,
      sourceUrl: 'self',
    },
  };
}

function setDryRun(value: boolean): void {
  (config as unknown as { dryRun: boolean }).dryRun = value;
}

function setEnv(values: Record<string, string>): void {
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
}

async function makeTempVideo(bytes: Uint8Array): Promise<{ dir: string; file: string }> {
  const dir = await mkdtemp(path.join(tmpdir(), 'publisher-live-'));
  const file = path.join(dir, 'clip.mp4');
  await writeFile(file, bytes);
  return { dir, file };
}

afterEach(() => {
  resetFetch();
  setDryRun(originalDryRun);
});

after(() => {
  resetFetch();
  setDryRun(originalDryRun);
  for (const key of ENV_KEYS) {
    const value = originalEnv.get(key);
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
});

test('DRY_RUN publishes fabricated results for every platform with zero fetches', async () => {
  setDryRun(true);
  const calls = makeRecorder([]);
  const draft = makeDraft('/does/not/need/to/exist.mp4', [
    'tiktok',
    'youtube-shorts',
    'instagram-reels',
    'x',
  ]);
  const originalLog = console.log;
  console.log = () => undefined;

  try {
    const results = await publish(draft, { status: 'approved' });
    assert.equal(results.length, draft.targetPlatforms.length);
    for (const result of results) {
      assert.equal(result.status, 'published');
      assert.ok(result.postId?.startsWith('dryrun-'));
    }
    assert.equal(calls.length, 0);
  } finally {
    console.log = originalLog;
  }
});

test('publishYouTube refreshes OAuth and completes a resumable upload', async () => {
  setDryRun(false);
  setEnv({
    YOUTUBE_CLIENT_ID: 'client-id',
    YOUTUBE_CLIENT_SECRET: 'client-secret',
    YOUTUBE_REFRESH_TOKEN: 'refresh-token',
  });
  delete process.env.YOUTUBE_PRIVACY_STATUS;
  delete process.env.YOUTUBE_CATEGORY_ID;
  const temp = await makeTempVideo(new Uint8Array([1, 2, 3, 4]));
  const uploadLocation = 'https://upload.youtube.test/session-1';
  const calls = makeRecorder([
    jsonResponse({ access_token: 'access-token' }),
    jsonResponse({}, { headers: { Location: uploadLocation } }),
    jsonResponse({ id: 'youtube-video-1' }),
  ]);

  try {
    const result = await publishYouTube(
      makeDraft(temp.file),
      'A title that appears on the first line\nAttribution stays here',
    );

    assert.equal(result.postId, 'youtube-video-1');
    assert.match(result.url ?? '', /\/shorts\/youtube-video-1$/);
    assert.equal(calls.length, 3);
    assert.equal(calls[0]?.url, 'https://oauth2.googleapis.com/token');
    assert.equal(calls[1]?.init?.method, 'POST');
    assert.equal(calls[2]?.url, uploadLocation, 'Location header is used for the byte upload');
    assert.equal(calls[2]?.init?.method, 'PUT');

    const initBody = JSON.parse(String(calls[1]?.init?.body)) as {
      snippet: { title: string; description: string; categoryId: string };
      status: { privacyStatus: string; selfDeclaredMadeForKids: boolean };
    };
    assert.equal(initBody.snippet.title, 'A title that appears on the first line');
    assert.match(initBody.snippet.description, /Attribution stays here\n\n#news #today$/);
    assert.equal(initBody.snippet.categoryId, '24');
    assert.deepEqual(initBody.status, {
      privacyStatus: 'private',
      selfDeclaredMadeForKids: false,
    });
  } finally {
    await rm(temp.dir, { recursive: true });
  }
});

test('publishInstagram waits for its container and returns the permalink', async () => {
  setDryRun(false);
  setEnv({
    IG_USER_ID: 'ig-user',
    IG_ACCESS_TOKEN: 'ig-token',
    PUBLIC_VIDEO_BASE_URL: 'https://cdn.example.test/clips/',
  });
  const calls = makeRecorder([
    jsonResponse({ id: 'container-1' }),
    jsonResponse({ status_code: 'IN_PROGRESS' }),
    jsonResponse({ status_code: 'FINISHED' }),
    jsonResponse({ id: 'media-1' }),
    jsonResponse({ permalink: 'https://www.instagram.com/reel/media-1/' }),
  ]);

  const result = await publishInstagram(makeDraft('/renders/my reel.mp4'), 'Edited caption', {
    pollIntervalMs: 1,
  });

  assert.equal(result.postId, 'media-1');
  assert.equal(result.url, 'https://www.instagram.com/reel/media-1/');
  assert.equal(calls.length, 5);
  const createBody = new URLSearchParams(String(calls[0]?.init?.body));
  assert.equal(createBody.get('media_type'), 'REELS');
  assert.equal(createBody.get('video_url'), 'https://cdn.example.test/clips/my%20reel.mp4');
  assert.equal(createBody.get('caption'), 'Edited caption\n\n#news #today');
  assert.match(calls[3]?.url ?? '', /\/media_publish$/);
});

test('publishInstagram rejects an ERROR container status', async () => {
  setDryRun(false);
  setEnv({
    IG_USER_ID: 'ig-user',
    IG_ACCESS_TOKEN: 'ig-token',
    PUBLIC_VIDEO_BASE_URL: 'https://cdn.example.test/clips',
  });
  const calls = makeRecorder([
    jsonResponse({ id: 'container-error' }),
    jsonResponse({ status_code: 'ERROR' }),
  ]);

  await assert.rejects(
    publishInstagram(makeDraft('/renders/clip.mp4'), 'Caption', { pollIntervalMs: 1 }),
    /status ERROR/,
  );
  assert.equal(calls.length, 2);
});

test('publishTikTok uses SELF_ONLY and uploads with the correct Content-Range', async () => {
  setDryRun(false);
  setEnv({ TIKTOK_ACCESS_TOKEN: 'tiktok-token' });
  const temp = await makeTempVideo(new Uint8Array([10, 20, 30, 40, 50]));
  const uploadUrl = 'https://upload.tiktok.test/video-1';
  const calls = makeRecorder([
    jsonResponse({
      data: { publish_id: 'publish-1', upload_url: uploadUrl },
      error: { code: 'ok' },
    }),
    new Response(null, { status: 200 }),
    jsonResponse({
      data: { status: 'PUBLISH_COMPLETE' },
      error: { code: 'ok' },
    }),
  ]);

  try {
    const result = await publishTikTok(makeDraft(temp.file), 'TikTok caption', {
      pollIntervalMs: 1,
    });

    assert.equal(result.postId, 'publish-1');
    assert.equal(calls.length, 3);
    const initBody = JSON.parse(String(calls[0]?.init?.body)) as {
      post_info: { privacy_level: string };
      source_info: { video_size: number; chunk_size: number; total_chunk_count: number };
    };
    assert.equal(initBody.post_info.privacy_level, 'SELF_ONLY');
    assert.deepEqual(initBody.source_info, {
      source: 'FILE_UPLOAD',
      video_size: 5,
      chunk_size: 5,
      total_chunk_count: 1,
    });
    assert.equal(calls[1]?.url, uploadUrl);
    assert.equal(new Headers(calls[1]?.init?.headers).get('Content-Range'), 'bytes 0-4/5');
  } finally {
    await rm(temp.dir, { recursive: true });
  }
});

test('missing environment variables reject before any platform fetch', async (t) => {
  setDryRun(false);
  for (const key of ENV_KEYS) delete process.env[key];
  const draft = makeDraft('/file/is/intentionally/missing.mp4');

  await t.test('YouTube names every missing variable', async () => {
    setDryRun(false);
    const calls = makeRecorder([]);
    await assert.rejects(publishYouTube(draft, 'Caption'), (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      assert.match(message, /YOUTUBE_CLIENT_ID/);
      assert.match(message, /YOUTUBE_CLIENT_SECRET/);
      assert.match(message, /YOUTUBE_REFRESH_TOKEN/);
      return true;
    });
    assert.equal(calls.length, 0);
  });

  await t.test('Instagram names every missing variable', async () => {
    setDryRun(false);
    const calls = makeRecorder([]);
    await assert.rejects(publishInstagram(draft, 'Caption'), (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      assert.match(message, /IG_USER_ID/);
      assert.match(message, /IG_ACCESS_TOKEN/);
      assert.match(message, /PUBLIC_VIDEO_BASE_URL/);
      return true;
    });
    assert.equal(calls.length, 0);
  });

  await t.test('TikTok names its missing variable', async () => {
    setDryRun(false);
    const calls = makeRecorder([]);
    await assert.rejects(publishTikTok(draft, 'Caption'), /TIKTOK_ACCESS_TOKEN/);
    assert.equal(calls.length, 0);
  });
});

test('live publisher modules refuse to touch the network under DRY_RUN', async () => {
  setDryRun(true);
  setEnv({
    YOUTUBE_CLIENT_ID: 'client-id',
    YOUTUBE_CLIENT_SECRET: 'client-secret',
    YOUTUBE_REFRESH_TOKEN: 'refresh-token',
    IG_USER_ID: 'ig-user',
    IG_ACCESS_TOKEN: 'ig-token',
    PUBLIC_VIDEO_BASE_URL: 'https://cdn.example.test/clips',
    TIKTOK_ACCESS_TOKEN: 'tiktok-token',
  });
  const calls = makeRecorder([]);
  const draft = makeDraft('/never/read.mp4');

  await assert.rejects(publishTikTok(draft, 'Caption'), /DRY_RUN/);
  await assert.rejects(publishYouTube(draft, 'Caption'), /DRY_RUN/);
  await assert.rejects(publishInstagram(draft, 'Caption'), /DRY_RUN/);
  assert.equal(calls.length, 0);
});

test('publishTikTok merges the remainder into the final chunk for >64MB files', async () => {
  setDryRun(false);
  setEnv({ TIKTOK_ACCESS_TOKEN: 'tiktok-token' });
  const fileSize = 65 * 1024 * 1024; // 68,157,440 bytes — above the 64MB single-chunk cap
  const chunkSize = 10_000_000;
  const temp = await makeTempVideo(new Uint8Array(fileSize));
  const uploadUrl = 'https://upload.tiktok.test/video-large';
  const calls = makeRecorder([
    jsonResponse({
      data: { publish_id: 'publish-large', upload_url: uploadUrl },
      error: { code: 'ok' },
    }),
    ...Array.from({ length: 6 }, () => new Response(null, { status: 200 })),
    jsonResponse({ data: { status: 'PUBLISH_COMPLETE' }, error: { code: 'ok' } }),
  ]);

  try {
    const result = await publishTikTok(makeDraft(temp.file), 'Large upload', {
      pollIntervalMs: 1,
    });

    assert.equal(result.postId, 'publish-large');
    assert.equal(calls.length, 8, 'init + 6 chunks + status');
    const initBody = JSON.parse(String(calls[0]?.init?.body)) as {
      source_info: { video_size: number; chunk_size: number; total_chunk_count: number };
    };
    assert.deepEqual(initBody.source_info, {
      source: 'FILE_UPLOAD',
      video_size: fileSize,
      chunk_size: chunkSize,
      total_chunk_count: 6, // floor(fileSize / chunkSize) — NOT ceil
    });

    for (let index = 0; index < 5; index += 1) {
      const start = index * chunkSize;
      assert.equal(
        new Headers(calls[index + 1]?.init?.headers).get('Content-Range'),
        `bytes ${start}-${start + chunkSize - 1}/${fileSize}`,
        `non-final chunk ${index} is exactly chunk_size`,
      );
    }
    assert.equal(
      new Headers(calls[6]?.init?.headers).get('Content-Range'),
      `bytes ${5 * chunkSize}-${fileSize - 1}/${fileSize}`,
      'final chunk absorbs the remainder',
    );
    assert.equal((calls[6]?.init?.body as Uint8Array).length, fileSize - 5 * chunkSize);
  } finally {
    await rm(temp.dir, { recursive: true });
  }
});

test('publish re-appends required attribution to a human-edited caption', async () => {
  setDryRun(false);
  setEnv({
    YOUTUBE_CLIENT_ID: 'client-id',
    YOUTUBE_CLIENT_SECRET: 'client-secret',
    YOUTUBE_REFRESH_TOKEN: 'refresh-token',
  });
  const temp = await makeTempVideo(new Uint8Array([9, 9, 9]));
  const attributionText = 'Source: Example Creator (CC BY)';
  const draft: ClipDraft = {
    ...makeDraft(temp.file, ['youtube-shorts']),
    caption: `Original caption\n\n${attributionText}`,
    license: {
      type: 'cc-by',
      requiresAttribution: true,
      attributionText,
      commercialUse: true,
      sourceUrl: 'https://example.test/license',
    },
  };
  const calls = makeRecorder([
    jsonResponse({ access_token: 'access-token' }),
    jsonResponse({}, { headers: { Location: 'https://upload.youtube.test/attributed' } }),
    jsonResponse({ id: 'attributed-video' }),
  ]);

  try {
    const results = await publish(draft, {
      status: 'approved',
      editedCaption: 'Human replacement caption',
    });

    assert.equal(results[0]?.status, 'published');
    const initBody = JSON.parse(String(calls[1]?.init?.body)) as {
      snippet: { description: string };
    };
    assert.match(
      initBody.snippet.description,
      /^Human replacement caption\n\nSource: Example Creator \(CC BY\)/,
      'edited caption keeps the required attribution',
    );
  } finally {
    await rm(temp.dir, { recursive: true });
  }
});

test('publish records an adapter failure and continues to the next platform', async () => {
  setDryRun(false);
  setEnv({
    YOUTUBE_CLIENT_ID: 'client-id',
    YOUTUBE_CLIENT_SECRET: 'client-secret',
    YOUTUBE_REFRESH_TOKEN: 'refresh-token',
  });
  const temp = await makeTempVideo(new Uint8Array([1, 2, 3]));
  const calls = makeRecorder([
    jsonResponse({ access_token: 'access-token' }),
    jsonResponse({}, { headers: { Location: 'https://upload.youtube.test/continued' } }),
    jsonResponse({ id: 'continued-video' }),
  ]);
  const errors: unknown[][] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args);
  };

  try {
    const results = await publish(makeDraft(temp.file, ['x', 'youtube-shorts']), {
      status: 'approved',
    });

    assert.equal(results[0]?.platform, 'x');
    assert.equal(results[0]?.status, 'error');
    assert.match(results[0]?.error ?? '', /not implemented/);
    assert.equal(results[1]?.platform, 'youtube-shorts');
    assert.equal(results[1]?.status, 'published');
    assert.equal(results[1]?.postId, 'continued-video');
    assert.equal(calls.length, 3, 'the YouTube adapter ran after X failed');
    assert.equal(errors[0]?.[0], '[publish:x] FAILED:');
  } finally {
    console.error = originalError;
    setDryRun(originalDryRun);
    await rm(temp.dir, { recursive: true });
  }
});
