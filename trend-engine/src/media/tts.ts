import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { config } from '../config.js';
import {
  proportionalCues,
  whisperCues,
  type CaptionCue,
} from './captions.js';
import {
  isMissingBinary,
  probeAudioDurationSec,
  runFfmpeg,
  spawnProcess,
} from './ffmpeg.js';

let ttsCapabilityPromise: Promise<{ say: boolean }> | undefined;
let warnedSayMissing = false;

export type TtsFetch = typeof globalThis.fetch;
export type TtsGenerator = 'elevenlabs' | 'macos-say';

export interface SynthesizedVoiceover {
  audioPath: string;
  durationSec: number;
  generator: TtsGenerator;
  audioProvenance: { kind: 'tts'; generator: TtsGenerator };
}

let ttsFetch: TtsFetch = (input, init) => globalThis.fetch(input, init);

/** Fetch indirection so provider tests never need to replace the global. */
export function setTtsFetch(fetchImpl: TtsFetch): void {
  ttsFetch = fetchImpl;
}

export function resetTtsFetch(): void {
  ttsFetch = (input, init) => globalThis.fetch(input, init);
}

/** Detect the macOS `say` synthesizer once without invoking a shell. */
export function detectTtsCapability(): Promise<{ say: boolean }> {
  ttsCapabilityPromise ??= spawnProcess(config.tts.sayPath, ['-v', '?'])
    .then(() => ({ say: true }))
    .catch((error: unknown) => {
      if (isMissingBinary(error)) return { say: false };
      throw error;
    });
  return ttsCapabilityPromise;
}

function warnSayMissing(): void {
  if (warnedSayMissing) return;
  warnedSayMissing = true;
  console.warn(
    `[editor] ${config.tts.sayPath} is unavailable; original draft will use caption-only audio.`,
  );
}

function voiceoverResult(
  audioPath: string,
  durationSec: number,
  generator: TtsGenerator,
): SynthesizedVoiceover {
  return {
    audioPath,
    durationSec,
    generator,
    audioProvenance: { kind: 'tts', generator },
  };
}

class ElevenLabsFailure extends Error {
  constructor(readonly status: string) {
    super(status);
  }
}

function elevenLabsFailureStatus(error: unknown): string {
  if (error instanceof ElevenLabsFailure) return error.status;
  if (error instanceof DOMException && error.name === 'TimeoutError') return 'timeout';
  return 'network-error';
}

async function synthesizeWithElevenLabs(
  text: string,
  outBasePath: string,
): Promise<SynthesizedVoiceover> {
  const { apiKey, voiceId, modelId } = config.tts.elevenLabs;
  const mp3Path = `${outBasePath}.mp3`;
  const audioPath = `${outBasePath}.m4a`;

  try {
    let response: Response;
    try {
      response = await ttsFetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
        {
          method: 'POST',
          headers: {
            Accept: 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': apiKey,
          },
          body: JSON.stringify({ text, model_id: modelId }),
          signal: AbortSignal.timeout(60_000),
        },
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        throw new ElevenLabsFailure('timeout');
      }
      throw new ElevenLabsFailure('network-error');
    }

    if (!response.ok) {
      throw new ElevenLabsFailure(String(response.status));
    }

    try {
      await writeFile(mp3Path, new Uint8Array(await response.arrayBuffer()));
      await runFfmpeg([
        '-y',
        '-i',
        mp3Path,
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        audioPath,
      ]);
      const durationSec = await probeAudioDurationSec(audioPath);
      return voiceoverResult(audioPath, durationSec, 'elevenlabs');
    } catch {
      throw new ElevenLabsFailure('audio-error');
    }
  } finally {
    try {
      await unlink(mp3Path);
    } catch {
      // The request or write may have failed before creating the temporary MP3.
    }
  }
}

