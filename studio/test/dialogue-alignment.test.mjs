import assert from 'node:assert/strict';
import test from 'node:test';
import {alignDialogueLinesToWords} from '../src/timing-core.js';

const timedWords = (texts, step = 240) => texts.map((text, index) => ({
  text,
  startMs: index * step,
  endMs: index * step + step - 40,
}));

test('aligns dialogue lines in order while tolerating minor ASR differences', () => {
  const lines = [
    {text: 'Okay, the movie opens Friday.'},
    {text: 'Spider-Man could make one hundred eighty million.'},
    {text: 'That is a very big bet.'},
  ];
  const words = timedWords([
    'Okay', 'the', 'movie', 'opens', 'Friday',
    'Spiderman', 'could', 'make', 'a', 'hundred', 'eighty', 'million',
    'That', 'is', 'a', 'very', 'big', 'bet',
  ]);

  const aligned = alignDialogueLinesToWords({lines, words, durationMs: 4400});

  assert.equal(aligned.length, 3);
  assert.deepEqual(aligned.map((line) => line.fallback), [false, false, false]);
  assert.equal(aligned[0].startMs, 0);
  assert.equal(aligned[1].startMs, 1200);
  assert.equal(aligned[2].startMs, 2880);
  assert.ok(aligned.every((line, index) => index === 0 || line.startMs >= aligned[index - 1].endMs));
});

test('proportionally splits the failed line and all remaining duration', () => {
  const lines = [
    {text: 'A clean opening line.'},
    {text: 'This line is completely absent from the transcript.'},
    {text: 'Short ending.'},
  ];
  const words = timedWords(['A', 'clean', 'opening', 'line', 'unrelated', 'audio']);

  const aligned = alignDialogueLinesToWords({lines, words, durationMs: 5000});

  assert.equal(aligned.length, 3);
  assert.equal(aligned[0].fallback, false);
  assert.equal(aligned[1].fallback, true);
  assert.equal(aligned[2].fallback, true);
  assert.equal(aligned[2].endMs, 5000);
  assert.ok(aligned[2].startMs > aligned[1].startMs);
  assert.equal(aligned[1].words[0].text, 'This');
  assert.ok(aligned.every((line) => line.endMs <= 5000 && line.endMs >= line.startMs + 40));
});
