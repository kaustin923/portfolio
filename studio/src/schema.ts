export type VoiceConfig = {
  name: string;
  rate: number;
};

export type DialogueSpeaker = 'jessica' | 'george';

export type DialogueLineScript = {
  speaker: DialogueSpeaker;
  text: string;
  visual: string;
};

export type DialogueVoiceConfig = {
  voiceId: string;
};

export type DialogueVoices = Record<DialogueSpeaker, DialogueVoiceConfig>;

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
    for (const [index, line] of candidate.lines!.entries()) {
      if (!['jessica', 'george'].includes(line?.speaker) || !line?.text?.trim() || !line?.visual?.trim()) {
        throw new Error(`Dialogue line ${index + 1} requires speaker, text, and visual.`);
      }
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