async function synthesizeWithMacosSay(
  text: string,
  outBasePath: string,
): Promise<SynthesizedVoiceover | null> {
  const capability = await detectTtsCapability();
  if (!capability.say) {
    warnSayMissing();
    return null;
  }

  const aiffPath = `${outBasePath}.aiff`;
  const audioPath = `${outBasePath}.m4a`;
  // The script goes through a temp file (`say -f`), never argv: LLM text that
  // starts with `-` would otherwise be parsed as options (e.g. `-o` could
  // redirect output, and any parse failure aborts or empties the narration).
  const scriptPath = `${outBasePath}.txt`;
  await writeFile(scriptPath, text, 'utf8');
  const sayArgs = [
    '-o',
    aiffPath,
    ...(config.tts.voice ? ['-v', config.tts.voice] : []),
    ...(config.tts.rate > 0 ? ['-r', String(config.tts.rate)] : []),
    '-f',
    scriptPath,
  ];

  try {
    try {
      await spawnProcess(config.tts.sayPath, sayArgs);
    } catch (error) {
      if (!isMissingBinary(error)) throw error;
      warnSayMissing();
      return null;
    }

    try {
      await spawnProcess('afconvert', [
        '-f',
        'm4af',
        '-d',
        'aac',
        '-b',
        '192000',
        aiffPath,
        audioPath,
      ]);
    } catch {
      // `afconvert` support varies across macOS releases; ffmpeg is the
      // pipeline-wide converter and handles both a missing and a rejecting tool.
      await runFfmpeg([
        '-y',
        '-i',
        aiffPath,
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        audioPath,
      ]);
    }

    const durationSec = await probeAudioDurationSec(audioPath);
    return voiceoverResult(audioPath, durationSec, 'macos-say');
  } finally {
    try {
      await unlink(aiffPath);
    } catch {
      // Best-effort cleanup: `say` may have failed before creating the AIFF.
    }
    try {
      await unlink(scriptPath);
    } catch {
      // Best-effort cleanup of the temp script file.
    }
  }
}

/**
 * Synthesize narration as AAC. Callers must gate this completely in DRY_RUN so
 * a dry pipeline never starts a child process.
 */
export async function synthesizeVoiceover(
  text: string,
  outBasePath: string,
): Promise<SynthesizedVoiceover | null> {
  if (config.dryRun) {
    throw new Error('synthesizeVoiceover must not be called in DRY_RUN');
  }

  await mkdir(dirname(outBasePath), { recursive: true });
  if (config.tts.elevenLabs.apiKey && config.tts.elevenLabs.voiceId) {
    try {
      return await synthesizeWithElevenLabs(text, outBasePath);
    } catch (error) {
      console.warn(
        `[editor] ElevenLabs TTS failed (status=${elevenLabsFailureStatus(error)}); falling back to macOS say.`,
      );
      try {
        await unlink(`${outBasePath}.m4a`);
      } catch {
        // Conversion may have failed before creating a partial AAC file.
      }
    }
  }

  return synthesizeWithMacosSay(text, outBasePath);
}

/** Prefer whisper.cpp timings, with deterministic proportional cues as fallback. */
export async function acquireCaptionCues(
  script: string,
  audioPath: string,
  durationSec: number,
  outBasePath: string,
): Promise<CaptionCue[]> {
  if (config.dryRun || !config.tts.whisperBin) {
    return proportionalCues(script, durationSec);
  }
  if (!config.tts.whisperModel) {
    throw new Error('WHISPER_MODEL is required when WHISPER_BIN is set');
  }

  const whisperJsonPath = `${outBasePath}.json`;
  const whisperWavPath = `${outBasePath}.wav`;
  try {
    // Stock whisper.cpp cannot decode AAC/M4A; feed it 16 kHz mono WAV.
    await runFfmpeg([
      '-y',
      '-i',
      audioPath,
      '-ar',
      '16000',
      '-ac',
      '1',
      '-c:a',
      'pcm_s16le',
      whisperWavPath,
    ]);
    await spawnProcess(config.tts.whisperBin, [
      '-m',
      config.tts.whisperModel,
      '-f',
      whisperWavPath,
      '-oj',
      '-of',
      outBasePath,
    ]);
    const cues = whisperCues(await readFile(whisperJsonPath, 'utf8'));
    if (cues.length === 0) {
      throw new Error('whisper.cpp returned no caption cues');
    }
    return cues;
  } catch (error) {
    const detail = isMissingBinary(error)
      ? `${config.tts.whisperBin} was not found`
      : error instanceof Error
        ? error.message
        : String(error);
    console.warn(`[editor] whisper timing unavailable (${detail}); using proportional captions.`);
    return proportionalCues(script, durationSec);
  } finally {
    try {
      await unlink(whisperJsonPath);
    } catch {
      // whisper.cpp may not have produced a JSON sidecar.
    }
    try {
      await unlink(whisperWavPath);
    } catch {
      // ffmpeg may have failed before creating the WAV.
    }
  }
}
