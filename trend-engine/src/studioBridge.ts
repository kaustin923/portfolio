import { spawn } from 'node:child_process';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { checkCompliance } from './agents/compliance.js';
import { publish } from './agents/publisher.js';
import { requestApproval } from './approval/telegram.js';
import { config } from './config.js';
import { structured } from './llm.js';
import { recordPublished, topicKey, type RunState } from './state.js';
import type { ClipDraft, Pitch, Topic } from './types.js';

const EDUCATIONAL_SCENE_TYPES = [
  'edu-hook',
  'edu-cloud',
  'edu-shrink',
  'edu-privacy',
  'edu-everywhere',
  'edu-outro',
] as const;

type EducationalSceneType = (typeof EDUCATIONAL_SCENE_TYPES)[number];

/** Kept local deliberately: importing studio's schema would load its Remotion graph. */
type EpisodeScript = {
  id: string;
  title: string;
  narration: string;
  voice: {
    name: 'ElevenLabs';
    rate: 178;
  };
  scenes: Array<{
    id: string;
    cue: string;
    type: EducationalSceneType;
  }>;
};

export type StudioPitch = Pick<
  Pitch,
  'topicId' | 'headline' | 'stakes' | 'angle' | 'eventPeg' | 'vertical' | 'feedback'
>;

interface StudioCopy {
  title: string;
  narration: string;
  scenes: Array<{
    id: string;
    type: EducationalSceneType;
    cue: string;
  }>;
  caption: string;
  hashtags: string[];
}

interface StudioReportCounters {
  published: number;
  originals: number;
  rejected: number;
  blocked: number;
}

export interface RenderRunnerOptions {
  cwd: string;
  timeoutMs: number;
}

export interface RenderRunnerResult {
  exitCode: number | null;
  signal?: NodeJS.Signals | null;
  stdout?: string;
  stderr?: string;
  timedOut?: boolean;
  error?: string;
}

export type RenderRunner = (
  executable: string,
  args: string[],
  options: RenderRunnerOptions,
) => Promise<RenderRunnerResult>;

const OUTPUT_TAIL_CHARS = 4_000;
const TERMINATION_GRACE_MS = 2_000;

function appendTail(current: string, chunk: unknown): string {
  return `${current}${String(chunk)}`.slice(-OUTPUT_TAIL_CHARS);
}

const defaultRenderRunner: RenderRunner = (executable, args, options) =>
  new Promise((resolve) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    let forceKillTimer: NodeJS.Timeout | undefined;

    const finish = (result: RenderRunnerResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      resolve(result);
    };

    child.stdout.on('data', (chunk) => {
      stdout = appendTail(stdout, chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr = appendTail(stderr, chunk);
    });
    child.once('error', (err) => {
      finish({
        exitCode: null,
        stdout,
        stderr: appendTail(stderr, err.message),
        timedOut,
        error: err.message,
      });
    });
    child.once('close', (exitCode, signal) => {
      finish({ exitCode, signal, stdout, stderr, timedOut });
    });

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGTERM');
      } catch (err) {
        stderr = appendTail(
          stderr,
          `\nSIGTERM failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      forceKillTimer = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch (err) {
          stderr = appendTail(
            stderr,
            `\nSIGKILL failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        finish({ exitCode: null, signal: 'SIGKILL', stdout, stderr, timedOut: true });
      }, TERMINATION_GRACE_MS);
    }, Math.max(0, options.timeoutMs));
  });

let injectedRenderRunner: RenderRunner | undefined;

export function setRenderRunner(runner: RenderRunner): void {
  injectedRenderRunner = runner;
}

export function resetRenderRunner(): void {
  injectedRenderRunner = undefined;
}

const SCRIPT_SYSTEM = `You write short, rigorous educational videos for a vertical Remotion format.

The educational architecture below is mandatory:
- Open the narration with a silent-thumbnail hook of no more than 9 words. It must work as on-screen text with the sound off.
- Teach exactly 3 distinct, useful insights.
- Deliver a real partial payoff in the first third; never hoard all value for the end.
- End by looping back to and echoing the hook's language.
- Keep total narration between 85 and 110 words, inclusive.
- Phrase narration so captions chunk naturally into groups of 2 to 4 words.
- Return 4 to 6 scenes. The first scene type must be edu-hook and the last must be edu-outro.
- Every scene cue must be a VERBATIM contiguous run of 4 to 6 words copied from the narration, and cues must follow narration order.
- Use only these scene types: edu-hook, edu-cloud, edu-shrink, edu-privacy, edu-everywhere, edu-outro.

Return only the structured fields requested by the schema.`;

const SCRIPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'narration', 'scenes', 'caption', 'hashtags'],
  properties: {
    title: { type: 'string', minLength: 1 },
    narration: { type: 'string', minLength: 1 },
    scenes: {
      type: 'array',
      // Anthropic structured-output rejects minItems/maxItems > 1; count enforced in prompt.
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'type', 'cue'],
        properties: {
          id: { type: 'string', minLength: 1 },
          type: { type: 'string', enum: EDUCATIONAL_SCENE_TYPES },
          cue: { type: 'string', minLength: 1 },
        },
      },
    },
    caption: { type: 'string', minLength: 1 },
    hashtags: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
    },
  },
} as const;

function normalizedWords(value: string): string[] {
  return (
    value
      .normalize('NFKC')
      .replace(/[’‘]/g, "'")
      .toLocaleLowerCase('en-US')
      .match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu) ?? []
  );
}

function firstSentence(narration: string): string {
  return narration.trim().match(/^.*?[.!?](?=\s|$)/u)?.[0] ?? narration.trim();
}

function findWordRun(haystack: string[], needle: string[], from: number): number {
  if (needle.length === 0) return -1;
  for (let start = from; start <= haystack.length - needle.length; start++) {
    if (needle.every((word, offset) => haystack[start + offset] === word)) return start;
  }
  return -1;
}

function validateStudioCopy(value: unknown): string[] {
  const violations: string[] = [];
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return ['response must be an object'];
  }
  const copy = value as Partial<StudioCopy>;

  for (const field of ['title', 'narration', 'caption'] as const) {
    if (typeof copy[field] !== 'string' || !copy[field]?.trim()) {
      violations.push(`${field} must be a non-empty string`);
    }
  }
  if (!Array.isArray(copy.hashtags) || copy.hashtags.some((tag) => typeof tag !== 'string' || !tag.trim())) {
    violations.push('hashtags must be an array of non-empty strings');
  }
  if (typeof copy.narration !== 'string') return violations;

  const narrationWords = normalizedWords(copy.narration);
  if (narrationWords.length < 85 || narrationWords.length > 110) {
    violations.push(
      `narration must contain 85-110 words (received ${narrationWords.length})`,
    );
  }
  const hookWordCount = normalizedWords(firstSentence(copy.narration)).length;
  if (hookWordCount === 0 || hookWordCount > 9) {
    violations.push(`opening hook must contain at most 9 words (received ${hookWordCount})`);
  }

  if (!Array.isArray(copy.scenes)) {
    violations.push('scenes must be an array');
    return violations;
  }
  if (copy.scenes.length < 4 || copy.scenes.length > 6) {
    violations.push(`scenes must contain 4-6 entries (received ${copy.scenes.length})`);
  }
  if (copy.scenes[0]?.type !== 'edu-hook') {
    violations.push('first scene type must be edu-hook');
  }
  if (copy.scenes.at(-1)?.type !== 'edu-outro') {
    violations.push('last scene type must be edu-outro');
  }

  let narrationCursor = 0;
  for (const [index, scene] of copy.scenes.entries()) {
    if (scene === null || typeof scene !== 'object') {
      violations.push(`scene ${index + 1} must be an object`);
      continue;
    }
    if (typeof scene.id !== 'string' || !scene.id.trim()) {
      violations.push(`scene ${index + 1} id must be a non-empty string`);
    }
    if (!EDUCATIONAL_SCENE_TYPES.includes(scene.type as EducationalSceneType)) {
      violations.push(`scene ${index + 1} has unsupported type ${String(scene.type)}`);
    }
    if (typeof scene.cue !== 'string') {
      violations.push(`scene ${index + 1} cue must be a string`);
      continue;
    }
    const cueWords = normalizedWords(scene.cue);
    if (cueWords.length < 4 || cueWords.length > 6) {
      violations.push(
        `scene ${index + 1} cue must contain 4-6 words (received ${cueWords.length})`,
      );
      continue;
    }
    const cueStart = findWordRun(narrationWords, cueWords, narrationCursor);
    if (cueStart < 0) {
      violations.push(
        `scene ${index + 1} cue is not a verbatim normalized narration substring in order: "${scene.cue}"`,
      );
      continue;
    }
    narrationCursor = cueStart + cueWords.length;
  }
  return violations;
}

