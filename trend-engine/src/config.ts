/**
 * Central configuration. Everything is env-driven so the same code runs in
 * DRY_RUN (mocked APIs, nothing published) and in live mode.
 *
 * DRY_RUN is the default on purpose: this system touches money, other people's
 * copyrights, and public social accounts. You should have to *opt in* to doing
 * anything real.
 */

import { sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Platform } from './types.js';

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v == null) return fallback;
  return /^(1|true|yes|on)$/i.test(v);
}

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function list<T extends string>(name: string, fallback: T[]): T[] {
  const v = process.env[name];
  if (!v) return fallback;
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean) as T[];
}

function trailingSeparator(value: string): string {
  return value.endsWith(sep) ? value : `${value}${sep}`;
}

export const config = {
  /** When true, no external API is hit and nothing is published. */
  dryRun: bool('DRY_RUN', true),

  /**
   * Claude model + reasoning effort used across all agents. Fable 5 is the
   * brain: Anthropic's most capable model, for the hardest ranking/judgement
   * calls in the pipeline. Server-side refusal fallback to Opus 4.8 is wired in
   * `llm.ts`. Requires 30-day data retention (Fable is not available under ZDR).
   */
  model: process.env.ANTHROPIC_MODEL ?? 'claude-fable-5',
  /** Fallback model used if Fable's safety classifiers decline a request. */
  fallbackModel: process.env.ANTHROPIC_FALLBACK_MODEL ?? 'claude-opus-4-8',
  effort: (process.env.ANTHROPIC_EFFORT ?? 'high') as 'low' | 'medium' | 'high' | 'xhigh' | 'max',

  trendScout: {
    /** Region for Google Trends and YouTube "most popular". */
    geo: process.env.TREND_GEO ?? 'US',
    /** How many ranked topics the scout should return. */
    topN: num('TREND_TOP_N', 8),
    subreddits: list('TREND_SUBREDDITS', ['all']),
  },

  /** How many of the top topics to actually try to turn into clips per run. */
  topicsPerRun: num('TOPICS_PER_RUN', 3),

  publishing: {
    defaultPlatforms: list<Platform>('PUBLISH_PLATFORMS', [
      'tiktok',
      'youtube-shorts',
      'instagram-reels',
    ]),
  },

  approval: {
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
    telegramChatId: process.env.TELEGRAM_CHAT_ID ?? '',
    /** Minutes to wait for a human decision before timing out (skips the post). */
    timeoutMinutes: num('APPROVAL_TIMEOUT_MIN', 60),
  },

  apiKeys: {
    youtube: process.env.YOUTUBE_API_KEY ?? '',
    pexels: process.env.PEXELS_API_KEY ?? '',
  },

  ffmpegPath: process.env.FFMPEG_PATH ?? 'ffmpeg',
  ffprobePath: process.env.FFPROBE_PATH ?? 'ffprobe',

  editor: {
    maxClipSec: num('EDITOR_MAX_SEC', 30),
  },

  tts: {
    sayPath: process.env.SAY_PATH ?? 'say',
    voice: process.env.TTS_VOICE ?? '',
    /** Words per minute. Zero uses the system voice's default rate. */
    rate: num('TTS_RATE', 0),
    whisperBin: process.env.WHISPER_BIN ?? '',
    whisperModel: process.env.WHISPER_MODEL ?? '',
  },

  /** Local directory for rendered clips + run state. */
  dataDir: trailingSeparator(
    process.env.DATA_DIR ?? fileURLToPath(new URL('../data/', import.meta.url)),
  ),
} as const;

/** A friendly one-line banner so it's always obvious which mode you're in. */
export function modeBanner(): string {
  return config.dryRun
    ? '🧪 DRY_RUN — mocked sources, nothing will be published'
    : '🚀 LIVE — real APIs; content can be published after approval';
}
