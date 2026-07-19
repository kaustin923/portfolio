const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const NUMBER_WORDS = {13: 'thirteen', 28: 'twenty eight', 30: 'thirty', 31: 'thirty one', 61: 'sixty one', 72: 'seventy two'};

export const normalizeTokens = (value) =>
  String(value)
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((token) => (NUMBER_WORDS[token] ?? token).split(' '));

const toMs = (value) => {
  if (Number.isFinite(value)) return Number(value);
  if (typeof value !== 'string') return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parts = value.replace(',', '.').split(':').map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 3) return ((parts[0] * 60 + parts[1]) * 60 + parts[2]) * 1000;
  return null;
};

const splitSegment = (text, startMs, endMs) => {
  const parts = String(text).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return [];
  const span = Math.max(60 * parts.length, endMs - startMs);
  return parts.map((part, index) => ({
    text: part,
    startMs: Math.round(startMs + (span * index) / parts.length),
    endMs: Math.round(startMs + (span * (index + 1)) / parts.length),
  }));
};

export const extractWhisperWords = (payload) => {
  const roots = [payload?.transcription, payload?.segments, payload?.result?.segments, payload?.words];
  const segments = roots.find(Array.isArray) ?? [];
  const words = [];
  for (const segment of segments) {
    if (Array.isArray(segment?.words) && segment.words.length > 0) {
      for (const word of segment.words) {
        const start = toMs(word.startMs ?? word.start_ms ?? word.start ?? word.t0);
        const end = toMs(word.endMs ?? word.end_ms ?? word.end ?? word.t1);
        if (start !== null && end !== null) words.push(...splitSegment(word.word ?? word.text, start, end));
      }
      continue;
    }
    const offsets = segment?.offsets ?? segment?.timestamps ?? {};
    let start = toMs(offsets.from ?? offsets.start ?? segment?.startMs ?? segment?.start_ms ?? segment?.start);
    let end = toMs(offsets.to ?? offsets.end ?? segment?.endMs ?? segment?.end_ms ?? segment?.end);
    if (start !== null && start < 1000 && Number.isFinite(segment?.t0)) start = Number(segment.t0) * 10;
    if (end !== null && end < 1000 && Number.isFinite(segment?.t1)) end = Number(segment.t1) * 10;
    if (start !== null && end !== null) words.push(...splitSegment(segment?.text ?? segment?.word, start, end));
  }
  return words
    .filter((word) => word.text && Number.isFinite(word.startMs) && Number.isFinite(word.endMs))
    .sort((a, b) => a.startMs - b.startMs)
    .map((word, index, all) => ({
      ...word,
      endMs: Math.max(word.startMs + 40, Math.min(word.endMs, all[index + 1]?.startMs ?? word.endMs)),
    }));
};