function pitchMessage(pitch: StudioPitch): string {
  const feedback = pitch.feedback
    ? `\n\nOWNER FEEDBACK (verbatim, must be honored as a constraint): "${pitch.feedback}"`
    : '';
  return `Turn this approved pitch into one educational episode.

PITCH
headline: ${pitch.headline}
stakes: ${pitch.stakes}
angle: ${pitch.angle}
eventPeg: ${pitch.eventPeg ?? '(none)'}
vertical: ${pitch.vertical}${feedback}`;
}

async function generateStudioCopy(pitch: StudioPitch): Promise<StudioCopy> {
  const user = pitchMessage(pitch);
  let copy = await structured<StudioCopy>({
    system: SCRIPT_SYSTEM,
    user,
    schema: SCRIPT_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 4_000,
  });
  let violations = validateStudioCopy(copy);
  if (violations.length === 0) return copy;

  copy = await structured<StudioCopy>({
    system: SCRIPT_SYSTEM,
    user:
      `${user}\n\nCORRECTIVE RETRY. Fix every validation violation below:\n` +
      `${violations.map((violation) => `- ${violation}`).join('\n')}\n\n` +
      `Previous invalid response:\n${JSON.stringify(copy)}`,
    schema: SCRIPT_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 4_000,
  });
  violations = validateStudioCopy(copy);
  if (violations.length > 0) {
    throw new Error(
      `[studio-bridge] script validation failed after corrective retry: ${violations.join('; ')}`,
    );
  }
  return copy;
}

function episodeId(pitch: StudioPitch, now = new Date()): string {
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const slug = pitch.headline
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  const fallback = pitch.topicId.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 64);
  return `ep-${date}-${slug || fallback || 'episode'}`;
}

function episodeScript(id: string, copy: StudioCopy): EpisodeScript {
  return {
    id,
    title: copy.title,
    narration: copy.narration,
    voice: { name: 'ElevenLabs', rate: 178 },
    scenes: copy.scenes.map(({ id: sceneId, cue, type }) => ({
      id: sceneId,
      cue,
      type,
    })),
  };
}

function dryRunCopy(pitch: StudioPitch): StudioCopy {
  const narration =
    'Why does this story matter now? First, timing explains attention: a visible event gives people a reason to care today, while the larger pattern was already forming. Second, stakes turn information into a useful decision because they show exactly who is affected and what may change next. Third, context keeps the lesson honest by separating evidence, interpretation, and uncertainty. Notice the early payoff: follow the event, identify the stakes, then test the angle against what actually happened. That simple sequence makes a fast story educational instead of merely urgent. So, why does this story matter now? Because timing, stakes, and context make the answer useful.';
  return {
    title: pitch.headline || 'Studio educational episode',
    narration,
    scenes: [
      { id: 'hook', type: 'edu-hook', cue: 'Why does this story matter now' },
      { id: 'timing', type: 'edu-cloud', cue: 'First timing explains attention a visible' },
      { id: 'stakes', type: 'edu-shrink', cue: 'Second stakes turn information into a' },
      { id: 'context', type: 'edu-privacy', cue: 'Third context keeps the lesson honest' },
      { id: 'payoff', type: 'edu-everywhere', cue: 'Notice the early payoff follow the' },
      { id: 'outro', type: 'edu-outro', cue: 'So why does this story matter' },
    ],
    caption: `${pitch.headline}: ${pitch.angle}`,
    hashtags: ['education', 'explained'],
  };
}

async function requireStudioCli(): Promise<string> {
  let studioStats;
  try {
    studioStats = await stat(config.studio.dir);
  } catch (err) {
    throw new Error(
      `[studio-bridge] STUDIO_MODE=1 but STUDIO_DIR is unavailable: ${config.studio.dir} (${err instanceof Error ? err.message : String(err)})`,
    );
  }
  if (!studioStats.isDirectory()) {
    throw new Error(
      `[studio-bridge] STUDIO_MODE=1 but STUDIO_DIR is not a directory: ${config.studio.dir}`,
    );
  }

  const cliPath = join(config.studio.dir, 'cli', 'studio.mjs');
  try {
    const cliStats = await stat(cliPath);
    if (!cliStats.isFile()) throw new Error('not a file');
  } catch (err) {
    throw new Error(
      `[studio-bridge] studio CLI is unavailable at ${cliPath} (${err instanceof Error ? err.message : String(err)})`,
    );
  }
  return cliPath;
}

function stderrTail(result: RenderRunnerResult): string {
  return (result.stderr ?? '').slice(-OUTPUT_TAIL_CHARS) || '(stderr was empty)';
}

