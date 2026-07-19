import type {CaptionPage, DialogueLineTiming, EpisodeTiming, SceneScript, WordTiming} from './schema';

export const normalizeTokens: (value: unknown) => string[];
export const extractWhisperWords: (payload: unknown) => WordTiming[];
export const buildCaptionPages: (words: WordTiming[]) => CaptionPage[];
export const alignNarrationToWords: (narration: string, words: WordTiming[]) => WordTiming[] | null;
export const resolveEpisodeTiming: (args: {
  words: WordTiming[];
  scenes: SceneScript[];
  narration: string;
  durationMs: number;
  lineTimings?: DialogueLineTiming[];
  fps?: number;
  threshold?: number;
}) => EpisodeTiming;
