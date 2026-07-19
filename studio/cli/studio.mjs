#!/usr/bin/env node

import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdir, readFile, stat, unlink, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import process from 'node:process';
import {bundle} from '@remotion/bundler';
import {ensureBrowser, renderMedia, selectComposition} from '@remotion/renderer';
import {extractWhisperWords, resolveEpisodeTiming} from '../src/timing-core.js';

const STUDIO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAY = '/usr/bin/say';
const AFCONVERT = '/usr/bin/afconvert';
const FFMPEG = process.env.FFMPEG_PATH || '/opt/homebrew/bin/ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || '/opt/homebrew/bin/ffprobe';
const WHISPER = process.env.WHISPER_BIN || '/opt/homebrew/bin/whisper-cli';
const WHISPER_MODEL = process.env.WHISPER_MODEL
  ? path.resolve(process.env.WHISPER_MODEL)
  : path.resolve(STUDIO_DIR, '../trend-engine/models/ggml-base.en.bin');
const TREND_ENV = path.resolve(STUDIO_DIR, '../trend-engine/.env');
const BROWSER_WRAPPER = path.join(STUDIO_DIR, 'cli/chrome-single-process.sh');
const FPS = 30;
const KOKORO_CACHE = path.join(STUDIO_DIR, '.cache/kokoro');
const LOUDNORM = {integrated: -14, truePeak: -1.5, range: 11};
const AAC_CEILING_GUARD = 0.82;
const DIALOGUE_GAP_MS = 140;
const DEFAULT_DIALOGUE_VOICES = {
  jessica: {voiceId: 'cgSgspJ2msm6clMCkdW9'},
  george: {voiceId: 'JBFqnCBsd6RMkjVDRZzb'},
};

const usage = () => {
  console.log('Usage: npx studio render <script.json> [--out path] [--voice name] [--rate wpm] [--reuse-audio]');
};

const parseArgs = (argv) => {
  if (argv[0] !== 'render' || !argv[1]) return null;
  const result = {command: argv[0], script: argv[1], out: null, voice: null, rate: null, reuseAudio: false};
  for (let index = 2; index < argv.length; index++) {
    const flag = argv[index];
    if (flag === '--reuse-audio') {
      result.reuseAudio = true;
      continue;
    }
    const value = argv[index + 1];
    if (flag === '--out' && value) result.out = value;
    else if (flag === '--voice' && value) result.voice = value;
    else if (flag === '--rate' && value) result.rate = Number(value);
    else throw new Error(`Unknown or incomplete argument: ${flag}`);
    index++;
  }
  if (result.rate !== null && (!Number.isFinite(result.rate) || result.rate < 80 || result.rate > 360)) {
    throw new Error('--rate must be between 80 and 360 words per minute.');
  }
  return result;
};

const validateScript = (value) => {
  if (!value || typeof value !== 'object') throw new Error('Script must be a JSON object.');
  for (const key of ['id', 'title']) {
    if (typeof value[key] !== 'string' || !value[key].trim()) throw new Error(`Script requires a non-empty ${key}.`);
  }
  if (value.theme !== undefined) {
    if (!value.theme || typeof value.theme !== 'object') throw new Error('Script theme must be an object.');
    for (const key of ['name', 'accent', 'accentSoft']) {
      if (typeof value.theme[key] !== 'string' || !value.theme[key].trim()) {
        throw new Error(`Script theme requires a non-empty ${key}.`);
      }
    }
  }
  const dialogue = Array.isArray(value.lines) && value.lines.length > 0;
  if (dialogue) {
    const authoredScenes = Array.isArray(value.scenes) ? value.scenes : [];
    for (const [index, line] of value.lines.entries()) {
      if (!line || !['jessica', 'george'].includes(line.speaker)) {
        throw new Error(`Dialogue line ${index + 1} speaker must be jessica or george.`);
      }
      for (const key of ['text', 'visual']) {
        if (typeof line[key] !== 'string' || !line[key].trim()) {
          throw new Error(`Dialogue line ${index + 1} requires non-empty ${key}.`);
        }
      }
    }
    const voices = {};
    for (const speaker of ['jessica', 'george']) {
      const configured = value.voices?.[speaker]?.voiceId ?? DEFAULT_DIALOGUE_VOICES[speaker].voiceId;
      if (typeof configured !== 'string' || !configured.trim()) {
        throw new Error(`Dialogue voice ${speaker} requires a non-empty voiceId.`);
      }
      voices[speaker] = {voiceId: configured.trim()};
    }
    value.voices = voices;
    value.narration = value.lines.map((line) => line.text.trim()).join(' ');
    value.scenes = value.lines.map((line, index) => ({
      ...(authoredScenes[index] ?? {}),
      id: authoredScenes[index]?.id || `line-${index + 1}`,
      cue: authoredScenes[index]?.cue || line.text,
      type: authoredScenes[index]?.type || 'edu-dialogue',
      lineIndex: index,
    }));
  } else {
    if (typeof value.narration !== 'string' || !value.narration.trim()) {
      throw new Error('Script requires non-empty narration or dialogue lines.');
    }
    if (!value.voice || typeof value.voice.name !== 'string' || !Number.isFinite(value.voice.rate)) {
      throw new Error('Script voice requires a name and numeric rate.');
    }
    if (!Array.isArray(value.scenes) || value.scenes.length === 0) throw new Error('Script requires scenes.');
  }
  for (const scene of value.scenes) {
    if (!scene?.id || !scene?.cue) throw new Error('Every scene requires id and cue.');
  }
  return value;
};

