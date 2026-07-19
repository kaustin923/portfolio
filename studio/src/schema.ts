export type VoiceConfig = {
  name: string;
  rate: number;
};

export type DialogueSpeaker = 'jessica' | 'george';

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
    };

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
  voice?: VoiceConfig;
  narration?: string;
  scenes?: SceneScript[];
  lines?: DialogueLineScript[];
  voices?: Partial<DialogueVoices>;
  dialogueModel?: string;
  dialogueSettings?: DialogueSettings;
  theme?: EpisodeTheme;
};

export type EpisodeScript = Omit<EpisodeScriptInput, 'narration' | 'scenes' | 'voices'> & {
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
  if (candidate.theme) {
    for (const key of ['name', 'accent', 'accentSoft'] as const) {
      if (!candidate.theme[key]?.trim()) throw new Error(`Script theme requires non-empty ${key}.`);
    }
  }
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
  return candidate as EpisodeScript;
};
