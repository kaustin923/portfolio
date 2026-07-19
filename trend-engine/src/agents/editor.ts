/**
 * Editor agent — turns a topic + a licensed source clip into a platform-ready
 * draft: the rendered file, a caption, and hashtags.
 *
 * Two responsibilities:
 *   1. Copywriting (Claude): platform-native caption + hashtags for the angle.
 *   2. Rendering (ffmpeg): download, cut, reframe to the requested aspect, and add a
 *      capability-gated attribution card when the license requires it.
 */

import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, extname } from 'node:path';

import { config } from '../config.js';
import { structured } from '../llm.js';
import { buildTimedAss, escapeFilterFilename } from '../media/captions.js';
import {
  detectCapabilities,
  dimensionsFor,
  downloadToFile,
  probe,
  renderToVertical,
  runFfmpeg,
} from '../media/ffmpeg.js';
import { acquireCaptionCues, synthesizeVoiceover } from '../media/tts.js';
import type { AspectRatio, ClipDraft, Platform, SourceClipCandidate, Topic } from '../types.js';

const SYSTEM = `You write short-form video captions for TikTok / Reels / Shorts.
Given a topic and the intended angle, write:
- caption: 1–2 punchy lines, hook-first, no clickbait lies, platform-native voice
- hashtags: 3–6 relevant, non-spammy tags (no leading #, lowercase)
Keep it truthful to the angle. If the angle is an explainer, make the caption teach.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    caption: { type: 'string' },
    hashtags: { type: 'array', items: { type: 'string' } },
  },
  required: ['caption', 'hashtags'],
} as const;

const ORIGINAL_SYSTEM = `You write fully original short-form video narration and platform copy.
Given a topic and intended angle, write:
- script: a truthful 20–60 second narration in plain spoken sentences, with no stage directions
- caption: 1–2 punchy hook-first lines that accurately represent the narration
- hashtags: 3–6 relevant, non-spammy tags (no leading #, lowercase)`;

const ORIGINAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    script: {
      type: 'string',
      description: 'A 20–60 second narration in plain sentences with no stage directions.',
    },
    caption: { type: 'string' },
    hashtags: { type: 'array', items: { type: 'string' } },
  },
  required: ['script', 'caption', 'hashtags'],
} as const;

const VERTICAL_PLATFORMS: ReadonlySet<Platform> = new Set([
  'tiktok',
  'youtube-shorts',
  'instagram-reels',
]);

function validateAspectRatio(platforms: Platform[], aspectRatio: AspectRatio): void {
  if (aspectRatio !== '9:16' && platforms.some((platform) => VERTICAL_PLATFORMS.has(platform))) {
    throw new Error(
      `Vertical platforms (tiktok, youtube-shorts, instagram-reels) require a 9:16 aspect ratio; received ${aspectRatio}.`,
    );
  }
}

async function writeCopy(topic: Topic): Promise<{ caption: string; hashtags: string[] }> {
  return structured({
    system: SYSTEM,
    user: `Topic: ${topic.title}
Angle: ${topic.suggestedAngle}
Why it's trending: ${topic.whyTrending}
Domains: ${topic.domains.join(', ')}`,
    schema: SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 1000,
  });
}

async function writeOriginalCopy(
  topic: Topic,
): Promise<{ script: string; caption: string; hashtags: string[] }> {
  // The DRY_RUN CLI never invokes the original path yet, so makeMockLLM does
  // not need to cover this schema; tests inject the complete response instead.
  return structured({
    system: ORIGINAL_SYSTEM,
    user: `Topic: ${topic.title}
Angle: ${topic.suggestedAngle}
Why it's trending: ${topic.whyTrending}
Domains: ${topic.domains.join(', ')}`,
    schema: ORIGINAL_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 1400,
  });
}