const run = (command, args, {label, quiet = false} = {}) => new Promise((resolve, reject) => {
  if (label) console.log(`\n[studio] ${label}`);
  const child = spawn(command, args, {stdio: ['ignore', 'pipe', 'pipe']});
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
    if (!quiet) process.stdout.write(chunk);
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
    if (!quiet) process.stderr.write(chunk);
  });
  child.on('error', reject);
  child.on('close', (code) => {
    if (code === 0) resolve({stdout, stderr});
    else reject(new Error(`${path.basename(command)} exited ${code}.\n${stderr.slice(-2400)}`));
  });
});

const listVoices = async () => {
  const {stdout} = await run(SAY, ['-v', '?'], {quiet: true});
  return stdout.split('\n').map((line) => line.trim().split(/\s+/)[0]).filter(Boolean);
};

const selectVoice = async (requested) => {
  if (typeof requested === 'string' && requested.toLowerCase() === 'elevenlabs') return 'ElevenLabs';
  if (typeof requested === 'string' && requested.toLowerCase() === 'kokoro') return 'Kokoro';
  const voices = await listVoices();
  if (voices.includes(requested)) return requested;
  for (const fallback of ['Samantha', 'Daniel']) {
    if (voices.includes(fallback)) {
      console.warn(`[studio] Voice “${requested}” is unavailable; using ${fallback}.`);
      return fallback;
    }
  }
  throw new Error('Neither Samantha nor Daniel is installed.');
};

const readElevenLabsCredentials = async ({defaultVoiceRequired = false} = {}) => {
  let contents;
  try {
    contents = await readFile(TREND_ENV, 'utf8');
  } catch {
    throw new Error('ElevenLabs credentials file could not be read.');
  }
  const values = new Map();
  for (const sourceLine of contents.split(/\r?\n/)) {
    const line = sourceLine.trim().replace(/^export\s+/, '');
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values.set(key, value);
  }
  const apiKey = values.get('ELEVENLABS_API_KEY');
  const voiceId = values.get('ELEVENLABS_VOICE_ID');
  if (!apiKey || (defaultVoiceRequired && !voiceId)) throw new Error('Required ElevenLabs credentials are unavailable.');
  return {apiKey, voiceId};
};

