#!/usr/bin/env node

import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdir, readFile, rename, stat, unlink, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import process from 'node:process';
import {bundle} from '@remotion/bundler';
import {ensureBrowser, renderMedia, selectComposition} from '@remotion/renderer';
import {
  alignDialogueLinesToWords,
  alignNarrationToWords,
  extractWhisperWords,
  resolveEpisodeTiming,
} from '../src/timing-core.js';

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

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const requireString = (value, path, optional = false) => {
  if (optional && value === undefined) return;
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${path} requires a non-empty string.`);
};

const requireNumber = (value, path) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${path} requires a finite number.`);
};

const requireOptionalBoolean = (value, path) => {
  if (value !== undefined && typeof value !== 'boolean') throw new Error(`${path} must be a boolean.`);
};

const requireEnum = (value, allowed, path) => {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new Error(`${path} must be one of: ${allowed.join(', ')}.`);
  }
};

const requireMaxLength = (value, maximum, path) => {
  if (typeof value === 'string' && value.length > maximum) throw new Error(`${path} must be at most ${maximum} characters.`);
};

const requireRange = (value, minimum, maximum, path) => {
  requireNumber(value, path);
  if (value < minimum || value > maximum) throw new Error(`${path} must be between ${minimum} and ${maximum}.`);
};

const requireFieldPoint = (value, path) => {
  if (!isRecord(value)) throw new Error(`${path} must be an object.`);
  requireRange(value.x, 0, 53.33, `${path}.x`);
  requireRange(value.y, -15, 35, `${path}.y`);
};