async function localFileExists(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function resolveInput(candidate: SourceClipCandidate): Promise<string> {
  if (/^https?:\/\//i.test(candidate.url)) {
    const extension = extname(new URL(candidate.url).pathname) || '.mp4';
    const cachePath = `${config.dataDir}cache/${candidate.id}${extension}`;
    await downloadToFile(candidate.url, cachePath);
    return cachePath;
  }

  if (await localFileExists(candidate.url)) return candidate.url;

  throw new Error(`Cannot render candidate ${candidate.id}: unfetchable url "${candidate.url}"`);
}

export async function draftClip(
  topic: Topic,
  candidate: SourceClipCandidate,
  platforms: Platform[] = config.publishing.defaultPlatforms,
  aspectRatio: AspectRatio = '9:16',
): Promise<ClipDraft> {
  validateAspectRatio(platforms, aspectRatio);
  const copy = await writeCopy(topic);
  const outputPath = `${config.dataDir}clips/${candidate.id}.mp4`;
  const attributionText = candidate.license.requiresAttribution
    ? candidate.license.attributionText
    : undefined;
  const caption = candidate.license.requiresAttribution
    ? `${copy.caption}\n\n${attributionText ?? ''}`
    : copy.caption;
  const maxSec = Math.max(
    1,
    Math.min(candidate.durationSec || config.editor.maxClipSec, config.editor.maxClipSec),
  );

  if (config.dryRun) {
    let attributionMode = 'none';
    if (candidate.license.requiresAttribution) {
      const capabilities = await detectCapabilities();
      attributionMode =
        capabilities.drawtext || capabilities.subtitles
          ? 'burned + description'
          : 'description-only';
    }
    console.log(
      `   [editor] would render input=${candidate.url} output=${outputPath} maxSec=${Math.min(maxSec, 179)} attribution=${attributionMode}`,
    );
  } else {
    const inputPath = await resolveInput(candidate);
    await mkdir(dirname(outputPath), { recursive: true });
    await renderToVertical({
      inputPath,
      outputPath,
      maxSec,
      aspectRatio,
      caption: copy.caption,
      attributionText,
    });

    const capabilities = await detectCapabilities();
    if (
      candidate.license.requiresAttribution &&
      !capabilities.drawtext &&
      !capabilities.subtitles
    ) {
      console.warn(
        '   [editor] ffmpeg drawtext is unavailable; attribution is description-only until a libass ffmpeg is installed.',
      );
    }
  }

  return {
    id: `draft-${candidate.id}`,
    topicId: topic.id,
    sourceCandidateId: candidate.id,
    outputPath,
    aspectRatio,
    caption,
    hashtags: copy.hashtags,
    targetPlatforms: platforms,
    license: candidate.license,
  };
}

const ORIGINAL_BROLL_LICENSES = new Set(['stock', 'cc0', 'public-domain']);

function eligibleOriginalBroll(candidate: SourceClipCandidate): boolean {
  return (
    candidate.license.commercialUse === true &&
    candidate.license.requiresAttribution === false &&
    ORIGINAL_BROLL_LICENSES.has(candidate.license.type)
  );
}

async function assembleOriginalVideo(opts: {
  inputPaths: string[];
  audioPath: string;
  outputPath: string;
  durationSec: number;
  aspectRatio: AspectRatio;
  assPath: string;
  burnCaptions: boolean;
}): Promise<void> {
  if (!Number.isFinite(opts.durationSec) || opts.durationSec <= 0) {
    throw new Error(`Voiceover has invalid duration: ${opts.durationSec}`);
  }

  const { width, height } = dimensionsFor(opts.aspectRatio);
  const segmentDurationSec = opts.durationSec / opts.inputPaths.length;
  const args = ['-y'];
  for (const inputPath of opts.inputPaths) {
    args.push('-stream_loop', '-1', '-t', String(segmentDurationSec), '-i', inputPath);
  }
  args.push('-i', opts.audioPath);

  const filters = opts.inputPaths.map(
    (_inputPath, index) =>
      `[${index}:v:0]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,fps=30,trim=duration=${segmentDurationSec},setpts=PTS-STARTPTS[segment${index}]`,
  );
  let videoLabel: string;
  if (opts.inputPaths.length === 1) {
    videoLabel = 'segment0';
  } else {
    const inputs = opts.inputPaths.map((_inputPath, index) => `[segment${index}]`).join('');
    filters.push(`${inputs}concat=n=${opts.inputPaths.length}:v=1:a=0[joined]`);
    videoLabel = 'joined';
  }

  if (opts.burnCaptions) {
    filters.push(`[${videoLabel}]subtitles=${escapeFilterFilename(opts.assPath)}[captioned]`);
    videoLabel = 'captioned';
  }

  args.push(
    '-filter_complex',
    filters.join(';'),
    '-map',
    `[${videoLabel}]`,
    '-map',
    `${opts.inputPaths.length}:a:0`,
    '-t',
    String(opts.durationSec),
    '-shortest',
    '-c:v',
    'libx264',
    '-profile:v',
    'high',
    '-preset',
    'medium',
    '-crf',
    '20',
    '-maxrate',
    '12M',
    '-bufsize',
    '24M',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-ar',
    '48000',
    '-ac',
    '2',
    '-movflags',
    '+faststart',
    opts.outputPath,
  );

  await runFfmpeg(args);
  const output = await probe(opts.outputPath);
  if (
    output.width !== width ||
    output.height !== height ||
    output.videoCodec !== 'h264' ||
    output.durationSec <= 0 ||
    !output.hasAudio
  ) {
    throw new Error(
      `Rendered original failed verification: expected ${width}x${height} h264 with audio and positive duration, got ${output.width}x${output.height} ${output.videoCodec} audio=${output.hasAudio} ${output.durationSec}s`,
    );
  }
}

/** Build a fully original draft from defensibly licensed, attribution-free b-roll. */
export async function draftOriginal(
  topic: Topic,
  broll: SourceClipCandidate[],
  platforms: Platform[] = config.publishing.defaultPlatforms,
  aspectRatio: AspectRatio = '9:16',
): Promise<ClipDraft> {
  validateAspectRatio(platforms, aspectRatio);
  const eligibleBroll = broll.filter(eligibleOriginalBroll);
  if (eligibleBroll.length === 0) {
    throw new Error(
      'Original drafts require commercial-use stock, CC0, or public-domain b-roll with no attribution requirement.',
    );
  }

  const copy = await writeOriginalCopy(topic);
  const primary = eligibleBroll[0]!;
  const outBasePath = `${config.dataDir}clips/original-${topic.id}`;
  const outputPath = `${outBasePath}.mp4`;
  const draft: ClipDraft = {
    id: `draft-original-${topic.id}`,
    topicId: topic.id,
    sourceCandidateId: primary.id,
    outputPath,
    aspectRatio,
    caption: copy.caption,
    hashtags: copy.hashtags,
    targetPlatforms: platforms,
    license: {
      type: 'original',
      requiresAttribution: false,
      commercialUse: true,
      sourceUrl: primary.pageUrl ?? primary.license.sourceUrl,
    },
    syntheticMedia: true,
  };

  if (config.dryRun) {
    console.log(
      `[editor] would synthesize voiceover + assemble ${eligibleBroll.length} b-roll clips → ${outputPath}`,
    );
    return draft;
  }

  await mkdir(dirname(outputPath), { recursive: true });
  const voiceover = await synthesizeVoiceover(copy.script, outBasePath);
  if (!voiceover) {
    const inputPath = await resolveInput(primary);
    const maxSec = Math.max(
      1,
      Math.min(primary.durationSec || config.editor.maxClipSec, config.editor.maxClipSec),
    );
    await renderToVertical({
      inputPath,
      outputPath,
      maxSec,
      aspectRatio,
      caption: copy.caption,
    });
    // No narration was synthesized, so this is NOT an original: keep the
    // b-roll's real license (which routes it through human review) and do not
    // claim synthetic media.
    console.warn(
      '[editor] voiceover unavailable; falling back to captioned b-roll under its original license.',
    );
    return { ...draft, license: primary.license, syntheticMedia: false };
  }

  const cues = await acquireCaptionCues(
    copy.script,
    voiceover.audioPath,
    voiceover.durationSec,
    `${outBasePath}.whisper`,
  );
  const assPath = `${outputPath}.ass`;
  await writeFile(assPath, buildTimedAss(cues, undefined, voiceover.durationSec));

  const inputPaths = await Promise.all(eligibleBroll.map(resolveInput));
  const capabilities = await detectCapabilities();
  if (!capabilities.subtitles) {
    console.warn(
      '[editor] ffmpeg subtitles are unavailable; timed captions remain in the platform caption text only.',
    );
  }
  await assembleOriginalVideo({
    inputPaths,
    audioPath: voiceover.audioPath,
    outputPath,
    durationSec: voiceover.durationSec,
    aspectRatio,
    assPath,
    burnCaptions: capabilities.subtitles,
  });

  return draft;
}