async function renderEpisode(
  cliPath: string,
  scriptPath: string,
  outputPath: string,
): Promise<void> {
  const args = [cliPath, 'render', scriptPath, '--out', outputPath];
  const result = await (injectedRenderRunner ?? defaultRenderRunner)(
    process.execPath,
    args,
    {
      cwd: config.studio.dir,
      timeoutMs: config.studio.renderTimeoutMin * 60_000,
    },
  );
  if (result.timedOut) {
    throw new Error(
      `[studio-bridge] studio render timed out after ${config.studio.renderTimeoutMin} minute(s). stderr tail:\n${stderrTail(result)}`,
    );
  }
  if (result.error || result.exitCode !== 0) {
    const exit = result.exitCode === null ? 'before an exit code was available' : `with code ${result.exitCode}`;
    throw new Error(
      `[studio-bridge] studio CLI exited ${exit}${result.signal ? ` (${result.signal})` : ''}. stderr tail:\n${stderrTail(result)}`,
    );
  }

  let outputStats;
  try {
    outputStats = await stat(outputPath);
  } catch (err) {
    throw new Error(
      `[studio-bridge] studio CLI reported success but no MP4 exists at ${outputPath} (${err instanceof Error ? err.message : String(err)})`,
    );
  }
  if (!outputStats.isFile() || outputStats.size <= 0) {
    throw new Error(
      `[studio-bridge] studio CLI produced an empty or invalid MP4 at ${outputPath}`,
    );
  }
}

export async function produceStudioEpisode(
  pitch: StudioPitch,
  topic: Topic | undefined,
  report: StudioReportCounters,
  state: RunState,
): Promise<void> {
  const cliPath = await requireStudioCli();
  if (!topic) {
    throw new Error(
      `[studio-bridge] approved pitch references unknown topicId "${pitch.topicId}"`,
    );
  }

  const id = episodeId(pitch);
  const scriptDir = resolve(config.dataDir, 'studio-scripts');
  const outputDir = resolve(config.dataDir, 'clips');
  const scriptPath = join(scriptDir, `${id}.script.json`);
  const outputPath = join(outputDir, `${id}.mp4`);
  await mkdir(scriptDir, { recursive: true });
  await mkdir(outputDir, { recursive: true });

  const copy = config.dryRun ? dryRunCopy(pitch) : await generateStudioCopy(pitch);
  const episode = episodeScript(id, copy);
  await writeFile(scriptPath, `${JSON.stringify(episode, null, 2)}\n`, 'utf8');

  const cliArgs = ['render', scriptPath, '--out', outputPath];
  if (config.dryRun) {
    console.log(
      `[studio-bridge] DRY_RUN: CLI argv ${JSON.stringify(cliArgs)} (node ${cliPath})`,
    );
    console.log(`[studio-bridge] DRY_RUN: planned output ${outputPath}`);
    console.log('[studio-bridge] DRY_RUN: render + approval skipped');
    return;
  }

  await renderEpisode(cliPath, scriptPath, outputPath);

  const draft: ClipDraft = {
    id,
    topicId: pitch.topicId,
    sourceCandidateId: 'studio-original',
    outputPath,
    aspectRatio: '9:16',
    caption: copy.caption,
    hashtags: copy.hashtags,
    targetPlatforms: config.publishing.defaultPlatforms,
    license: {
      type: 'original',
      requiresAttribution: false,
      commercialUse: true,
      sourceUrl: 'internal://studio',
    },
    audioProvenance: { kind: 'tts', generator: 'elevenlabs' },
    syntheticMedia: true,
  };

  const compliance = checkCompliance(draft);
  if (!compliance.approved || compliance.tier !== 'green') {
    report.blocked++;
    throw new Error(
      `[studio-bridge] compliance gate failed (approved=${compliance.approved}, tier=${compliance.tier ?? 'unset'}): ${compliance.reasons.join('; ')}`,
    );
  }

  const reviewTopic: Topic = { ...topic, suggestedAngle: pitch.angle };
  const decision = await requestApproval(reviewTopic, draft, compliance);
  if (decision.status !== 'approved') {
    report.rejected++;
    console.log(
      `[studio-bridge] not published (${decision.status}): ${decision.note ?? ''}`,
    );
    return;
  }

  const results = await publish(draft, decision);
  report.originals++;
  const published = results.filter((result) => result.status === 'published');
  report.published += published.length;
  if (published.length > 0) {
    recordPublished(
      state,
      `original:${topicKey(topic.title)}`,
      topic.title,
      [...new Set(published.map((result) => result.platform))],
    );
  }
  console.log(
    `[studio-bridge] published to ${published.length}/${results.length} platforms`,
  );
}
