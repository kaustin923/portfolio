export type VoiceConfig = {
  name: string;
  rate: number;
};

export type EpisodeFormat = 'dialogue' | 'narrator';

export type DialogueSpeaker = 'jessica' | 'george';

export type FieldPt = {x: number; y: number};

export type FieldPlayViz = {
  kind: 'fieldPlay';
  label?: string;
  losLabel?: string;
  firstDownYd?: number;
  players: Array<{
    id: string;
    label: string;
    name?: string;
    team: 'offense' | 'defense';
    role?: 'hero' | 'blocker' | 'defender';
    x: number;
    y: number;
  }>;
  blocks?: Array<{id: string; dx: number; dy: number}>;
  lane?: {x: number; width: number};
  run: {playerId: string; path: FieldPt[]};
  fadeOnPass?: string[];
  callout?: {text: string; sub?: string};
};

export type DepthFlowViz = {
  kind: 'depthFlow';
  label: string;
  out: {name: string; jersey: string; stat: string; statLabel: string};
  riser: {name: string; jersey: string; note?: string};
  flow: {to: number; unit: string};
};

export type SpeedRaceViz = {
  kind: 'speedRace';
  label?: string;
  distanceYd?: number;
  runners: [
    {name: string; label: string; time: number; tone?: 'accent' | 'bone'},
    {name: string; label: string; time: number; tone?: 'accent' | 'bone'},
  ];
  note?: string;
};

export type ZoneHeatViz = {
  kind: 'zoneHeat';
  label: string;
  zones: Array<{
    lane: 'left' | 'middle' | 'right';
    depth: 'backfield' | 'short' | 'mid' | 'deep';
    intensity: number;
    stat?: string;
    focus?: boolean;
  }>;
  marker?: {
    name: string;
    label: string;
    lane: 'left' | 'middle' | 'right';
    depth: 'backfield' | 'short' | 'mid' | 'deep';
  };
};

export type RiseRankViz = {
  kind: 'riseRank';
  label?: string;
  rungs: Array<{rank: string; ghost?: string; note?: string}>;
  climber: {name: string; label: string; stat?: string};
  fromIndex: number;
  toIndex: number;
};

export type Viz =
  | {kind: 'title'; big: string; sub?: string; dateChip?: string}
  | {
      kind: 'rangeBar';
      label: string;
      unit: string;
      low: number;
      high: number;
      compare?: {label: string; value: number};
      badge?: string;
    }
  | {
      kind: 'counter';
      label: string;
      to: number;
      unit?: string;
      prefix?: string;
      from?: number;
      negative?: boolean;
      sub?: string;
    }
  | {kind: 'statBig'; value: string; label: string; sub?: string}
  | {
      kind: 'compareBars';
      unit: string;
      bars: Array<{label: string; value: number; tone?: 'accent' | 'bone' | 'blue'}>;
      reference?: {label: string; value: number};
    }
  | {kind: 'leaderboard'; rows: Array<{label: string; highlight?: boolean}>; stamp?: string}
  | {kind: 'meter'; from: string; to: string; label: string}
  | {
      kind: 'grid';
      total: number;
      filled: number;
      filledLabel: string;
      resultLabel: string;
      caption?: string;
    }
  | {
      kind: 'split';
      left: {label: string; value: string};
      right: {label: string; value: string};
      stamp?: string;
    }
  | FieldPlayViz
  | DepthFlowViz
  | SpeedRaceViz
  | ZoneHeatViz
  | RiseRankViz;

export type DialogueLineScript = {
  speaker: DialogueSpeaker;
  text: string;
  visual: string;
  viz?: Viz;
};

export type DialogueVoiceConfig = {
  voiceId: string;
};

export type DialogueVoices = Record<DialogueSpeaker, DialogueVoiceConfig>;

export type DialogueSettings = {
  stability?: number;
  [key: string]: unknown;
};

export type EpisodeTheme = {
  name: string;
  accent: string;
  accentSoft: string;
};

export type SceneScript = {
  id: string;
  cue: string;
  type?:
    | 'hook'
    | 'receipt'
    | 'call-1'
    | 'call-2'
    | 'call-3'
    | 'loop'
    | 'edu-hook'
    | 'edu-cloud'
    | 'edu-shrink'
    | 'edu-privacy'
    | 'edu-everywhere'
    | 'edu-outro'
    | 'edu-dialogue';
  [key: string]: unknown;
};

