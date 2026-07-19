/**
 * Editor agent — turns a topic + a licensed source clip into a platform-ready
 * draft: the rendered file, a caption, and hashtags.
 *
 * Two responsibilities:
 *   1. Copywriting (Claude): platform-native caption + hashtags for the angle.
 *   2. Rendering (ffmpeg): download, cut, reframe to 9:16, and add a
 *      capability-gated attribution card when the license requires it.
 */

import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, extname } from 'node:path';

import { config } from '../config.js';
import { structured } from '../llm.js';
import { buildAss } from '../media/captions.js';
import { detectCapabilities, downloadToFile, renderToVertical } from '../media/ffmpeg.js';
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
  const copy = await writeCopy(topic);
  const outputPath = `${config.dataDir}clips/${candidate.id}.mp4`;
  const attributionText = candidate.license.requiresAttribution
    ? candidate.license.attributionText
    : undefined;
  const caption = candidate.license.requiresAttribution
    ? `${copy.caption}\n\n${attributionText ?? ''}`
    : copy.caption;
  const maxSec = Math.min(
    candidate.durationSec || config.editor.maxClipSec,
    config.editor.maxClipSec,
  );

  if (config.dryRun) {
    const attributionMode = candidate.license.requiresAttribution
      ? (await detectCapabilities()).drawtext
        ? 'burned + description'
        : 'description-only'
      : 'none';
    console.log(
      `   [editor] would render input=${candidate.url} output=${outputPath} maxSec=${Math.min(maxSec, 179)} attribution=${attributionMode}`,
    );
  } else {
    const inputPath = await resolveInput(candidate);
    await mkdir(dirname(outputPath), { recursive: true });
    await renderToVertical({ inputPath, outputPath, maxSec, attributionText });
    await writeFile(`${outputPath}.ass`, buildAss(copy.caption, attributionText, maxSec));

    if (candidate.license.requiresAttribution && !(await detectCapabilities()).drawtext) {
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
