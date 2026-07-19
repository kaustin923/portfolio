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
