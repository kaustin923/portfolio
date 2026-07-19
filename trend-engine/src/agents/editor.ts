/**
 * Editor agent — turns a topic + a licensed source clip into a platform-ready
 * draft: the rendered file, a caption, and hashtags.
 *
 * Two responsibilities:
 *   1. Copywriting (Claude): platform-native caption + hashtags for the angle.
 *   2. Rendering (ffmpeg): trim to ≤30s, reframe to the target aspect ratio,
 *      burn the caption on-screen, and add an attribution card when the
 *      license requires it.
 *
 * The ffmpeg command is built by the pure {@link buildFfmpegArgs} helper (unit
 * -testable without ffmpeg installed). Execution is gated on DRY_RUN: in dry
 * mode we only log the argv we would run; in live mode we download http(s)
 * sources to a temp file, spawn ffmpeg (argv form, no shell), and fail loudly
 * on any non-zero exit.
 */

import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { config } from '../config.js';
import { structured } from '../llm.js';
import type {
  AspectRatio,
  ClipDraft,
  LicenseInfo,
  Platform,
  SourceClipCandidate,
  Topic,
} from '../types.js';

// ────────────────────────────────────────────────────────────────────────────
// Copywriting (Claude via the injectable LLM)
// ────────────────────────────────────────────────────────────────────────────

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

// ────────────────────────────────────────────────────────────────────────────
// ffmpeg command construction (pure — unit-testable without ffmpeg)
// ────────────────────────────────────────────────────────────────────────────

/** Hard ceiling for short-form platforms; every render trims to ≤ this. */
export const MAX_CLIP_SECONDS = 30;

export interface RenderOptions {
  aspectRatio: AspectRatio;
  /** Caption to burn on-screen (word-wrapped automatically). */
  caption: string;
  /** Drives the attribution card when `requiresAttribution` is set. */
  license: LicenseInfo;
  /** Source duration if known — the trim is min(MAX_CLIP_SECONDS, this). */
  sourceDurationSec?: number;
}

/** Output dimensions for each supported aspect ratio. */
export function dimensionsFor(aspect: AspectRatio): { width: number; height: number } {
  switch (aspect) {
    case '9:16':
      return { width: 1080, height: 1920 };
    case '1:1':
      return { width: 1080, height: 1080 };
    case '16:9':
      return { width: 1920, height: 1080 };
  }
}

/**
 * Escape arbitrary text for use as a drawtext `text=` value inside a `-vf`
 * filtergraph passed as a single argv element (no shell involved).
 *
 * Two parsers see this string, in order:
 *   1. The filtergraph parser — handled by wrapping the value in single
 *      quotes (which makes `:` `,` `;` `[` `]` literal) and splicing any
 *      embedded `'` out as `'\''` (close quote, escaped quote, reopen).
 *   2. drawtext's own text expansion — a literal `\` must be doubled and a
 *      literal `%` escaped (else `%{...}` sequences would expand).
 */
export function escapeDrawtextText(text: string): string {
  const drawtextLevel = text.replace(/\\/g, '\\\\').replace(/%/g, '\\%');
  return `'${drawtextLevel.replace(/'/g, "'\\''")}'`;
}

/**
 * Greedy word-wrap. drawtext has no auto-wrap, so we insert real newline
 * characters (rendered as line breaks) before escaping. Words longer than the
 * limit are hard-broken so nothing can overflow the frame.
 */
export function wrapText(text: string, maxCharsPerLine: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    let w = word;
    while (w.length > maxCharsPerLine) {
      if (line) {
        lines.push(line);
        line = '';
      }
      lines.push(w.slice(0, maxCharsPerLine));
      w = w.slice(maxCharsPerLine);
    }
    if (!w) continue;
    if (!line) line = w;
    else if (line.length + 1 + w.length <= maxCharsPerLine) line = `${line} ${w}`;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines.join('\n');
}

/**
 * Build the full ffmpeg argv (no shell string!) that renders `input` into a
 * platform-ready clip at `output`:
 *
 *   - scale-to-cover + center-crop to the target aspect ratio
 *   - trim to ≤ {@link MAX_CLIP_SECONDS}
 *   - burn the (wrapped) caption via drawtext
 *   - burn an attribution card at the bottom when the license requires it
 *
 * Pure: safe to call anywhere, including DRY_RUN and unit tests.
 */
