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

/**
 * Synthesize narration as AAC. Callers must gate this completely in DRY_RUN so
 * a dry pipeline never starts a child process.
 */
export async function synthesizeVoiceover(
  text: string,
  outBasePath: string,
): Promise<{ audioPath: string; durationSec: number } | null> {
  if (config.dryRun) {
    throw new Error('synthesizeVoiceover must not be called in DRY_RUN');
  }

  const capability = await detectTtsCapability();
  if (!capability.say) {
    warnSayMissing();
    return null;
  }

  await mkdir(dirname(outBasePath), { recursive: true });
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
    } catch (error) {
      if (!isMissingBinary(error)) throw error;
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
    return { audioPath, durationSec };
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
