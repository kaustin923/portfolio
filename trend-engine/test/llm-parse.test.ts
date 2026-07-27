import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseModelJson } from '../src/llm.js';

test('clean JSON parses unchanged', () => {
  assert.deepEqual(parseModelJson('{"a":1,"b":[2,3]}'), { a: 1, b: [2, 3] });
});

test('prose fringes around the object are stripped', () => {
  assert.deepEqual(
    parseModelJson('Here is the forecast:\n{"topics":["x"]}\nLet me know if…'),
    { topics: ['x'] },
  );
});

test('trailing commas before } and ] are repaired', () => {
  assert.deepEqual(
    parseModelJson('{"a": [1, 2,], "b": {"c": 3,},}'),
    { a: [1, 2], b: { c: 3 } },
  );
});

test('commas inside string values survive repair', () => {
  assert.deepEqual(
    parseModelJson('{"caption": "one, two, three,", "n": 1,}'),
    { caption: 'one, two, three,', n: 1 },
  );
});

test('no JSON object at all throws loudly', () => {
  assert.throws(() => parseModelJson('I could not produce a forecast.'), /No JSON object found/);
});

test('irreparable JSON throws the original parse error', () => {
  assert.throws(() => parseModelJson('{"a": <unquoted>}'));
});