const validateViz = (viz, lineIndex) => {
  const path = `Dialogue line ${lineIndex + 1} viz`;
  if (!isRecord(viz)) throw new Error(`${path} must be an object.`);
  if (typeof viz.kind !== 'string' || !viz.kind) throw new Error(`${path} requires kind.`);

  switch (viz.kind) {
    case 'title':
      requireString(viz.big, `${path}.big`);
      requireString(viz.sub, `${path}.sub`, true);
      requireString(viz.dateChip, `${path}.dateChip`, true);
      return;
    case 'rangeBar':
      requireString(viz.label, `${path}.label`);
      requireString(viz.unit, `${path}.unit`);
      requireNumber(viz.low, `${path}.low`);
      requireNumber(viz.high, `${path}.high`);
      if (viz.low < 0 || viz.high < viz.low) throw new Error(`${path} requires 0 <= low <= high.`);
      if (viz.compare !== undefined) {
        if (!isRecord(viz.compare)) throw new Error(`${path}.compare must be an object.`);
        requireString(viz.compare.label, `${path}.compare.label`);
        requireNumber(viz.compare.value, `${path}.compare.value`);
        if (viz.compare.value < 0) throw new Error(`${path}.compare.value must be non-negative.`);
      }
      requireString(viz.badge, `${path}.badge`, true);
      return;
    case 'counter':
      requireString(viz.label, `${path}.label`);
      requireNumber(viz.to, `${path}.to`);
      if (viz.from !== undefined) requireNumber(viz.from, `${path}.from`);
      requireString(viz.unit, `${path}.unit`, true);
      requireString(viz.prefix, `${path}.prefix`, true);
      requireOptionalBoolean(viz.negative, `${path}.negative`);
      requireString(viz.sub, `${path}.sub`, true);
      return;
    case 'statBig':
      requireString(viz.value, `${path}.value`);
      requireString(viz.label, `${path}.label`);
      requireString(viz.sub, `${path}.sub`, true);
      return;
    case 'compareBars':
      requireString(viz.unit, `${path}.unit`);
      if (!Array.isArray(viz.bars) || viz.bars.length < 2 || viz.bars.length > 4) {
        throw new Error(`${path}.bars requires 2 to 4 rows.`);
      }
      for (const [index, bar] of viz.bars.entries()) {
        if (!isRecord(bar)) throw new Error(`${path}.bars[${index}] must be an object.`);
        requireString(bar.label, `${path}.bars[${index}].label`);
        requireNumber(bar.value, `${path}.bars[${index}].value`);
        if (bar.tone !== undefined && !['accent', 'bone', 'blue'].includes(bar.tone)) {
          throw new Error(`${path}.bars[${index}].tone must be accent, bone, or blue.`);
        }
      }
      if (viz.reference !== undefined) {
        if (!isRecord(viz.reference)) throw new Error(`${path}.reference must be an object.`);
        requireString(viz.reference.label, `${path}.reference.label`);
        requireNumber(viz.reference.value, `${path}.reference.value`);
      }
      return;
    case 'leaderboard':
      if (!Array.isArray(viz.rows) || viz.rows.length === 0) throw new Error(`${path}.rows requires at least one row.`);
      for (const [index, row] of viz.rows.entries()) {
        if (!isRecord(row)) throw new Error(`${path}.rows[${index}] must be an object.`);
        requireString(row.label, `${path}.rows[${index}].label`);
        requireOptionalBoolean(row.highlight, `${path}.rows[${index}].highlight`);
      }
      requireString(viz.stamp, `${path}.stamp`, true);
      return;
    case 'meter':
      requireString(viz.from, `${path}.from`);
      requireString(viz.to, `${path}.to`);
      requireString(viz.label, `${path}.label`);
      return;
    case 'grid':
      requireNumber(viz.total, `${path}.total`);
      requireNumber(viz.filled, `${path}.filled`);
      if (!Number.isInteger(viz.total) || viz.total < 1) throw new Error(`${path}.total must be a positive integer.`);
      if (!Number.isInteger(viz.filled) || viz.filled < 0 || viz.filled > viz.total) {
        throw new Error(`${path}.filled must be an integer from 0 through total.`);
      }
      requireString(viz.filledLabel, `${path}.filledLabel`);
      requireString(viz.resultLabel, `${path}.resultLabel`);
      requireString(viz.caption, `${path}.caption`, true);
      return;
    case 'split':
      for (const side of ['left', 'right']) {
        if (!isRecord(viz[side])) throw new Error(`${path}.${side} must be an object.`);
        requireString(viz[side].label, `${path}.${side}.label`);
        requireString(viz[side].value, `${path}.${side}.value`);
      }
      requireString(viz.stamp, `${path}.stamp`, true);
      return;
    case 'fieldPlay': {
      requireString(viz.label, `${path}.label`, true);
      requireString(viz.losLabel, `${path}.losLabel`, true);
      if (viz.firstDownYd !== undefined) {
        requireNumber(viz.firstDownYd, `${path}.firstDownYd`);
        if (viz.firstDownYd <= 0 || viz.firstDownYd > 30) throw new Error(`${path}.firstDownYd must be greater than 0 and at most 30.`);
      }
      if (!Array.isArray(viz.players) || viz.players.length < 2 || viz.players.length > 14) {
        throw new Error(`${path}.players requires 2 to 14 players.`);
      }
      const playerIds = new Set();
      for (const [index, player] of viz.players.entries()) {
        const playerPath = `${path}.players[${index}]`;
        if (!isRecord(player)) throw new Error(`${playerPath} must be an object.`);
        requireString(player.id, `${playerPath}.id`);
        if (playerIds.has(player.id)) throw new Error(`${playerPath}.id must be unique.`);
        playerIds.add(player.id);
        requireString(player.label, `${playerPath}.label`);
        requireMaxLength(player.label, 3, `${playerPath}.label`);
        requireString(player.name, `${playerPath}.name`, true);
        requireEnum(player.team, ['offense', 'defense'], `${playerPath}.team`);
        if (player.role !== undefined) requireEnum(player.role, ['hero', 'blocker', 'defender'], `${playerPath}.role`);
        requireFieldPoint(player, playerPath);
      }
      if (!isRecord(viz.run)) throw new Error(`${path}.run must be an object.`);
      requireString(viz.run.playerId, `${path}.run.playerId`);
      if (!playerIds.has(viz.run.playerId)) throw new Error(`${path}.run.playerId must match a player id.`);
      if (!Array.isArray(viz.run.path) || viz.run.path.length < 2) throw new Error(`${path}.run.path requires at least two points.`);
      viz.run.path.forEach((point, index) => requireFieldPoint(point, `${path}.run.path[${index}]`));
      if (viz.blocks !== undefined) {
        if (!Array.isArray(viz.blocks)) throw new Error(`${path}.blocks must be an array.`);
        for (const [index, block] of viz.blocks.entries()) {
          const blockPath = `${path}.blocks[${index}]`;
          if (!isRecord(block)) throw new Error(`${blockPath} must be an object.`);
          requireString(block.id, `${blockPath}.id`);
          if (!playerIds.has(block.id)) throw new Error(`${blockPath}.id must match a player id.`);
          requireRange(block.dx, -6, 6, `${blockPath}.dx`);
          requireRange(block.dy, -6, 6, `${blockPath}.dy`);
        }
      }
      if (viz.lane !== undefined) {
        if (!isRecord(viz.lane)) throw new Error(`${path}.lane must be an object.`);
        requireRange(viz.lane.x, 0, 53.33, `${path}.lane.x`);
        requireNumber(viz.lane.width, `${path}.lane.width`);
        if (viz.lane.width <= 0 || viz.lane.width > 15) throw new Error(`${path}.lane.width must be greater than 0 and at most 15.`);
      }
      if (viz.fadeOnPass !== undefined) {
        if (!Array.isArray(viz.fadeOnPass)) throw new Error(`${path}.fadeOnPass must be an array.`);
        for (const [index, id] of viz.fadeOnPass.entries()) {
          requireString(id, `${path}.fadeOnPass[${index}]`);
          if (!playerIds.has(id)) throw new Error(`${path}.fadeOnPass[${index}] must match a player id.`);
        }
      }
      if (viz.callout !== undefined) {
        if (!isRecord(viz.callout)) throw new Error(`${path}.callout must be an object.`);
        requireString(viz.callout.text, `${path}.callout.text`);
        requireMaxLength(viz.callout.text, 28, `${path}.callout.text`);
        requireString(viz.callout.sub, `${path}.callout.sub`, true);
      }
      return;
    }
    case 'depthFlow':
      requireString(viz.label, `${path}.label`);
      for (const key of ['out', 'riser', 'flow']) {
        if (!isRecord(viz[key])) throw new Error(`${path}.${key} must be an object.`);
      }
      for (const key of ['name', 'jersey', 'stat', 'statLabel']) requireString(viz.out[key], `${path}.out.${key}`);
      requireMaxLength(viz.out.jersey, 3, `${path}.out.jersey`);
      for (const key of ['name', 'jersey']) requireString(viz.riser[key], `${path}.riser.${key}`);
      requireMaxLength(viz.riser.jersey, 3, `${path}.riser.jersey`);
      requireString(viz.riser.note, `${path}.riser.note`, true);
      requireNumber(viz.flow.to, `${path}.flow.to`);
      if (viz.flow.to <= 0) throw new Error(`${path}.flow.to must be greater than 0.`);
      requireString(viz.flow.unit, `${path}.flow.unit`);
      return;
    case 'speedRace':
      requireString(viz.label, `${path}.label`, true);
      requireString(viz.note, `${path}.note`, true);
      if (viz.distanceYd !== undefined) requireRange(viz.distanceYd, 10, 100, `${path}.distanceYd`);
      if (!Array.isArray(viz.runners) || viz.runners.length !== 2) throw new Error(`${path}.runners requires exactly two runners.`);
      for (const [index, runner] of viz.runners.entries()) {
        const runnerPath = `${path}.runners[${index}]`;
        if (!isRecord(runner)) throw new Error(`${runnerPath} must be an object.`);
        requireString(runner.name, `${runnerPath}.name`);
        requireString(runner.label, `${runnerPath}.label`);
        requireMaxLength(runner.label, 3, `${runnerPath}.label`);
        requireNumber(runner.time, `${runnerPath}.time`);
        if (runner.time <= 0) throw new Error(`${runnerPath}.time must be greater than 0.`);
        if (runner.tone !== undefined) requireEnum(runner.tone, ['accent', 'bone'], `${runnerPath}.tone`);
      }
      return;
    case 'zoneHeat': {
      requireString(viz.label, `${path}.label`);
      if (!Array.isArray(viz.zones) || viz.zones.length < 1 || viz.zones.length > 12) throw new Error(`${path}.zones requires 1 to 12 zones.`);
      let focusCount = 0;
      for (const [index, zone] of viz.zones.entries()) {
        const zonePath = `${path}.zones[${index}]`;
        if (!isRecord(zone)) throw new Error(`${zonePath} must be an object.`);
        requireEnum(zone.lane, ['left', 'middle', 'right'], `${zonePath}.lane`);
        requireEnum(zone.depth, ['backfield', 'short', 'mid', 'deep'], `${zonePath}.depth`);
        requireRange(zone.intensity, 0, 1, `${zonePath}.intensity`);
        requireString(zone.stat, `${zonePath}.stat`, true);
        requireMaxLength(zone.stat, 24, `${zonePath}.stat`);
        requireOptionalBoolean(zone.focus, `${zonePath}.focus`);
        if (zone.focus === true) focusCount++;
      }
      if (focusCount > 1) throw new Error(`${path}.zones may contain at most one focus zone.`);
      if (viz.marker !== undefined) {
        if (!isRecord(viz.marker)) throw new Error(`${path}.marker must be an object.`);
        requireString(viz.marker.name, `${path}.marker.name`);
        requireString(viz.marker.label, `${path}.marker.label`);
        requireMaxLength(viz.marker.label, 3, `${path}.marker.label`);
        requireEnum(viz.marker.lane, ['left', 'middle', 'right'], `${path}.marker.lane`);
        requireEnum(viz.marker.depth, ['backfield', 'short', 'mid', 'deep'], `${path}.marker.depth`);
      }
      return;
    }
    case 'riseRank':
      requireString(viz.label, `${path}.label`, true);
      if (!Array.isArray(viz.rungs) || viz.rungs.length < 2 || viz.rungs.length > 6) throw new Error(`${path}.rungs requires 2 to 6 rows.`);
      for (const [index, rung] of viz.rungs.entries()) {
        const rungPath = `${path}.rungs[${index}]`;
        if (!isRecord(rung)) throw new Error(`${rungPath} must be an object.`);
        requireString(rung.rank, `${rungPath}.rank`);
        requireString(rung.ghost, `${rungPath}.ghost`, true);
        requireString(rung.note, `${rungPath}.note`, true);
      }
      if (!isRecord(viz.climber)) throw new Error(`${path}.climber must be an object.`);
      requireString(viz.climber.name, `${path}.climber.name`);
      requireString(viz.climber.label, `${path}.climber.label`);
      requireMaxLength(viz.climber.label, 3, `${path}.climber.label`);
      requireString(viz.climber.stat, `${path}.climber.stat`, true);
      requireNumber(viz.fromIndex, `${path}.fromIndex`);
      requireNumber(viz.toIndex, `${path}.toIndex`);
      if (!Number.isInteger(viz.fromIndex) || !Number.isInteger(viz.toIndex) || viz.toIndex < 0 || viz.toIndex >= viz.fromIndex || viz.fromIndex > viz.rungs.length - 1) {
        throw new Error(`${path} requires integer indexes with 0 <= toIndex < fromIndex <= rungs.length - 1.`);
      }
      return;
    default:
      throw new Error(`${path}.kind is not supported: ${viz.kind}`);
  }
};

