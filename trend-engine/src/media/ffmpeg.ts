import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { config } from '../config.js';
import type { AspectRatio } from '../types.js';
import { buildAss, escapeDrawtext, SAFE_AREA, wrapText } from './captions.js';

interface ProcessResult {
  stdout: string;
  stderr: string;
}

interface ProbeJson {
  streams?: Array<{
    codec_type?: string;
    codec_name?: string;
    width?: number;
    height?: number;
    duration?: string;
  }>;
  format?: { duration?: string };
}

function spawnProcess(bin: string, args: string[]): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });

    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      const detail = stderr.slice(-2000);
      const status = code == null ? `signal ${signal ?? 'unknown'}` : `code ${code}`;
      reject(new Error(`${bin} exited with ${status}${detail ? `:\n${detail}` : ''}`));
    });
  });
}

function isMissingBinary(error: unknown): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT';
}

async function runTool(
  tool: 'ffmpeg' | 'ffprobe',
  primaryBin: string,
  fallbackBin: string,
  args: string[],
): Promise<ProcessResult> {
  try {
    return await spawnProcess(primaryBin, args);
  } catch (error) {
    if (!isMissingBinary(error)) throw error;
  }

  if (primaryBin !== fallbackBin) {
    try {
      return await spawnProcess(fallbackBin, args);
    } catch (error) {
      if (!isMissingBinary(error)) throw error;
    }
  }

  const envName = tool === 'ffmpeg' ? 'FFMPEG_PATH' : 'FFPROBE_PATH';
  throw new Error(`${tool} not found — install ${tool} or set ${envName}`);
}

export async function runFfmpeg(
  args: string[],
  opts: { bin?: string } = {},
): Promise<{ stderr: string }> {
  const result = await runTool(
    'ffmpeg',
    opts.bin ?? config.ffmpegPath,
    '/opt/homebrew/bin/ffmpeg',
    args,
  );
  return { stderr: result.stderr };
}

export async function probe(filePath: string): Promise<{
  width: number;
  height: number;
  durationSec: number;
  videoCodec: string;
  hasAudio: boolean;
}> {
  const result = await runTool(
    'ffprobe',
    config.ffprobePath,
    '/opt/homebrew/bin/ffprobe',
    ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', filePath],
  );

  let parsed: ProbeJson;
  try {
    parsed = JSON.parse(result.stdout) as ProbeJson;
  } catch (error) {
    throw new Error(`Invalid ffprobe output for ${filePath}`, { cause: error });
  }

  const video = parsed.streams?.find((stream) => stream.codec_type === 'video');
  if (!video) throw new Error(`ffprobe found no video stream in ${filePath}`);

  const duration = Number(parsed.format?.duration ?? video.duration ?? 0);
  return {
    width: Number(video.width ?? 0),
    height: Number(video.height ?? 0),
    durationSec: Number.isFinite(duration) ? duration : 0,
    videoCodec: video.codec_name ?? '',
    hasAudio: parsed.streams?.some((stream) => stream.codec_type === 'audio') ?? false,
  };
}

export interface FfmpegCapabilities {
  drawtext: boolean;
  subtitles: boolean;
}

let capabilitiesPromise: Promise<FfmpegCapabilities> | undefined;

export function detectCapabilities(): Promise<FfmpegCapabilities> {
  capabilitiesPromise ??= runTool(
    'ffmpeg',
    config.ffmpegPath,
    '/opt/homebrew/bin/ffmpeg',
    ['-hide_banner', '-filters'],
  ).then(({ stdout, stderr }) => {
    const filters = `${stdout}\n${stderr}`;
    return {
      drawtext: filters.includes(' drawtext '),
      subtitles: filters.includes(' subtitles '),
    };
  });
  return capabilitiesPromise;
}

export async function downloadToFile(url: string, destPath: string): Promise<void> {
  await mkdir(dirname(destPath), { recursive: true });
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed (${response.status}) for ${url}`);
  }

  await pipeline(
    Readable.fromWeb(response.body as ReadableStream),
    createWriteStream(destPath),
  );
}

export function dimensionsFor(aspectRatio: AspectRatio): { width: number; height: number } {
  switch (aspectRatio) {
    case '9:16':
      return { width: 1080, height: 1920 };
    case '1:1':
      return { width: 1080, height: 1080 };
    case '16:9':
      return { width: 1920, height: 1080 };
  }
}

export async function renderToVertical(opts: {
  inputPath: string;
  outputPath: string;
  maxSec: number;
  aspectRatio?: AspectRatio;
  caption?: string;
  attributionText?: string;
}): Promise<void> {
  const input = await probe(opts.inputPath);
  const { width, height } = dimensionsFor(opts.aspectRatio ?? '9:16');
  const filterParts = [
    `scale=${width}:${height}:force_original_aspect_ratio=increase`,
    `crop=${width}:${height}`,
    'setsar=1',
    'fps=30',
  ];
  const capabilities = await detectCapabilities();
  let captionTextPath: string | undefined;
  let attributionHandledByAss = false;

  if (opts.caption && capabilities.subtitles) {
    const assPath = `${opts.outputPath}.ass`;
    await writeFile(assPath, buildAss(opts.caption, opts.attributionText, opts.maxSec));
    filterParts.push(`subtitles=${escapeDrawtext(assPath)}`);
    attributionHandledByAss = opts.attributionText !== undefined;
  } else if (opts.caption && capabilities.drawtext) {
    const fontsize = Math.round(width * 0.045);
    const maxChars = Math.max(12, Math.floor((width * 0.9) / (fontsize * 0.55)));
    captionTextPath = `${opts.outputPath}.caption.txt`;
    await writeFile(captionTextPath, wrapText(opts.caption, maxChars).join('\n'));
    filterParts.push(
      `drawtext=textfile=${escapeDrawtext(captionTextPath)}:x=(w-tw)/2:y=h*0.72:fontsize=${fontsize}:fontcolor=white:borderw=2:bordercolor=black:box=1:boxcolor=black@0.55:line_spacing=10`,
    );
  } else if (opts.caption) {
    console.warn('[editor] ffmpeg subtitles and drawtext are unavailable; caption cannot be burned in.');
  }

  if (
    opts.attributionText !== undefined &&
    capabilities.drawtext &&
    !attributionHandledByAss
  ) {
    filterParts.push(
      `drawtext=text=${escapeDrawtext(opts.attributionText)}:x=(w-tw)/2:y=h-${SAFE_AREA.bottomMarginPx}:fontsize=36:fontcolor=white:borderw=2:bordercolor=black`,
    );
  }

  const args = ['-y', '-i', opts.inputPath];
  if (!input.hasAudio) {
    args.push(
      '-f',
      'lavfi',
      '-i',
      'anullsrc=channel_layout=stereo:sample_rate=48000',
      '-shortest',
      '-map',
      '0:v:0',
      '-map',
      '1:a:0',
    );
  }

  args.push(
    '-vf',
    filterParts.join(','),
    '-t',
    String(Math.min(opts.maxSec, 179)),
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

  try {
    await runFfmpeg(args);
  } finally {
    if (captionTextPath) {
      try {
        await unlink(captionTextPath);
      } catch (error) {
        console.warn('[editor] failed to remove temporary caption file:', error);
      }
    }
  }

  const output = await probe(opts.outputPath);
  if (
    output.width !== width ||
    output.height !== height ||
    output.videoCodec !== 'h264' ||
    output.durationSec <= 0
  ) {
    throw new Error(
      `Rendered output failed verification: expected ${width}x${height} h264 with positive duration, got ${output.width}x${output.height} ${output.videoCodec} ${output.durationSec}s`,
    );
  }
}