export type EpisodeScriptInput = {
  id: string;
  title: string;
  format?: EpisodeFormat;
  eyebrow?: string;
  playbackSpeed?: number;
  voice?: VoiceConfig;
  narration?: string;
  scenes?: SceneScript[];
  lines?: DialogueLineScript[];
  voices?: Partial<DialogueVoices>;
  dialogueModel?: string;
  dialogueSettings?: DialogueSettings;
  theme?: EpisodeTheme;
};

export type EpisodeScript = Omit<EpisodeScriptInput, 'narration' | 'scenes' | 'voices' | 'format'> & {
  format: EpisodeFormat;
  narration: string;
  scenes: SceneScript[];
  voices?: DialogueVoices;
};

export type WordTiming = {
  text: string;
  startMs: number;
  endMs: number;
  speaker?: DialogueSpeaker;
  lineIndex?: number;
};

export type CaptionPage = {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  words?: WordTiming[];
  speaker?: DialogueSpeaker;
  lineIndex?: number;
};

export type DialogueLineTiming = DialogueLineScript & {
  id: string;
  lineIndex: number;
  startMs: number;
  endMs: number;
  words?: WordTiming[];
};

export type ResolvedCue = {
  id: string;
  cue: string;
  startMs: number;
  endMs: number;
  score: number;
  matchedText: string;
  fallback: boolean;
  speaker?: DialogueSpeaker;
  lineIndex?: number;
};

export type EpisodeTiming = {
  durationMs: number;
  durationInFrames: number;
  words: WordTiming[];
  captions: CaptionPage[];
  cues: ResolvedCue[];
  lineTimings?: DialogueLineTiming[];
};

export type EpisodeProps = {
  episode: EpisodeScript;
  timing: EpisodeTiming;
  assetBase: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const assertString = (value: unknown, path: string, optional = false) => {
  if (optional && value === undefined) return;
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${path} requires a non-empty string.`);
};

const assertNumber = (value: unknown, path: string) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${path} requires a finite number.`);
};

const assertOptionalBoolean = (value: unknown, path: string) => {
  if (value !== undefined && typeof value !== 'boolean') throw new Error(`${path} must be a boolean.`);
};

const assertEnum = (value: unknown, allowed: readonly string[], path: string) => {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new Error(`${path} must be one of: ${allowed.join(', ')}.`);
  }
};

const assertMaxLength = (value: unknown, maximum: number, path: string) => {
  if (typeof value === 'string' && value.length > maximum) throw new Error(`${path} must be at most ${maximum} characters.`);
};

const assertRange = (value: unknown, minimum: number, maximum: number, path: string) => {
  assertNumber(value, path);
  if ((value as number) < minimum || (value as number) > maximum) {
    throw new Error(`${path} must be between ${minimum} and ${maximum}.`);
  }
};

const assertFieldPoint = (value: unknown, path: string) => {
  if (!isRecord(value)) throw new Error(`${path} must be an object.`);
  assertRange(value.x, 0, 53.33, `${path}.x`);
  assertRange(value.y, -15, 35, `${path}.y`);
};