const validateScript = (value) => {
  if (!value || typeof value !== 'object') throw new Error('Script must be a JSON object.');
  for (const key of ['id', 'title']) {
    if (typeof value[key] !== 'string' || !value[key].trim()) throw new Error(`Script requires a non-empty ${key}.`);
  }
  if (value.format !== undefined && !['dialogue', 'narrator'].includes(value.format)) {
    throw new Error('Script format must be dialogue or narrator.');
  }
  requireString(value.eyebrow, 'Script eyebrow', true);
  value.format = value.format ?? 'dialogue';
  if (value.theme !== undefined) {
    if (!value.theme || typeof value.theme !== 'object') throw new Error('Script theme must be an object.');
    for (const key of ['name', 'accent', 'accentSoft']) {
      if (typeof value.theme[key] !== 'string' || !value.theme[key].trim()) {
        throw new Error(`Script theme requires a non-empty ${key}.`);
      }
    }
  }
  if (value.playbackSpeed !== undefined) {
    requireNumber(value.playbackSpeed, 'Script playbackSpeed');
  }
  value.playbackSpeed = Math.min(1.6, Math.max(1, value.playbackSpeed ?? 1.3));
  const dialogue = Array.isArray(value.lines) && value.lines.length > 0;
  if (dialogue) {
    requireString(value.dialogueModel, 'Script dialogueModel', true);
    if (value.dialogueSettings !== undefined) {
      if (!isRecord(value.dialogueSettings)) throw new Error('Script dialogueSettings must be an object.');
      if (value.dialogueSettings.stability !== undefined) {
        requireNumber(value.dialogueSettings.stability, 'Script dialogueSettings.stability');
      }
    }
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
      if (line.viz !== undefined) validateViz(line.viz, index);
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
    value.dialogueModel = value.dialogueModel?.trim() || 'eleven_v3';
    value.dialogueSettings = value.dialogueSettings ?? {stability: 0.65};
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

const applyPlaybackSpeed = async ({input, output, speed}) => {
  await run(FFMPEG, [
    '-y', '-i', input,
    '-filter_complex', `[0:v]setpts=PTS/${speed}[v];[0:a]atempo=${speed}[a]`,
    '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k',
    output,
  ], {label: `Applying ${speed.toFixed(2)}x playback speed`, quiet: true});
  const media = await probeMedia(output);
  console.log(`[studio] Final duration after speed-up: ${media.duration.toFixed(2)}s`);
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

const dialogueRequestBody = (episode) => ({
  inputs: episode.lines.map((line) => ({
    text: line.text,
    voice_id: episode.voices[line.speaker].voiceId,
  })),
  model_id: episode.dialogueModel ?? 'eleven_v3',
  settings: episode.dialogueSettings ?? {stability: 0.65},
});

const fetchElevenLabsDialogue = async ({apiKey, endpoint, episode, accept}) => {
  try {
    return await fetch(`https://api.elevenlabs.io/v1/text-to-dialogue${endpoint}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: accept,
      },
      body: JSON.stringify(dialogueRequestBody(episode)),
    });
  } catch {
    throw new Error('ElevenLabs dialogue request failed before receiving an HTTP response.');
  }
};

const extractDialogueAlignmentWords = (alignment, boundaryIndexes = []) => {
  const characters = alignment?.characters;
  const starts = alignment?.character_start_times_seconds ?? alignment?.characterStartTimesSeconds;
  const ends = alignment?.character_end_times_seconds ?? alignment?.characterEndTimesSeconds;
  if (!Array.isArray(characters) || !Array.isArray(starts) || !Array.isArray(ends)) return [];
  const boundaries = new Set(boundaryIndexes);
  const words = [];
  let current = null;
  const flush = () => {
    if (current?.text.trim()) words.push({...current, text: current.text.trim()});
    current = null;
  };
  for (let index = 0; index < characters.length; index++) {
    if (boundaries.has(index)) flush();
    const text = String(characters[index] ?? '');
    const startSeconds = Number(starts[index]);
    const endSeconds = Number(ends[index]);
    if (!text.trim()) {
      flush();
      continue;
    }
    if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) continue;
    if (!current) {
      current = {text, startMs: Math.round(startSeconds * 1000), endMs: Math.round(endSeconds * 1000)};
    } else {
      current.text += text;
      current.endMs = Math.round(endSeconds * 1000);
    }
  }
  flush();
  return words;
};

const extractElevenLabsDialogueTiming = (payload, lineCount) => {
  const segments = Array.isArray(payload?.voice_segments) ? payload.voice_segments : [];
  const grouped = Array.from({length: lineCount}, () => []);
  for (const segment of segments) {
    const inputIndex = Number(segment?.dialogue_input_index ?? segment?.dialogueInputIndex);
    const startSeconds = Number(segment?.start_time_seconds ?? segment?.startTimeSeconds);
    const endSeconds = Number(segment?.end_time_seconds ?? segment?.endTimeSeconds);
    if (
      Number.isInteger(inputIndex)
      && inputIndex >= 0
      && inputIndex < lineCount
      && Number.isFinite(startSeconds)
      && Number.isFinite(endSeconds)
      && endSeconds > startSeconds
    ) {
      grouped[inputIndex].push({startMs: Math.round(startSeconds * 1000), endMs: Math.round(endSeconds * 1000)});
    }
  }
  const lineOffsets = grouped.every((entries) => entries.length > 0)
    ? grouped.map((entries) => ({
        startMs: Math.min(...entries.map((entry) => entry.startMs)),
        endMs: Math.max(...entries.map((entry) => entry.endMs)),
      }))
    : null;
  const boundaryIndexes = segments
    .map((segment) => Number(segment?.character_start_index ?? segment?.characterStartIndex))
    .filter((value) => Number.isInteger(value) && value > 0);
  const alignment = payload?.alignment ?? payload?.normalized_alignment ?? payload?.normalizedAlignment;
  return {lineOffsets, words: extractDialogueAlignmentWords(alignment, boundaryIndexes)};
};

const decodeBase64Audio = (value) => {
  if (typeof value !== 'string' || !value) throw new Error('ElevenLabs dialogue timestamps response contained no audio.');
  const audio = Buffer.from(value.replace(/^data:[^;]+;base64,/, ''), 'base64');
  if (audio.length === 0) throw new Error('ElevenLabs returned an empty dialogue audio response.');
  return audio;
};

const requestElevenLabsDialogue = async ({apiKey, episode}) => {
  const timestampResponse = await fetchElevenLabsDialogue({
    apiKey,
    endpoint: '/with-timestamps',
    episode,
    accept: 'application/json',
  });
  if (timestampResponse.ok) {
    const contentType = timestampResponse.headers.get('content-type') ?? '';
    if (contentType.includes('audio/')) {
      const audio = Buffer.from(await timestampResponse.arrayBuffer());
      if (audio.length === 0) throw new Error('ElevenLabs returned an empty dialogue audio response.');
      return {audio, timing: null};
    }
    let payload;
    try {
      payload = await timestampResponse.json();
    } catch {
      throw new Error('ElevenLabs dialogue timestamps response was not valid JSON.');
    }
    return {
      audio: decodeBase64Audio(payload.audio_base64 ?? payload.audioBase64),
      timing: extractElevenLabsDialogueTiming(payload, episode.lines.length),
    };
  }
  if (![404, 405, 501].includes(timestampResponse.status)) {
    throw new Error(`ElevenLabs dialogue request failed with HTTP ${timestampResponse.status}.`);
  }
  console.warn('[studio] ElevenLabs dialogue timestamps are unavailable; using Whisper line alignment.');
  const response = await fetchElevenLabsDialogue({apiKey, endpoint: '', episode, accept: 'audio/mpeg'});
  if (!response.ok) throw new Error(`ElevenLabs dialogue request failed with HTTP ${response.status}.`);
  const audio = Buffer.from(await response.arrayBuffer());
  if (audio.length === 0) throw new Error('ElevenLabs returned an empty dialogue audio response.');
  return {audio, timing: null};
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

const synthesizeDialogue = async ({episode, generatedDir}) => {
  const mp3 = path.join(generatedDir, 'vo.mp3');
  const wav = path.join(generatedDir, 'vo.wav');
  const whisperWav = path.join(generatedDir, 'vo16k.wav');
  const {apiKey} = await readElevenLabsCredentials();
  console.log(`[studio] ElevenLabs Text-to-Dialogue — one natural take, ${episode.lines.length} turns`);
  const {audio, timing} = await requestElevenLabsDialogue({apiKey, episode});
  await writeFile(mp3, audio);
  await run(FFMPEG, [
    '-y', '-v', 'error', '-i', mp3,
    '-ar', '44100', '-ac', '1', '-c:a', 'pcm_s16le', wav,
  ], {label: 'Converting Text-to-Dialogue 44.1 kHz master WAV', quiet: true});
  await run(FFMPEG, [
    '-y', '-v', 'error', '-i', mp3,
    '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', whisperWav,
  ], {label: 'Converting Text-to-Dialogue 16 kHz Whisper WAV', quiet: true});
  const media = await probeMedia(wav);
  if (!Number.isFinite(media.duration) || media.duration <= 0) throw new Error('ffprobe could not measure dialogue duration.');
  return {wav, whisperWav, durationMs: Math.round(media.duration * 1000), dialogueTiming: timing};
};

const splitWordsByDialogueLine = (lines, words) => {
  const counts = lines.map((line) => line.text.trim().split(/\s+/).filter(Boolean).length);
  if (counts.reduce((sum, count) => sum + count, 0) !== words.length) return null;
  let cursor = 0;
  return counts.map((count) => {
    const lineWords = words.slice(cursor, cursor + count);
    cursor += count;
    return lineWords;
  });
};

const makeWordsForSpan = (text, startMs, endMs) => {
  const displayWords = text.trim().split(/\s+/).filter(Boolean);
  const span = Math.max(1, endMs - startMs);
  return displayWords.map((word, index) => ({
    text: word,
    startMs: Math.round(startMs + (span * index) / displayWords.length),
    endMs: Math.round(startMs + (span * (index + 0.9)) / displayWords.length),
  }));
};

const providerOffsetsAreUsable = (offsets, lineCount, durationMs) => {
  if (!Array.isArray(offsets) || offsets.length !== lineCount) return false;
  return offsets.every((offset, index) => (
    Number.isFinite(offset?.startMs)
    && Number.isFinite(offset?.endMs)
    && offset.startMs >= 0
    && offset.endMs > offset.startMs
    && offset.startMs < durationMs
    && offset.endMs <= durationMs + 250
    && (index === 0 || offset.startMs >= offsets[index - 1].startMs)
  ));
};

const makeDialogueLineTiming = ({episode, index, startMs, endMs, words}) => {
  const line = episode.lines[index];
  return {
    id: episode.scenes[index].id,
    lineIndex: index,
    speaker: line.speaker,
    text: line.text,
    visual: line.visual,
    ...(line.viz ? {viz: line.viz} : {}),
    startMs,
    endMs,
    words: words.map((word) => ({...word, speaker: line.speaker, lineIndex: index})),
  };
};

const resolveDialogueLineTimings = ({episode, words, durationMs, dialogueTiming}) => {
  if (providerOffsetsAreUsable(dialogueTiming?.lineOffsets, episode.lines.length, durationMs)) {
    const providerWords = dialogueTiming.words?.length
      ? alignNarrationToWords(episode.narration, dialogueTiming.words)
      : null;
    const authoredWords = providerWords ?? alignNarrationToWords(episode.narration, words);
    const splitWords = authoredWords ? splitWordsByDialogueLine(episode.lines, authoredWords) : null;
    const lineTimings = dialogueTiming.lineOffsets.map((offset, index) => {
      const startMs = Math.min(Math.max(0, offset.startMs), Math.max(0, durationMs - 40));
      const endMs = Math.max(startMs + 40, Math.min(durationMs, offset.endMs));
      const matchedWords = splitWords?.[index]
        ?? words.filter((word) => {
          const midpoint = (word.startMs + word.endMs) / 2;
          return midpoint >= startMs && midpoint <= endMs;
        });
      return makeDialogueLineTiming({
        episode,
        index,
        startMs,
        endMs,
        words: matchedWords.length > 0
          ? matchedWords
          : makeWordsForSpan(episode.lines[index].text, startMs, endMs),
      });
    });
    console.log('[studio] Using ElevenLabs dialogue and character timestamps.');
    return {lineTimings, words: authoredWords ?? words};
  }

  const aligned = alignDialogueLinesToWords({lines: episode.lines, words, durationMs});
  const fallbackIndex = aligned.findIndex((line) => line.fallback);
  if (fallbackIndex >= 0) {
    console.warn(
      `[studio] Dialogue alignment warning: line ${fallbackIndex + 1} had no confident Whisper match; `
      + 'using a proportional split for it and the remaining lines.',
    );
  } else {
    console.log('[studio] Dialogue lines aligned to the combined Whisper transcript.');
  }
  const lineTimings = aligned.map((timing, index) => makeDialogueLineTiming({
    episode,
    index,
    startMs: timing.startMs,
    endMs: timing.endMs,
    words: timing.words,
  }));
  return {lineTimings, words: lineTimings.flatMap((line) => line.words)};
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
  const whisperMedia = await probeMedia(whisperWav);
  if (!Number.isFinite(whisperMedia.duration) || Math.abs(whisperMedia.duration - media.duration) > 0.3) {
    throw new Error('Reused vo.wav and vo16k.wav durations do not match.');
  }
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
    for (const [index, timing] of lineTimings.entries()) {
      const line = episode.lines[index];
      if (
        timing?.lineIndex !== index
        || timing?.speaker !== line.speaker
        || timing?.text?.trim() !== line.text.trim()
        || timing?.id !== episode.scenes[index].id
        || !Number.isFinite(timing?.startMs)
        || !Number.isFinite(timing?.endMs)
        || timing.endMs <= timing.startMs
        || (index > 0 && timing.startMs < lineTimings[index - 1].startMs)
      ) {
        throw new Error(`Reused dialogue line ${index + 1} does not match this script or audio timeline.`);
      }
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
  const normalizedOutput = path.join(path.dirname(output), `.${path.basename(output)}.normalized-${process.pid}.mp4`);
  const speedOutput = path.join(path.dirname(output), `.${path.basename(output)}.speeding-${process.pid}.mp4`);
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
    if (episode.playbackSpeed === 1) {
      await loudnormFinalMix({input: intermediateOutput, output});
    } else {
      await loudnormFinalMix({input: intermediateOutput, output: normalizedOutput});
      await applyPlaybackSpeed({input: normalizedOutput, output: speedOutput, speed: episode.playbackSpeed});
      await rename(speedOutput, output);
    }
  } finally {
    await unlink(intermediateOutput).catch(() => undefined);
    await unlink(normalizedOutput).catch(() => undefined);
    await unlink(speedOutput).catch(() => undefined);
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
  const narrationResult = args.reuseAudio
    ? await reuseNarration({episode, generatedDir})
    : await synthesizeNarration({episode, generatedDir, voice, rate});
  const {whisperWav, durationMs, dialogueTiming} = narrationResult;
  let lineTimings = narrationResult.lineTimings ?? [];
  let words = await transcribe({episode, generatedDir, whisperWav, durationMs, lineTimings});
  if (dialogue && !args.reuseAudio) {
    const resolvedDialogue = resolveDialogueLineTimings({episode, words, durationMs, dialogueTiming});
    lineTimings = resolvedDialogue.lineTimings;
    words = resolvedDialogue.words;
    await writeFile(path.join(generatedDir, 'lines.json'), `${JSON.stringify(lineTimings, null, 2)}\n`);
  } else if (dialogue) {
    const artifactWords = lineTimings.flatMap((line) => Array.isArray(line.words) ? line.words : []);
    if (artifactWords.length > 0) words = artifactWords;
  }
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