const levenshtein = (a, b) => {
  const rows = new Array(b.length + 1).fill(0).map((_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = rows[0];
    rows[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const old = rows[j];
      rows[j] = Math.min(rows[j] + 1, rows[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = old;
    }
  }
  return rows[b.length];
};

const similarity = (aTokens, bTokens) => {
  const a = aTokens.join(' ');
  const b = bTokens.join(' ');
  if (!a || !b) return 0;
  const charScore = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  const aSet = new Set(aTokens);
  const overlap = bTokens.filter((token) => aSet.has(token)).length / Math.max(aTokens.length, bTokens.length);
  return clamp(charScore * 0.72 + overlap * 0.28, 0, 1);
};

const findCue = (cue, words) => {
  const cueTokens = normalizeTokens(cue);
  const entries = words
    .map((word) => ({word, normalized: normalizeTokens(word.text).join(' ')}))
    .filter((entry) => entry.normalized);
  const normalizedWords = entries.map((entry) => entry.normalized);
  let best = {score: 0, index: 0, length: cueTokens.length};
  for (let index = 0; index < normalizedWords.length; index++) {
    for (let delta = -2; delta <= 2; delta++) {
      const length = Math.max(1, cueTokens.length + delta);
      const candidate = normalizedWords.slice(index, index + length);
      const score = similarity(cueTokens, candidate);
      if (score > best.score) best = {score, index, length};
    }
  }
  const matched = entries.slice(best.index, best.index + best.length).map((entry) => entry.word);
  return {
    ...best,
    startMs: matched[0]?.startMs ?? 0,
    matchedText: matched.map((word) => word.text).join(' '),
  };
};

const narrationFallbackStarts = (scenes, narration, durationMs) => {
  const narrationTokens = normalizeTokens(narration);
  return scenes.map((scene, sceneIndex) => {
    const cue = normalizeTokens(scene.cue);
    let matchIndex = -1;
    for (let index = 0; index <= narrationTokens.length - cue.length; index++) {
      if (narrationTokens.slice(index, index + cue.length).join(' ') === cue.join(' ')) {
        matchIndex = index;
        break;
      }
    }
    const ratio = matchIndex >= 0 ? matchIndex / Math.max(1, narrationTokens.length) : sceneIndex / scenes.length;
    return Math.round(ratio * durationMs);
  });
};

export const buildCaptionPages = (words) => {
  const pages = [];
  let bucket = [];
  const flush = () => {
    if (bucket.length === 0) return;
    const first = bucket[0];
    const last = bucket[bucket.length - 1];
    pages.push({
      id: `caption-${pages.length + 1}`,
      text: bucket.map((word) => word.text).join(' ').replace(/\s+([,.!?;:%])/g, '$1'),
      startMs: first.startMs,
      endMs: Math.max(last.endMs, first.startMs + 620),
      words: bucket,
      ...(first.speaker ? {speaker: first.speaker} : {}),
      ...(Number.isInteger(first.lineIndex) ? {lineIndex: first.lineIndex} : {}),
    });
    bucket = [];
  };
  for (const word of words) {
    const previous = bucket[bucket.length - 1];
    const gap = previous ? word.startMs - previous.endMs : 0;
    const lineChanged = previous && (
      word.speaker !== previous.speaker
      || (Number.isInteger(word.lineIndex) && word.lineIndex !== previous.lineIndex)
    );
    if (lineChanged || (bucket.length >= 2 && (gap > 330 || /[.!?;:]$/.test(previous?.text ?? '') || word.endMs - bucket[0].startMs > 880))) flush();
    bucket.push(word);
    if (bucket.length >= 4 || (bucket.length >= 2 && /[.!?;:]$/.test(word.text))) flush();
  }
  flush();
  return pages.map((page, index, all) => {
    const next = all[index + 1];
    const lineChanges = next && (
      next.speaker !== page.speaker
      || (Number.isInteger(next.lineIndex) && next.lineIndex !== page.lineIndex)
    );
    const minimumDuration = lineChanges ? 80 : 560;
    return {
      ...page,
      endMs: Math.max(page.startMs + minimumDuration, Math.min(page.endMs, (next?.startMs ?? page.endMs + 160) - 20)),
    };
  });
};

const assignWordsToDialogueLines = (words, lineTimings) => words.map((word) => {
  const midpoint = (word.startMs + word.endMs) / 2;
  const containing = lineTimings.find((line) => midpoint >= line.startMs && midpoint <= line.endMs);
  const line = containing ?? lineTimings.reduce((nearest, candidate) => {
    const distance = midpoint < candidate.startMs
      ? candidate.startMs - midpoint
      : midpoint > candidate.endMs
        ? midpoint - candidate.endMs
        : 0;
    return !nearest || distance < nearest.distance ? {line: candidate, distance} : nearest;
  }, null)?.line;
  return line ? {...word, speaker: line.speaker, lineIndex: line.lineIndex} : word;
});

const assignAuthoredWordsToDialogueLines = (words, lineTimings) => {
  const authoredWordCount = lineTimings.reduce(
    (sum, line) => sum + line.text.trim().split(/\s+/).filter(Boolean).length,
    0,
  );
  if (authoredWordCount !== words.length) return assignWordsToDialogueLines(words, lineTimings);
  let cursor = 0;
  return lineTimings.flatMap((line) => {
    const count = line.text.trim().split(/\s+/).filter(Boolean).length;
    const assigned = words.slice(cursor, cursor + count).map((word) => ({
      ...word,
      speaker: line.speaker,
      lineIndex: line.lineIndex,
    }));
    cursor += count;
    return assigned;
  });
};

const tokenSimilarity = (a, b) => {
  if (a === b) return 1;
  if (!a || !b) return 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
};

// Align the authored narration onto whisper word timings so burned-in captions
// always show the written words (whisper mis-hearings keep their timing only).
export const alignNarrationToWords = (narration, words) => {
  const display = String(narration).trim().split(/\s+/).filter(Boolean);
  const narrTokens = [];
  display.forEach((text, wordIndex) => {
    for (const token of normalizeTokens(text)) narrTokens.push({token, wordIndex});
  });
  const whisTokens = [];
  for (const word of words) {
    for (const token of normalizeTokens(word.text)) whisTokens.push({token, startMs: word.startMs, endMs: word.endMs});
  }
  const n = narrTokens.length;
  const m = whisTokens.length;
  if (n === 0 || m === 0) return null;
  const GAP = 0.6;
  const cost = (i, j) => {
    const sim = tokenSimilarity(narrTokens[i].token, whisTokens[j].token);
    return sim >= 0.99 ? 0 : sim >= 0.5 ? 0.45 : 1.15;
  };
  const dp = Array.from({length: n + 1}, () => new Float64Array(m + 1));
  const back = Array.from({length: n + 1}, () => new Uint8Array(m + 1));
  for (let i = 1; i <= n; i++) { dp[i][0] = i * GAP; back[i][0] = 1; }
  for (let j = 1; j <= m; j++) { dp[0][j] = j * GAP; back[0][j] = 2; }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const diag = dp[i - 1][j - 1] + cost(i - 1, j - 1);
      const up = dp[i - 1][j] + GAP;
      const left = dp[i][j - 1] + GAP;
      if (diag <= up && diag <= left) { dp[i][j] = diag; back[i][j] = 0; }
      else if (up <= left) { dp[i][j] = up; back[i][j] = 1; }
      else { dp[i][j] = left; back[i][j] = 2; }
    }
  }
  const spans = new Array(display.length).fill(null);
  let matchedTokens = 0;
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const move = back[i][j];
    if (move === 0) {
      const narr = narrTokens[i - 1];
      const whis = whisTokens[j - 1];
      if (tokenSimilarity(narr.token, whis.token) >= 0.5) {
        matchedTokens += 1;
        const span = spans[narr.wordIndex];
        if (span) {
          span.startMs = Math.min(span.startMs, whis.startMs);
          span.endMs = Math.max(span.endMs, whis.endMs);
        } else {
          spans[narr.wordIndex] = {startMs: whis.startMs, endMs: whis.endMs};
        }
      }
      i -= 1; j -= 1;
    } else if (move === 1) i -= 1;
    else j -= 1;
  }
  if (matchedTokens / n < 0.5) return null;
  const aligned = display.map((text, index) => ({text, ...(spans[index] ?? {startMs: null, endMs: null})}));
  let cursor = 0;
  while (cursor < aligned.length) {
    if (aligned[cursor].startMs !== null) { cursor += 1; continue; }
    let runEnd = cursor;
    while (runEnd < aligned.length && aligned[runEnd].startMs === null) runEnd += 1;
    const prev = aligned[cursor - 1];
    const next = aligned[runEnd];
    const gapStart = prev ? prev.endMs : Math.max(0, (next?.startMs ?? 0) - 320 * (runEnd - cursor));
    const gapEnd = next ? next.startMs : (prev?.endMs ?? 0) + 320 * (runEnd - cursor);
    const slot = Math.max(80, (gapEnd - gapStart) / (runEnd - cursor));
    for (let k = cursor; k < runEnd; k++) {
      aligned[k].startMs = Math.round(gapStart + slot * (k - cursor));
      aligned[k].endMs = Math.round(gapStart + slot * (k - cursor + 1));
    }
    cursor = runEnd;
  }
  for (let k = 0; k < aligned.length; k++) {
    const prev = aligned[k - 1];
    if (prev) aligned[k].startMs = Math.max(aligned[k].startMs, prev.startMs + 40);
    aligned[k].endMs = Math.max(aligned[k].endMs, aligned[k].startMs + 40);
  }
  return aligned.map((word, index, all) => ({
    ...word,
    endMs: Math.max(word.startMs + 40, Math.min(word.endMs, all[index + 1]?.startMs ?? word.endMs)),
  }));
};

