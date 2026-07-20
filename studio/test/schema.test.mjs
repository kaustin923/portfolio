import assert from 'node:assert/strict';
import test from 'node:test';
import {assertEpisodeScript} from '../src/schema.ts';

const makeScript = (playbackSpeed) => ({
  id: 'playback-speed-test',
  title: 'Playback speed test',
  ...(playbackSpeed === undefined ? {} : {playbackSpeed}),
  voice: {name: 'Test', rate: 180},
  narration: 'Test narration.',
  scenes: [{id: 'test', cue: 'Test narration'}],
});

test('defaults and clamps playback speed', () => {
  assert.equal(assertEpisodeScript(makeScript(undefined)).playbackSpeed, 1.3);
  assert.equal(assertEpisodeScript(makeScript(0.5)).playbackSpeed, 1);
  assert.equal(assertEpisodeScript(makeScript(1.45)).playbackSpeed, 1.45);
  assert.equal(assertEpisodeScript(makeScript(2)).playbackSpeed, 1.6);
});

test('rejects a non-numeric playback speed', () => {
  assert.throws(
    () => assertEpisodeScript(makeScript('fast')),
    /Script playbackSpeed requires a finite number/,
  );
});

test('defaults and validates the episode format', () => {
  assert.equal(assertEpisodeScript(makeScript(undefined)).format, 'dialogue');
  assert.equal(assertEpisodeScript({...makeScript(undefined), format: 'narrator'}).format, 'narrator');
  assert.throws(
    () => assertEpisodeScript({...makeScript(undefined), format: 'monologue'}),
    /Script format must be dialogue or narrator/,
  );
});