const probeMedia = async (file) => {
  const {stdout} = await run(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration,size', '-of', 'json', file], {quiet: true});
  const payload = JSON.parse(stdout);
  return {duration: Number(payload.format.duration), size: Number(payload.format.size)};
};

const parseLoudnormStats = (stderr) => {
  const blocks = [...stderr.matchAll(/\{\s*"input_i"[\s\S]*?\}/g)];
  if (blocks.length === 0) throw new Error('ffmpeg loudnorm analysis returned no JSON measurements.');
  const stats = JSON.parse(blocks.at(-1)[0]);
  for (const key of ['input_i', 'input_tp', 'input_lra', 'input_thresh', 'target_offset']) {
    if (!Number.isFinite(Number(stats[key]))) throw new Error(`ffmpeg loudnorm returned an invalid ${key} measurement.`);
  }
  return stats;
};

const loudnormBase = () => `loudnorm=I=${LOUDNORM.integrated}:TP=${LOUDNORM.truePeak}:LRA=${LOUDNORM.range}`;

const loudnormFinalMix = async ({input, output}) => {
  const firstPass = await run(FFMPEG, [
    '-hide_banner', '-nostats', '-i', input, '-map', '0:a:0', '-vn',
    '-af', `${loudnormBase()}:print_format=json`, '-f', 'null', '-',
  ], {label: 'Loudness analysis — pass 1 of 2', quiet: true});
  const measured = parseLoudnormStats(firstPass.stderr);
  const secondPassFilter = [
    loudnormBase(),
    `measured_I=${measured.input_i}`,
    `measured_TP=${measured.input_tp}`,
    `measured_LRA=${measured.input_lra}`,
    `measured_thresh=${measured.input_thresh}`,
    `offset=${measured.target_offset}`,
    'linear=true',
    'print_format=summary',
  ].join(':');
  await run(FFMPEG, [
    '-y', '-v', 'error', '-i', input,
    '-map', '0:v:0', '-map', '0:a:0',
    '-c:v', 'copy',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    '-af', `${secondPassFilter},alimiter=limit=${AAC_CEILING_GUARD}:attack=5:release=50:level=false`,
    '-movflags', '+faststart', output,
  ], {label: 'Final mux and loudness normalization — pass 2 of 2', quiet: true});
};

const makeSyntheticWords = (narration, durationMs) => {
  const words = narration.trim().split(/\s+/).filter(Boolean);
  return words.map((text, index) => ({
    text,
    startMs: Math.round((durationMs * index) / words.length),
    endMs: Math.round((durationMs * (index + 0.9)) / words.length),
  }));
};

const makeSyntheticDialogueWords = (lineTimings) => lineTimings.flatMap((line) => {
  const words = line.text.trim().split(/\s+/).filter(Boolean);
  const durationMs = line.endMs - line.startMs;
  return words.map((text, index) => ({
    text,
    startMs: Math.round(line.startMs + (durationMs * index) / words.length),
    endMs: Math.round(line.startMs + (durationMs * (index + 0.9)) / words.length),
  }));
});

const synthesizeOfflineFallback = async ({episode, output, voice, rate, forced = false}) => {
  console.warn(
    forced
      ? '[studio] Using the package-local Apache-2.0 Kokoro voice (offline).'
      : '[studio] Native speech service returned no samples; using the package-local Apache-2.0 Kokoro fallback.',
  );
  const [{env: transformersEnv, RawAudio}, {KokoroTTS}] = await Promise.all([
    import('@huggingface/transformers'),
    import('kokoro-js'),
  ]);
  transformersEnv.cacheDir = KOKORO_CACHE;
  transformersEnv.useBrowserCache = false;
  transformersEnv.allowLocalModels = true;
  transformersEnv.allowRemoteModels = false;
  const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {dtype: 'q8', device: 'cpu'});
  const kokoroVoice = voice === 'Daniel' ? 'bm_daniel' : 'af_heart';
  const speed = Math.min(1.55, Math.max(0.75, rate / 135));
  const sentences = episode.narration.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((part) => part.trim()).filter(Boolean) ?? [episode.narration];
  const chunks = [];
  for (const sentence of sentences) {
    const candidate = chunks.length === 0 ? sentence : `${chunks.at(-1)} ${sentence}`;
    if (chunks.length > 0 && candidate.length <= 280) chunks[chunks.length - 1] = candidate;
    else chunks.push(sentence);
  }
  const generated = [];
  for (const chunk of chunks) generated.push(await tts.generate(chunk, {voice: kokoroVoice, speed}));
  const sampleRate = generated[0].sampling_rate;
  const gapSamples = Math.round(sampleRate * 0.12);
  const totalSamples = generated.reduce((sum, audio) => sum + audio.audio.length, 0) + gapSamples * (generated.length - 1);
  const combined = new Float32Array(totalSamples);
  let cursor = 0;
  for (const [index, audio] of generated.entries()) {
    combined.set(audio.audio, cursor);
    cursor += audio.audio.length + (index < generated.length - 1 ? gapSamples : 0);
  }
  const audio = new RawAudio(combined, sampleRate);
  const rawWav = path.join(path.dirname(output), 'vo-kokoro.wav');
  await audio.save(rawWav);
  await unlink(output).catch(() => undefined);
  await run(AFCONVERT, [rawWav, output, '-f', 'AIFF', '-d', 'BEI16@22050', '-c', '1'], {quiet: true});
};