const assertViz: (value: unknown, lineIndex: number) => asserts value is Viz = (value, lineIndex) => {
  const path = `Dialogue line ${lineIndex + 1} viz`;
  if (!isRecord(value)) throw new Error(`${path} must be an object.`);
  if (typeof value.kind !== 'string' || !value.kind) throw new Error(`${path} requires kind.`);

  switch (value.kind) {
    case 'title':
      assertString(value.big, `${path}.big`);
      assertString(value.sub, `${path}.sub`, true);
      assertString(value.dateChip, `${path}.dateChip`, true);
      return;
    case 'rangeBar': {
      assertString(value.label, `${path}.label`);
      assertString(value.unit, `${path}.unit`);
      assertNumber(value.low, `${path}.low`);
      assertNumber(value.high, `${path}.high`);
      if ((value.low as number) < 0 || (value.high as number) < (value.low as number)) {
        throw new Error(`${path} requires 0 <= low <= high.`);
      }
      if (value.compare !== undefined) {
        if (!isRecord(value.compare)) throw new Error(`${path}.compare must be an object.`);
        assertString(value.compare.label, `${path}.compare.label`);
        assertNumber(value.compare.value, `${path}.compare.value`);
        if ((value.compare.value as number) < 0) throw new Error(`${path}.compare.value must be non-negative.`);
      }
      assertString(value.badge, `${path}.badge`, true);
      return;
    }
    case 'counter':
      assertString(value.label, `${path}.label`);
      assertNumber(value.to, `${path}.to`);
      if (value.from !== undefined) assertNumber(value.from, `${path}.from`);
      assertString(value.unit, `${path}.unit`, true);
      assertString(value.prefix, `${path}.prefix`, true);
      assertOptionalBoolean(value.negative, `${path}.negative`);
      assertString(value.sub, `${path}.sub`, true);
      return;
    case 'statBig':
      assertString(value.value, `${path}.value`);
      assertString(value.label, `${path}.label`);
      assertString(value.sub, `${path}.sub`, true);
      return;
    case 'compareBars': {
      assertString(value.unit, `${path}.unit`);
      if (!Array.isArray(value.bars) || value.bars.length < 2 || value.bars.length > 4) {
        throw new Error(`${path}.bars requires 2 to 4 rows.`);
      }
      for (const [index, bar] of value.bars.entries()) {
        if (!isRecord(bar)) throw new Error(`${path}.bars[${index}] must be an object.`);
        assertString(bar.label, `${path}.bars[${index}].label`);
        assertNumber(bar.value, `${path}.bars[${index}].value`);
        if (bar.tone !== undefined && !['accent', 'bone', 'blue'].includes(String(bar.tone))) {
          throw new Error(`${path}.bars[${index}].tone must be accent, bone, or blue.`);
        }
      }
      if (value.reference !== undefined) {
        if (!isRecord(value.reference)) throw new Error(`${path}.reference must be an object.`);
        assertString(value.reference.label, `${path}.reference.label`);
        assertNumber(value.reference.value, `${path}.reference.value`);
      }
      return;
    }
    case 'leaderboard':
      if (!Array.isArray(value.rows) || value.rows.length === 0) throw new Error(`${path}.rows requires at least one row.`);
      for (const [index, row] of value.rows.entries()) {
        if (!isRecord(row)) throw new Error(`${path}.rows[${index}] must be an object.`);
        assertString(row.label, `${path}.rows[${index}].label`);
        assertOptionalBoolean(row.highlight, `${path}.rows[${index}].highlight`);
      }
      assertString(value.stamp, `${path}.stamp`, true);
      return;
    case 'meter':
      assertString(value.from, `${path}.from`);
      assertString(value.to, `${path}.to`);
      assertString(value.label, `${path}.label`);
      return;
    case 'grid':
      assertNumber(value.total, `${path}.total`);
      assertNumber(value.filled, `${path}.filled`);
      if (!Number.isInteger(value.total) || (value.total as number) < 1) throw new Error(`${path}.total must be a positive integer.`);
      if (!Number.isInteger(value.filled) || (value.filled as number) < 0 || (value.filled as number) > (value.total as number)) {
        throw new Error(`${path}.filled must be an integer from 0 through total.`);
      }
      assertString(value.filledLabel, `${path}.filledLabel`);
      assertString(value.resultLabel, `${path}.resultLabel`);
      assertString(value.caption, `${path}.caption`, true);
      return;
    case 'split':
      for (const side of ['left', 'right'] as const) {
        if (!isRecord(value[side])) throw new Error(`${path}.${side} must be an object.`);
        assertString(value[side].label, `${path}.${side}.label`);
        assertString(value[side].value, `${path}.${side}.value`);
      }
      assertString(value.stamp, `${path}.stamp`, true);
      return;
    case 'fieldPlay': {
      assertString(value.label, `${path}.label`, true);
      assertString(value.losLabel, `${path}.losLabel`, true);
      if (value.firstDownYd !== undefined) assertRange(value.firstDownYd, Number.EPSILON, 30, `${path}.firstDownYd`);
      if (!Array.isArray(value.players) || value.players.length < 2 || value.players.length > 14) {
        throw new Error(`${path}.players requires 2 to 14 players.`);
      }
      const playerIds = new Set<string>();
      for (const [index, player] of value.players.entries()) {
        const playerPath = `${path}.players[${index}]`;
        if (!isRecord(player)) throw new Error(`${playerPath} must be an object.`);
        assertString(player.id, `${playerPath}.id`);
        if (playerIds.has(player.id as string)) throw new Error(`${playerPath}.id must be unique.`);
        playerIds.add(player.id as string);
        assertString(player.label, `${playerPath}.label`);
        assertMaxLength(player.label, 3, `${playerPath}.label`);
        assertString(player.name, `${playerPath}.name`, true);
        assertEnum(player.team, ['offense', 'defense'], `${playerPath}.team`);
        if (player.role !== undefined) assertEnum(player.role, ['hero', 'blocker', 'defender'], `${playerPath}.role`);
        assertFieldPoint(player, playerPath);
      }
      if (!isRecord(value.run)) throw new Error(`${path}.run must be an object.`);
      assertString(value.run.playerId, `${path}.run.playerId`);
      if (!playerIds.has(value.run.playerId as string)) throw new Error(`${path}.run.playerId must match a player id.`);
      if (!Array.isArray(value.run.path) || value.run.path.length < 2) throw new Error(`${path}.run.path requires at least two points.`);
      value.run.path.forEach((point, index) => assertFieldPoint(point, `${path}.run.path[${index}]`));
      if (value.blocks !== undefined) {
        if (!Array.isArray(value.blocks)) throw new Error(`${path}.blocks must be an array.`);
        for (const [index, block] of value.blocks.entries()) {
          const blockPath = `${path}.blocks[${index}]`;
          if (!isRecord(block)) throw new Error(`${blockPath} must be an object.`);
          assertString(block.id, `${blockPath}.id`);
          if (!playerIds.has(block.id as string)) throw new Error(`${blockPath}.id must match a player id.`);
          assertRange(block.dx, -6, 6, `${blockPath}.dx`);
          assertRange(block.dy, -6, 6, `${blockPath}.dy`);
        }
      }
      if (value.lane !== undefined) {
        if (!isRecord(value.lane)) throw new Error(`${path}.lane must be an object.`);
        assertRange(value.lane.x, 0, 53.33, `${path}.lane.x`);
        assertNumber(value.lane.width, `${path}.lane.width`);
        if ((value.lane.width as number) <= 0 || (value.lane.width as number) > 15) throw new Error(`${path}.lane.width must be greater than 0 and at most 15.`);
      }
      if (value.fadeOnPass !== undefined) {
        if (!Array.isArray(value.fadeOnPass)) throw new Error(`${path}.fadeOnPass must be an array.`);
        for (const [index, id] of value.fadeOnPass.entries()) {
          assertString(id, `${path}.fadeOnPass[${index}]`);
          if (!playerIds.has(id as string)) throw new Error(`${path}.fadeOnPass[${index}] must match a player id.`);
        }
      }
      if (value.callout !== undefined) {
        if (!isRecord(value.callout)) throw new Error(`${path}.callout must be an object.`);
        assertString(value.callout.text, `${path}.callout.text`);
        assertMaxLength(value.callout.text, 28, `${path}.callout.text`);
        assertString(value.callout.sub, `${path}.callout.sub`, true);
      }
      return;
    }
    case 'depthFlow': {
      assertString(value.label, `${path}.label`);
      const out = value.out;
      const riser = value.riser;
      const flow = value.flow;
      if (!isRecord(out)) throw new Error(`${path}.out must be an object.`);
      if (!isRecord(riser)) throw new Error(`${path}.riser must be an object.`);
      if (!isRecord(flow)) throw new Error(`${path}.flow must be an object.`);
      for (const key of ['name', 'jersey', 'stat', 'statLabel'] as const) assertString(out[key], `${path}.out.${key}`);
      assertMaxLength(out.jersey, 3, `${path}.out.jersey`);
      for (const key of ['name', 'jersey'] as const) assertString(riser[key], `${path}.riser.${key}`);
      assertMaxLength(riser.jersey, 3, `${path}.riser.jersey`);
      assertString(riser.note, `${path}.riser.note`, true);
      assertNumber(flow.to, `${path}.flow.to`);
      if ((flow.to as number) <= 0) throw new Error(`${path}.flow.to must be greater than 0.`);
      assertString(flow.unit, `${path}.flow.unit`);
      return;
    }
    case 'speedRace': {
      assertString(value.label, `${path}.label`, true);
      assertString(value.note, `${path}.note`, true);
      if (value.distanceYd !== undefined) assertRange(value.distanceYd, 10, 100, `${path}.distanceYd`);
      if (!Array.isArray(value.runners) || value.runners.length !== 2) throw new Error(`${path}.runners requires exactly two runners.`);
      for (const [index, runner] of value.runners.entries()) {
        const runnerPath = `${path}.runners[${index}]`;
        if (!isRecord(runner)) throw new Error(`${runnerPath} must be an object.`);
        assertString(runner.name, `${runnerPath}.name`);
        assertString(runner.label, `${runnerPath}.label`);
        assertMaxLength(runner.label, 3, `${runnerPath}.label`);
        assertNumber(runner.time, `${runnerPath}.time`);
        if ((runner.time as number) <= 0) throw new Error(`${runnerPath}.time must be greater than 0.`);
        if (runner.tone !== undefined) assertEnum(runner.tone, ['accent', 'bone'], `${runnerPath}.tone`);
      }
      return;
    }
    case 'zoneHeat': {
      assertString(value.label, `${path}.label`);
      if (!Array.isArray(value.zones) || value.zones.length < 1 || value.zones.length > 12) {
        throw new Error(`${path}.zones requires 1 to 12 zones.`);
      }
      let focusCount = 0;
      for (const [index, zone] of value.zones.entries()) {
        const zonePath = `${path}.zones[${index}]`;
        if (!isRecord(zone)) throw new Error(`${zonePath} must be an object.`);
        assertEnum(zone.lane, ['left', 'middle', 'right'], `${zonePath}.lane`);
        assertEnum(zone.depth, ['backfield', 'short', 'mid', 'deep'], `${zonePath}.depth`);
        assertRange(zone.intensity, 0, 1, `${zonePath}.intensity`);
        assertString(zone.stat, `${zonePath}.stat`, true);
        assertMaxLength(zone.stat, 24, `${zonePath}.stat`);
        assertOptionalBoolean(zone.focus, `${zonePath}.focus`);
        if (zone.focus === true) focusCount++;
      }
      if (focusCount > 1) throw new Error(`${path}.zones may contain at most one focus zone.`);
      if (value.marker !== undefined) {
        if (!isRecord(value.marker)) throw new Error(`${path}.marker must be an object.`);
        assertString(value.marker.name, `${path}.marker.name`);
        assertString(value.marker.label, `${path}.marker.label`);
        assertMaxLength(value.marker.label, 3, `${path}.marker.label`);
        assertEnum(value.marker.lane, ['left', 'middle', 'right'], `${path}.marker.lane`);
        assertEnum(value.marker.depth, ['backfield', 'short', 'mid', 'deep'], `${path}.marker.depth`);
      }
      return;
    }
    case 'riseRank': {
      assertString(value.label, `${path}.label`, true);
      if (!Array.isArray(value.rungs) || value.rungs.length < 2 || value.rungs.length > 6) {
        throw new Error(`${path}.rungs requires 2 to 6 rows.`);
      }
      for (const [index, rung] of value.rungs.entries()) {
        const rungPath = `${path}.rungs[${index}]`;
        if (!isRecord(rung)) throw new Error(`${rungPath} must be an object.`);
        assertString(rung.rank, `${rungPath}.rank`);
        assertString(rung.ghost, `${rungPath}.ghost`, true);
        assertString(rung.note, `${rungPath}.note`, true);
      }
      if (!isRecord(value.climber)) throw new Error(`${path}.climber must be an object.`);
      assertString(value.climber.name, `${path}.climber.name`);
      assertString(value.climber.label, `${path}.climber.label`);
      assertMaxLength(value.climber.label, 3, `${path}.climber.label`);
      assertString(value.climber.stat, `${path}.climber.stat`, true);
      assertNumber(value.fromIndex, `${path}.fromIndex`);
      assertNumber(value.toIndex, `${path}.toIndex`);
      if (!Number.isInteger(value.fromIndex) || !Number.isInteger(value.toIndex) || (value.toIndex as number) < 0 || (value.toIndex as number) >= (value.fromIndex as number) || (value.fromIndex as number) > value.rungs.length - 1) {
        throw new Error(`${path} requires integer indexes with 0 <= toIndex < fromIndex <= rungs.length - 1.`);
      }
      return;
    }
    default:
      throw new Error(`${path}.kind is not supported: ${value.kind}`);
  }
};

