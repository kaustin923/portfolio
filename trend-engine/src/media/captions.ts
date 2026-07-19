/** Layout shared by burned-in text and future ASS subtitle rendering. */
export const SAFE_AREA = {
  canvas: { width: 1080, height: 1920 },
  x: { min: 90, max: 990 },
  y: { min: 260, max: 1660 },
  bottomMarginPx: 440,
} as const;

/**
 * Escape untrusted text for an ffmpeg drawtext filter value.
 *
 * The result must be embedded UNQUOTED (`drawtext=text=<escaped>:...`).
 * ffmpeg quoting offers no escaping inside quotes, so a quoted wrapper cannot
 * survive apostrophes. Three parsers each unescape the value once:
 *   1. drawtext text expansion (`\X` → X, `%{...}` expands),
 *   2. the filter option tokenizer (`\` and `'` special, `:` splits options),
 *   3. the filtergraph tokenizer (`\` and `'` special, `[],;` structural).
 */
export function escapeDrawtext(text: string): string {
  const expansionEscaped = text
    .replace(/[\r\n]+/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%');
  const optionEscaped = expansionEscaped.replace(/[\\':]/g, (char) => `\\${char}`);
  return optionEscaped.replace(/[\\'[\],;]/g, (char) => `\\${char}`);
}

/** Greedy word wrapping with hard breaks for tokens wider than a line. */
export function wrapText(text: string, maxChars: number): string[] {
  const width = Math.max(1, Math.floor(maxChars));
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const pieces: string[] = [];
    for (let offset = 0; offset < word.length; offset += width) {
      pieces.push(word.slice(offset, offset + width));
    }

    for (const piece of pieces) {
      if (!current) {
        current = piece;
      } else if (current.length + 1 + piece.length <= width) {
        current += ` ${piece}`;
      } else {
        lines.push(current);
        current = piece;
      }

      if (piece.length === width && current === piece) {
        lines.push(current);
        current = '';
      }
    }
  }

  if (current) lines.push(current);
  return lines;
}

/** Escape text for the ASS dialogue payload used by this module. */
export function assEscape(text: string): string {
  return text.replace(/[{}]/g, '').replace(/\r\n|\r|\n/g, '\\N');
}

function assTimestamp(durationSec: number): string {
  const totalCentiseconds = Math.max(0, Math.round(durationSec * 100));
  const hours = Math.floor(totalCentiseconds / 360_000);
  const minutes = Math.floor((totalCentiseconds % 360_000) / 6_000);
  const seconds = Math.floor((totalCentiseconds % 6_000) / 100);
  const centiseconds = totalCentiseconds % 100;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}

function assDocument(events: string[]): string {
  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${SAFE_AREA.canvas.width}
PlayResY: ${SAFE_AREA.canvas.height}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,Arial,72,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,5,2,2,130,130,${SAFE_AREA.bottomMarginPx},1
Style: Attribution,Arial,34,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,130,130,380,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.join('\n')}
`;
}

export interface CaptionCue {
  startSec: number;
  endSec: number;
  text: string;
}

/** Build an ASS sidecar with individually timed caption cues. */
export function buildTimedAss(
  cues: CaptionCue[],
  attribution: string | undefined,
  durationSec: number,
): string {
  const events = cues.map(
    (cue) =>
      `Dialogue: 0,${assTimestamp(cue.startSec)},${assTimestamp(cue.endSec)},Caption,,0,0,0,,${assEscape(cue.text)}`,
  );

  if (attribution) {
    events.push(
      `Dialogue: 0,0:00:00.00,${assTimestamp(durationSec)},Attribution,,0,0,0,,${assEscape(attribution)}`,
    );
  }

  return assDocument(events);
}

/** Allocate sentence cues contiguously according to their character share. */
export function proportionalCues(script: string, audioDurationSec: number): CaptionCue[] {
  const normalized = script.trim();
  if (!normalized) return [];

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const parts = sentences.length > 0 ? sentences : [normalized];
  const totalCharacters = parts.reduce((total, sentence) => total + sentence.length, 0);
  const durationSec = Number.isFinite(audioDurationSec) ? Math.max(0, audioDurationSec) : 0;
  let cursor = 0;

  return parts.map((text, index) => {
    const startSec = cursor;
    const endSec =
      index === parts.length - 1
        ? durationSec
        : cursor + durationSec * (text.length / totalCharacters);
    cursor = endSec;
    return { startSec, endSec, text };
  });
}

/** Parse whisper.cpp's `-oj` transcription array into second-based cues. */
export function whisperCues(whisperJsonText: string): CaptionCue[] {
  const parsed = JSON.parse(whisperJsonText) as {
    transcription?: Array<{
      offsets?: { from?: number; to?: number };
      text?: string;
    }>;
  };

  return (parsed.transcription ?? []).flatMap((entry) => {
    const fromMs = Number(entry.offsets?.from);
    const toMs = Number(entry.offsets?.to);
    const text = entry.text?.trim() ?? '';
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs || !text) {
      return [];
    }
    return [{ startSec: fromMs / 1000, endSec: toMs / 1000, text }];
  });
}

/** Build the libass sidecar burned by the renderer when subtitles are available. */
export function buildAss(
  caption: string,
  attribution: string | undefined,
  durationSec: number,
): string {
  const end = assTimestamp(durationSec);
  const events = [
    `Dialogue: 0,0:00:00.00,${end},Caption,,0,0,0,,${assEscape(caption)}`,
  ];

  if (attribution) {
    events.push(
      `Dialogue: 0,0:00:00.00,${end},Attribution,,0,0,0,,${assEscape(attribution)}`,
    );
  }

  return assDocument(events);
}
