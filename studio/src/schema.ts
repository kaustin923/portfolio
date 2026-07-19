export type VoiceConfig = {
  name: string;
  rate: number;
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
    | 'edu-outro';
  [key: string]: unknown;
};

export type EpisodeScript = {
  id: string;
  title: string;
  voice: VoiceConfig;
  narration: string;
  scenes: SceneScript[];
};

export type WordTiming = {
  text: string;
  startMs: number;
  endMs: number;
};

export type CaptionPage = {
  id: string;
  text: string;
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
};

export type EpisodeTiming = {
  durationMs: number;
  durationInFrames: number;
  words: WordTiming[];
  captions: CaptionPage[];
  cues: ResolvedCue[];
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
  const candidate = value as Partial<EpisodeScript>;
  if (!candidate.id || !candidate.title || !candidate.narration) {
    throw new Error('Script requires non-empty id, title, and narration fields.');
  }
  if (!candidate.voice || typeof candidate.voice.name !== 'string' || !Number.isFinite(candidate.voice.rate)) {
    throw new Error('Script voice requires a name and numeric rate.');
  }
  if (!Array.isArray(candidate.scenes) || candidate.scenes.length === 0) {
    throw new Error('Script requires at least one scene.');
  }
  for (const [index, scene] of candidate.scenes.entries()) {
    if (!scene?.id || !scene?.cue) {
      throw new Error(`Scene ${index + 1} requires id and cue.`);
    }
  }
  return candidate as EpisodeScript;
};