const requestElevenLabsAudio = async ({apiKey, voiceId, text}) => {
  let response;
  try {
    response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({text, model_id: 'eleven_multilingual_v2'}),
    });
  } catch {
    throw new Error('ElevenLabs request failed before receiving an HTTP response.');
  }
  if (!response.ok) throw new Error(`ElevenLabs request failed with HTTP ${response.status}.`);
  const audio = Buffer.from(await response.arrayBuffer());
  if (audio.length === 0) throw new Error('ElevenLabs returned an empty audio response.');
  return audio;
};

const synthesizeElevenLabs = async ({episode, generatedDir}) => {
  const mp3 = path.join(generatedDir, 'vo.mp3');
  const wav = path.join(generatedDir, 'vo.wav');
  const whisperWav = path.join(generatedDir, 'vo16k.wav');
  const {apiKey, voiceId} = await readElevenLabsCredentials({defaultVoiceRequired: true});
  await writeFile(mp3, await requestElevenLabsAudio({apiKey, voiceId, text: episode.narration}));
  await run(FFMPEG, ['-y', '-v', 'error', '-i', mp3, '-ar', '44100', '-ac', '1', '-c:a', 'pcm_s16le', wav], {label: 'Converting ElevenLabs 44.1 kHz master WAV', quiet: true});
  await run(FFMPEG, ['-y', '-v', 'error', '-i', mp3, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', whisperWav], {label: 'Converting ElevenLabs 16 kHz Whisper WAV', quiet: true});
  const media = await probeMedia(wav);
  if (!Number.isFinite(media.duration) || media.duration <= 0) throw new Error('ffprobe could not measure narration duration.');
  return {wav, whisperWav, durationMs: Math.round(media.duration * 1000)};
};

const escapeFfconcatPath = (file) => file.replaceAll("'", "'\\''");

const synthesizeDialogue = async ({episode, generatedDir}) => {
  const dialogueDir = path.join(generatedDir, 'dialogue');
  const wav = path.join(generatedDir, 'vo.wav');
  const whisperWav = path.join(generatedDir, 'vo16k.wav');
  const gapWav = path.join(dialogueDir, `gap-${DIALOGUE_GAP_MS}ms.wav`);
  const concatFile = path.join(dialogueDir, 'concat.txt');
  await mkdir(dialogueDir, {recursive: true});
  const {apiKey} = await readElevenLabsCredentials();
  const lineFiles = [];
  const lineTimings = [];
  let cursorSeconds = 0;
  for (const [index, line] of episode.lines.entries()) {
    const stem = `line-${String(index + 1).padStart(2, '0')}`;
    const mp3 = path.join(dialogueDir, `${stem}.mp3`);
    const lineWav = path.join(dialogueDir, `${stem}.wav`);
    console.log(`[studio] ElevenLabs dialogue line ${index + 1}/${episode.lines.length} — ${line.speaker}`);
    const voiceId = episode.voices[line.speaker].voiceId;
    await writeFile(mp3, await requestElevenLabsAudio({apiKey, voiceId, text: line.text}));
    await run(FFMPEG, [
      '-y', '-v', 'error', '-i', mp3,
      '-ar', '44100', '-ac', '1', '-c:a', 'pcm_s16le', lineWav,
    ], {quiet: true});
    const media = await probeMedia(lineWav);
    if (!Number.isFinite(media.duration) || media.duration <= 0) {
      throw new Error(`ffprobe could not measure dialogue line ${index + 1}.`);
    }
    const startMs = Math.round(cursorSeconds * 1000);
    const endMs = Math.round((cursorSeconds + media.duration) * 1000);
    lineTimings.push({
      id: episode.scenes[index].id,
      lineIndex: index,
      speaker: line.speaker,
      text: line.text,
      visual: line.visual,
      startMs,
      endMs,
    });
    lineFiles.push(lineWav);
    cursorSeconds += media.duration + (index < episode.lines.length - 1 ? DIALOGUE_GAP_MS / 1000 : 0);
  }
  await run(FFMPEG, [
    '-y', '-v', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono',
    '-t', (DIALOGUE_GAP_MS / 1000).toFixed(3), '-c:a', 'pcm_s16le', gapWav,
  ], {quiet: true});
  const concatEntries = [];
  for (const [index, lineFile] of lineFiles.entries()) {
    concatEntries.push(`file '${escapeFfconcatPath(lineFile)}'`);
    if (index < lineFiles.length - 1) concatEntries.push(`file '${escapeFfconcatPath(gapWav)}'`);
  }
  await writeFile(concatFile, `${concatEntries.join('\n')}\n`);
  await run(FFMPEG, [
    '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', concatFile,
    '-ar', '44100', '-ac', '1', '-c:a', 'pcm_s16le', wav,
  ], {label: `Concatenating dialogue with ${DIALOGUE_GAP_MS} ms gaps`, quiet: true});
  await run(FFMPEG, [
    '-y', '-v', 'error', '-i', wav,
    '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', whisperWav,
  ], {label: 'Converting full dialogue track for Whisper', quiet: true});
  const media = await probeMedia(wav);
  if (!Number.isFinite(media.duration) || media.duration <= 0) throw new Error('ffprobe could not measure dialogue duration.');
  await writeFile(path.join(generatedDir, 'lines.json'), `${JSON.stringify(lineTimings, null, 2)}\n`);
  return {wav, whisperWav, durationMs: Math.round(media.duration * 1000), lineTimings};
};

const synthesizeNarration = async ({episode, generatedDir, voice, rate}) => {
  if (episode.lines?.length) return synthesizeDialogue({episode, generatedDir});
  if (voice === 'ElevenLabs') return synthesizeElevenLabs({episode, generatedDir});
  const aiff = path.join(generatedDir, 'vo.aiff');
  const wav = path.join(generatedDir, 'vo.wav');
  const whisperWav = path.join(generatedDir, 'vo16k.wav');
  if (voice === 'Kokoro') {
    await synthesizeOfflineFallback({episode, output: aiff, voice, rate, forced: true});
  } else {
    try {
      await run(SAY, ['-v', voice, '-r', String(rate), '-o', aiff, '--data-format=LEF32@22050', episode.narration], {label: `TTS — ${voice} at ${rate} wpm`, quiet: true});
    } catch (error) {
      console.warn('[studio] This macOS say build rejected LEF32 AIFF; retrying its native 22.05 kHz AIFF output.');
      await run(SAY, ['-v', voice, '-r', String(rate), '-o', aiff, episode.narration], {quiet: true});
    }
    const nativeProbe = await probeMedia(aiff).catch(() => ({duration: 0}));
    if (!Number.isFinite(nativeProbe.duration) || nativeProbe.duration < 1) {
      await synthesizeOfflineFallback({episode, output: aiff, voice, rate});
    }
  }
  await run(AFCONVERT, [aiff, wav, '-f', 'WAVE', '-d', 'LEI16@44100', '-c', '1'], {label: 'Converting 44.1 kHz master WAV', quiet: true});
  await run(AFCONVERT, [aiff, whisperWav, '-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1'], {label: 'Converting 16 kHz Whisper WAV', quiet: true});
  const media = await probeMedia(wav);
  if (!Number.isFinite(media.duration) || media.duration <= 0) throw new Error('ffprobe could not measure narration duration.');
  return {wav, whisperWav, durationMs: Math.round(media.duration * 1000)};
};

const reuseNarration = async ({episode, generatedDir}) => {
  const wav = path.join(generatedDir, 'vo.wav');
  const whisperWav = path.join(generatedDir, 'vo16k.wav');
  if (!existsSync(wav) || !existsSync(whisperWav)) {
    throw new Error('--reuse-audio requires existing vo.wav and vo16k.wav files for this episode.');
  }
  const media = await probeMedia(wav);
  if (!Number.isFinite(media.duration) || media.duration <= 0) throw new Error('ffprobe could not measure reused narration duration.');
  console.log('[studio] Reusing existing narration audio; TTS is skipped.');
  let lineTimings = [];
  if (episode.lines?.length) {
    try {
      lineTimings = JSON.parse(await readFile(path.join(generatedDir, 'lines.json'), 'utf8'));
    } catch {
      throw new Error('--reuse-audio for dialogue requires the existing lines.json timing artifact.');
    }
    if (!Array.isArray(lineTimings) || lineTimings.length !== episode.lines.length) {
      throw new Error('Reused dialogue line timings do not match this script.');
    }
  }
  return {wav, whisperWav, durationMs: Math.round(media.duration * 1000), lineTimings};
};

const transcribe = async ({episode, generatedDir, whisperWav, durationMs, lineTimings = []}) => {
  const outBase = path.join(generatedDir, 'whisper');
  let words = [];
  try {
    const whisperArgs = ['-m', WHISPER_MODEL, '-f', whisperWav, '-oj', '-ojf', '-ml', '1', '-of', outBase];
    try {
      await run(WHISPER, whisperArgs, {label: 'Whisper word timestamps', quiet: true});
    } catch (gpuError) {
      console.warn('[studio] Whisper GPU path was unavailable; retrying offline on CPU.');
      await run(WHISPER, [...whisperArgs, '-ng'], {quiet: true});
    }
    const payload = JSON.parse(await readFile(`${outBase}.json`, 'utf8'));
    words = extractWhisperWords(payload);
    if (words.length < 8) throw new Error(`Whisper returned only ${words.length} usable words.`);
  } catch (error) {
    console.warn(`[studio] Timestamp warning: ${error.message}`);
    console.warn('[studio] Falling back to deterministic narration-proportional word timing.');
    words = lineTimings.length > 0
      ? makeSyntheticDialogueWords(lineTimings)
      : makeSyntheticWords(episode.narration, durationMs);
  }
  return words;
};

const makeSfx = async () => {
  const sfxDir = path.join(STUDIO_DIR, 'public/generated/sfx');
  await mkdir(sfxDir, {recursive: true});
  await run(FFMPEG, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=52:duration=0.35:sample_rate=44100', '-af', 'volume=1.65,asoftclip=type=tanh,afade=t=in:st=0:d=0.012,afade=t=out:st=0.12:d=0.23', '-ac', '1', '-c:a', 'pcm_s16le', path.join(sfxDir, 'bass.wav')], {label: 'Generating offline SFX', quiet: true});
  await run(FFMPEG, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'anoisesrc=color=pink:duration=0.28:sample_rate=44100', '-af', 'highpass=f=650,lowpass=f=7200,volume=0.55,afade=t=in:st=0:d=0.055,afade=t=out:st=0.09:d=0.19', '-ac', '1', '-c:a', 'pcm_s16le', path.join(sfxDir, 'whoosh.wav')], {quiet: true});
  await run(FFMPEG, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=2000:duration=0.055:sample_rate=44100', '-af', 'volume=0.18,afade=t=out:st=0.012:d=0.043', '-ac', '1', '-c:a', 'pcm_s16le', path.join(sfxDir, 'tick.wav')], {quiet: true});
};

const renderEpisode = async ({episode, timing, assetBase, output}) => {
  const noDownload = () => {
    throw new Error('Browser download disabled: run npm install while online before rendering.');
  };
  const browser = await ensureBrowser({chromeMode: 'headless-shell', onBrowserDownload: noDownload, logLevel: 'warn'});
  if (!browser.path || !existsSync(browser.path)) throw new Error('Offline Remotion browser is not installed. Run npm install while online.');
  if (!existsSync(BROWSER_WRAPPER)) throw new Error('Package-local browser wrapper is missing.');
  console.log('\n[studio] Bundling Remotion composition');
  let lastBundlePercent = -1;
  const serveUrl = await bundle({
    entryPoint: path.join(STUDIO_DIR, 'src/index.ts'),
    rootDir: STUDIO_DIR,
    publicDir: path.join(STUDIO_DIR, 'public'),
    symlinkPublicDir: true,
    onProgress: (progress) => {
      const percent = Math.floor(progress / 10) * 10;
      if (percent !== lastBundlePercent) {
        process.stdout.write(`\r[studio] Bundle ${percent}%`);
        lastBundlePercent = percent;
      }
    },
  });
  process.stdout.write('\r[studio] Bundle 100%\n');
  const inputProps = {episode, timing, assetBase};
  const composition = await selectComposition({
    serveUrl,
    id: 'CalledItEpisode',
    inputProps,
    browserExecutable: BROWSER_WRAPPER,
    onBrowserDownload: noDownload,
    logLevel: 'warn',
  });
  console.log(`[studio] Rendering ${composition.durationInFrames} frames at ${composition.width}x${composition.height}/${composition.fps}fps`);
  let lastPercent = -1;
  const intermediateOutput = path.join(path.dirname(output), `.${path.basename(output)}.rendering-${process.pid}.mp4`);
  const commonRenderOptions = {
    composition,
    serveUrl,
    codec: 'h264',
    outputLocation: intermediateOutput,
    inputProps,
    pixelFormat: 'yuv420p',
    colorSpace: 'bt709',
    audioCodec: 'aac',
    audioBitrate: '192k',
    concurrency: null,
    browserExecutable: BROWSER_WRAPPER,
    onBrowserDownload: noDownload,
    overwrite: true,
    logLevel: 'warn',
    onProgress: ({progress}) => {
      const percent = Math.floor(progress * 100);
      if (percent !== lastPercent) {
        process.stdout.write(`\r[studio] Render ${String(percent).padStart(3)}%`);
        lastPercent = percent;
      }
    },
  };
  try {
    try {
      await renderMedia({...commonRenderOptions, videoBitrate: '12M', hardwareAcceleration: 'if-possible'});
    } catch (error) {
      if (!String(error?.message ?? error).includes('videotoolbox')) throw error;
      console.warn('\n[studio] VideoToolbox is unavailable; retrying with software x264 at CRF 19.');
      lastPercent = -1;
      await renderMedia({...commonRenderOptions, crf: 19, hardwareAcceleration: 'disable'});
    }
    process.stdout.write('\r[studio] Render 100%\n');
    await loudnormFinalMix({input: intermediateOutput, output});
  } finally {
    await unlink(intermediateOutput).catch(() => undefined);
  }
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (!args) {
    usage();
    process.exitCode = 1;
    return;
  }
  const started = Date.now();
  const scriptPath = path.resolve(process.cwd(), args.script);
  const episode = validateScript(JSON.parse(await readFile(scriptPath, 'utf8')));
  const safeId = episode.id.replace(/[^a-zA-Z0-9_-]+/g, '-');
  const generatedDir = path.join(STUDIO_DIR, 'public/generated', safeId);
  const output = path.resolve(process.cwd(), args.out ?? path.join('out', `${safeId}.mp4`));
  await mkdir(generatedDir, {recursive: true});
  await mkdir(path.dirname(output), {recursive: true});
  const dialogue = episode.lines?.length > 0;
  const voice = dialogue ? 'ElevenLabs' : await selectVoice(args.voice ?? episode.voice.name);
  const rate = dialogue ? null : args.rate ?? episode.voice.rate;
  if (!dialogue) episode.voice = {...episode.voice, name: voice, rate};
  console.log(`[studio] Episode ${episode.id}`);
  const {whisperWav, durationMs, lineTimings = []} = args.reuseAudio
    ? await reuseNarration({episode, generatedDir})
    : await synthesizeNarration({episode, generatedDir, voice, rate});
  const words = await transcribe({episode, generatedDir, whisperWav, durationMs, lineTimings});
  const timing = resolveEpisodeTiming({
    words,
    scenes: episode.scenes,
    narration: episode.narration,
    durationMs,
    lineTimings,
    fps: FPS,
  });
  await writeFile(path.join(generatedDir, 'words.json'), `${JSON.stringify(words, null, 2)}\n`);
  await writeFile(path.join(generatedDir, 'cues.json'), `${JSON.stringify(timing, null, 2)}\n`);
  console.log('\n[studio] Resolved scene cues');
  for (const cue of timing.cues) {
    const warning = cue.fallback ? '  WARNING: proportional fallback' : '';
    console.log(`  ${String(cue.id).padEnd(9)} ${(cue.startMs / 1000).toFixed(2).padStart(6)}s → ${(cue.endMs / 1000).toFixed(2).padStart(6)}s  score=${cue.score.toFixed(3)}${warning}`);
  }
  await makeSfx();
  await renderEpisode({episode, timing, assetBase: `generated/${safeId}`, output});
  const media = await probeMedia(output);
  const file = await stat(output);
  const wallSeconds = (Date.now() - started) / 1000;
  console.log('\n[studio] Finished');
  console.log(`  Path:     ${output}`);
  console.log(`  Duration: ${media.duration.toFixed(2)}s`);
  console.log(`  Size:     ${(file.size / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  Wall:     ${wallSeconds.toFixed(1)}s`);
};

main().catch((error) => {
  console.error(`\n[studio] ERROR: ${error.stack ?? error.message}`);
  process.exitCode = 1;
});