export const resolveEpisodeTiming = ({words, scenes, narration, durationMs, lineTimings = [], fps = 30, threshold = 0.54}) => {
  const authoredWords = alignNarrationToWords(narration, words);
  words = authoredWords ?? words;
  const tailMs = 360;
  if (lineTimings.length > 0) {
    words = authoredWords
      ? assignAuthoredWordsToDialogueLines(words, lineTimings)
      : assignWordsToDialogueLines(words, lineTimings);
    const cues = lineTimings.map((line, index) => ({
      id: line.id,
      cue: line.text,
      startMs: line.startMs,
      endMs: lineTimings[index + 1]?.startMs ?? durationMs + tailMs,
      score: 1,
      matchedText: line.text,
      fallback: false,
      speaker: line.speaker,
      lineIndex: line.lineIndex,
    }));
    const finalDurationMs = durationMs + tailMs;
    return {
      durationMs: finalDurationMs,
      durationInFrames: Math.ceil((finalDurationMs / 1000) * fps),
      words,
      captions: buildCaptionPages(words),
      cues,
      lineTimings,
    };
  }
  const fallbackStarts = narrationFallbackStarts(scenes, narration, durationMs);
  const matches = scenes.map((scene, index) => {
    const result = findCue(scene.cue, words);
    const fallback = result.score < threshold;
    return {
      id: scene.id,
      cue: scene.cue,
      startMs: fallback ? fallbackStarts[index] : result.startMs,
      score: Number(result.score.toFixed(3)),
      matchedText: result.matchedText,
      fallback,
    };
  });
  matches[0].startMs = 0;
  for (let index = 1; index < matches.length; index++) {
    if (matches[index].startMs < matches[index - 1].startMs + 800) {
      matches[index].startMs = fallbackStarts[index];
      matches[index].fallback = true;
    }
    matches[index].startMs = clamp(matches[index].startMs, matches[index - 1].startMs + 180, durationMs - 180);
  }
  const cues = matches.map((match, index) => ({
    ...match,
    endMs: index < matches.length - 1 ? matches[index + 1].startMs : durationMs + tailMs,
  }));
  const finalDurationMs = durationMs + tailMs;
  return {
    durationMs: finalDurationMs,
    durationInFrames: Math.ceil((finalDurationMs / 1000) * fps),
    words,
    captions: buildCaptionPages(words),
    cues,
  };
};