export function buildFfmpegArgs(input: string, output: string, opts: RenderOptions): string[] {
  const { width, height } = dimensionsFor(opts.aspectRatio);
  const trimSec = Math.max(
    1,
    Math.min(MAX_CLIP_SECONDS, Math.floor(opts.sourceDurationSec ?? MAX_CLIP_SECONDS)),
  );

  const filters: string[] = [
    // Cover-fit: upscale the short side to fill, then center-crop the excess.
    `scale=${width}:${height}:force_original_aspect_ratio=increase`,
    `crop=${width}:${height}`,
    'setsar=1',
  ];

  const captionFontSize = Math.round(width * 0.045);
  const maxChars = Math.max(12, Math.floor((width * 0.9) / (captionFontSize * 0.55)));
  const caption = wrapText(opts.caption, maxChars);
  if (caption) {
    filters.push(
      'drawtext=' +
        [
          `text=${escapeDrawtextText(caption)}`,
          `fontsize=${captionFontSize}`,
          'fontcolor=white',
          'x=(w-text_w)/2',
          'y=h*0.72',
          'box=1',
          'boxcolor=black@0.55',
          'boxborderw=18',
          'line_spacing=10',
        ].join(':'),
    );
  }

  if (opts.license.requiresAttribution) {
    const attributionRaw =
      opts.license.attributionText?.trim() || `Source: ${opts.license.sourceUrl}`;
    const attributionFontSize = Math.round(width * 0.022);
    filters.push(
      'drawtext=' +
        [
          `text=${escapeDrawtextText(attributionRaw)}`,
          `fontsize=${attributionFontSize}`,
          'fontcolor=white@0.9',
          'x=(w-text_w)/2',
          `y=h-${attributionFontSize * 3}`,
          'box=1',
          'boxcolor=black@0.6',
          'boxborderw=10',
        ].join(':'),
    );
  }

  return [
    '-y',
    '-i',
    input,
    '-t',
    String(trimSec),
    '-vf',
    filters.join(','),
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    output,
  ];
}

// ────────────────────────────────────────────────────────────────────────────
// Live rendering (only reached when !config.dryRun)
// ────────────────────────────────────────────────────────────────────────────

/** Fails fast, with install hints, if ffmpeg is not on PATH. */
async function assertFfmpegAvailable(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('ffmpeg', ['-version'], { stdio: 'ignore' });
    proc.on('error', (err: NodeJS.ErrnoException) => {
      reject(
        err.code === 'ENOENT'
          ? new Error(
              'ffmpeg not found on PATH — the editor cannot render in live mode. ' +
                'Install it (Debian/Ubuntu: `apt-get install ffmpeg`, macOS: `brew install ffmpeg`) ' +
                'or set DRY_RUN=true.',
            )
          : err,
      );
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg is present but \`ffmpeg -version\` exited with code ${code}`));
    });
  });
}

/** Download an http(s) source clip to a temp file; returns the local path. */
async function downloadToTemp(url: string, candidateId: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download source clip (HTTP ${res.status} ${res.statusText}): ${url}`);
  }
  const ext = extname(new URL(url).pathname) || '.mp4';
  const tmpPath = join(tmpdir(), `trend-engine-src-${candidateId}-${Date.now()}${ext}`);
  const body = Readable.fromWeb(res.body as unknown as import('node:stream/web').ReadableStream);
  await pipeline(body, createWriteStream(tmpPath));
  return tmpPath;
}

/** Spawn ffmpeg (argv form, no shell) and reject with stderr tail on failure. */
async function runFfmpeg(args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > 16_384) stderr = stderr.slice(-16_384); // keep the tail
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else {
        const tail = stderr.trim().split('\n').slice(-12).join('\n');
        reject(new Error(`ffmpeg exited with code ${code ?? '(killed)'}:\n${tail}`));
      }
    });
  });
}

/** Live render: resolve the input (download if remote), run ffmpeg, clean up. */
async function renderLive(
  candidate: SourceClipCandidate,
  outputPath: string,
  opts: RenderOptions,
): Promise<void> {
  if (candidate.url.startsWith('generated://')) {
    throw new Error(
      `Cannot render "${candidate.url}": generated-original render pipeline not implemented. ` +
        'AI b-roll must actually be produced (TTS + generated visuals) before the editor can cut it — ' +
        'refusing to fake it.',
    );
  }

  await assertFfmpegAvailable();
  await mkdir(dirname(outputPath), { recursive: true });

  let inputPath = candidate.url;
  let tempPath: string | null = null;
  if (/^https?:\/\//i.test(candidate.url)) {
    tempPath = await downloadToTemp(candidate.url, candidate.id);
    inputPath = tempPath;
  }

  try {
    await runFfmpeg(buildFfmpegArgs(inputPath, outputPath, opts));
  } finally {
    if (tempPath) await rm(tempPath, { force: true });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Agent entry point
// ────────────────────────────────────────────────────────────────────────────

export async function draftClip(
  topic: Topic,
  candidate: SourceClipCandidate,
  platforms: Platform[] = config.publishing.defaultPlatforms,
  aspectRatio: AspectRatio = '9:16',
): Promise<ClipDraft> {
  const copy = await writeCopy(topic);
  const outputPath = join(config.dataDir, 'clips', `${candidate.id}.mp4`);
  const renderOpts: RenderOptions = {
    aspectRatio,
    caption: copy.caption,
    license: candidate.license,
    sourceDurationSec: candidate.durationSec,
  };

  if (config.dryRun) {
    const args = buildFfmpegArgs(candidate.url, outputPath, renderOpts);
    console.log(`   [editor] would render → ffmpeg ${args.join(' ')}`);
  } else {
    await renderLive(candidate, outputPath, renderOpts);
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