export const assertEpisodeScript = (value: unknown): EpisodeScript => {
  if (!value || typeof value !== 'object') {
    throw new Error('Script must be a JSON object.');
  }
  const candidate = value as Partial<EpisodeScriptInput>;
  if (!candidate.id || !candidate.title) {
    throw new Error('Script requires non-empty id and title fields.');
  }
  if (candidate.format !== undefined && !['dialogue', 'narrator'].includes(candidate.format)) {
    throw new Error('Script format must be dialogue or narrator.');
  }
  assertString(candidate.eyebrow, 'Script eyebrow', true);
  const format = candidate.format ?? 'dialogue';
  if (candidate.theme) {
    for (const key of ['name', 'accent', 'accentSoft'] as const) {
      if (!candidate.theme[key]?.trim()) throw new Error(`Script theme requires non-empty ${key}.`);
    }
  }
  if (candidate.playbackSpeed !== undefined) {
    assertNumber(candidate.playbackSpeed, 'Script playbackSpeed');
  }
  const playbackSpeed = Math.min(1.6, Math.max(1, candidate.playbackSpeed ?? 1.3));
  const dialogue = Array.isArray(candidate.lines) && candidate.lines.length > 0;
  if (dialogue) {
    assertString(candidate.dialogueModel, 'Script dialogueModel', true);
    if (candidate.dialogueSettings !== undefined) {
      if (!isRecord(candidate.dialogueSettings)) throw new Error('Script dialogueSettings must be an object.');
      if (candidate.dialogueSettings.stability !== undefined) {
        assertNumber(candidate.dialogueSettings.stability, 'Script dialogueSettings.stability');
      }
    }
    for (const [index, line] of candidate.lines!.entries()) {
      if (!['jessica', 'george'].includes(line?.speaker) || !line?.text?.trim() || !line?.visual?.trim()) {
        throw new Error(`Dialogue line ${index + 1} requires speaker, text, and visual.`);
      }
      if (line.viz !== undefined) assertViz(line.viz, index);
    }
    for (const speaker of ['jessica', 'george'] as const) {
      if (candidate.voices?.[speaker] && !candidate.voices[speaker]?.voiceId?.trim()) {
        throw new Error(`Dialogue voice ${speaker} requires a non-empty voiceId.`);
      }
    }
    const voices: DialogueVoices = {
      jessica: {voiceId: candidate.voices?.jessica?.voiceId || 'cgSgspJ2msm6clMCkdW9'},
      george: {voiceId: candidate.voices?.george?.voiceId || 'JBFqnCBsd6RMkjVDRZzb'},
    };
    const authoredScenes = candidate.scenes ?? [];
    return {
      ...candidate,
      id: candidate.id,
      title: candidate.title,
      format,
      playbackSpeed,
      narration: candidate.lines!.map((line) => line.text.trim()).join(' '),
      dialogueModel: candidate.dialogueModel?.trim() || 'eleven_v3',
      dialogueSettings: candidate.dialogueSettings ?? {stability: 0.65},
      scenes: candidate.lines!.map((line, index) => ({
        ...(authoredScenes[index] ?? {}),
        id: authoredScenes[index]?.id || `line-${index + 1}`,
        cue: authoredScenes[index]?.cue || line.text,
        type: authoredScenes[index]?.type || 'edu-dialogue',
        lineIndex: index,
      })),
      voices,
    };
  } else {
    if (!candidate.narration?.trim()) throw new Error('Script requires non-empty narration or dialogue lines.');
    if (!candidate.voice || typeof candidate.voice.name !== 'string' || !Number.isFinite(candidate.voice.rate)) {
      throw new Error('Script voice requires a name and numeric rate.');
    }
  }
  if (!dialogue && (!Array.isArray(candidate.scenes) || candidate.scenes.length === 0)) {
    throw new Error('Script requires at least one scene.');
  }
  for (const [index, scene] of (candidate.scenes ?? []).entries()) {
    if (!scene?.id || !scene?.cue) {
      throw new Error(`Scene ${index + 1} requires id and cue.`);
    }
  }
  candidate.playbackSpeed = playbackSpeed;
  candidate.format = format;
  return candidate as EpisodeScript;
};
