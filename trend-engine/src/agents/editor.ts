/**
 * Editor agent — turns a topic + a licensed source clip into a platform-ready
 * draft: the rendered file, a caption, and hashtags.
 *
 * Two responsibilities:
 *   1. Copywriting (Claude): platform-native caption + hashtags for the angle.
 *   2. Rendering (ffmpeg): cut, reframe to 9:16, burn captions, add the
 *      attribution card when the license requires it.
 *
 * The ffmpeg step is stubbed — in DRY_RUN it just records the command it would
 * run. Wiring in real ffmpeg is a focused, well-isolated follow-up.
 */

import { config } from '../config.js';
import { structured } from '../llm.js';
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

/**
 * Build the ffmpeg command we'd run to produce a 9:16 captioned clip with an
 * attribution card when required. Returns the command string; execution is
 * gated on DRY_RUN.
 */
function renderCommand(candidate: SourceClipCandidate, outputPath: string): string {
  const attribution = candidate.license.requiresAttribution
    ? `,drawtext=text='${candidate.license.attributionText ?? ''}':x=(w-tw)/2:y=h-80:fontsize=18:fontcolor=white`
    : '';
  return (
    `ffmpeg -i "${candidate.url}" ` +
    `-vf "scale=1080:-2,crop=1080:1920${attribution}" ` +
    `-t 30 -c:a aac "${outputPath}"`
  );
}

export async function draftClip(
  topic: Topic,
  candidate: SourceClipCandidate,
  platforms: Platform[] = config.publishing.defaultPlatforms,
  aspectRatio: AspectRatio = '9:16',
): Promise<ClipDraft> {
  const copy = await writeCopy(topic);
  const outputPath = `${config.dataDir}clips/${candidate.id}.mp4`;
  const cmd = renderCommand(candidate, outputPath);

  if (config.dryRun) {
    console.log(`   [editor] would render → ${cmd}`);
  } else {
    // Real path: exec ffmpeg here (child_process.spawn), ensuring the output
    // dir exists first. Left unimplemented so live mode can't silently ship a
    // half-rendered file — wire this in explicitly when you go live.
    throw new Error('Live rendering not implemented — plug ffmpeg exec into editor.draftClip()');
  }

  return {
    id: `draft-${candidate.id}`,
    topicId: topic.id,
    sourceCandidateId: candidate.id,
    outputPath,
    aspectRatio,
    caption: copy.caption,
    hashtags: copy.hashtags,
    targetPlatforms: platforms,
    license: candidate.license,
  };
}
