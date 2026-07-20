import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';
import {assertEpisodeScript} from '../../../src/schema.ts';

const studio = path.resolve(import.meta.dirname, '../../..');
const outputDir = import.meta.dirname;
const browserExecutable = path.join(studio, 'cli/chrome-single-process.sh');
const raw = JSON.parse(await readFile(path.join(studio, 'scripts/ep-ff-breakouts.script.json'), 'utf8'));
const episode = assertEpisodeScript(raw);
const framesPerLine = 120;
const durationInFrames = episode.lines.length * framesPerLine;
const cues = episode.lines.map((line, index) => ({
  id: episode.scenes[index].id,
  cue: line.text,
  startMs: index * 4000,
  endMs: (index + 1) * 4000,
  score: 1,
  matchedText: line.text,
  fallback: false,
  speaker: line.speaker,
  lineIndex: index,
}));
const timing = {durationMs: episode.lines.length * 4000, durationInFrames, words: [], captions: [], cues};
const inputProps = {episode, timing, assetBase: ''};
const noDownload = () => {
  throw new Error('Browser download disabled.');
};

await mkdir(outputDir, {recursive: true});
await writeFile(path.join(outputDir, 'ep-ff-breakouts.props.json'), `${JSON.stringify(inputProps, null, 2)}\n`);
const serveUrl = await bundle({
  entryPoint: path.join(studio, 'src/index.ts'),
  rootDir: studio,
  publicDir: path.join(studio, 'public'),
  symlinkPublicDir: true,
});
const composition = await selectComposition({
  serveUrl,
  id: 'CalledItEpisode',
  inputProps,
  browserExecutable,
  onBrowserDownload: noDownload,
  logLevel: 'warn',
});
const samples = [
  ['gainwell-climb', 2, .58],
  ['coleman-focus', 3, .66],
  ['coleman-marker', 3, .82],
  ['judkins-blocks', 4, .31],
  ['judkins-run', 4, .60],
  ['judkins-payoff', 4, .91],
  ['tuten-departure', 5, .28],
  ['tuten-flow', 5, .56],
  ['tuten-promotion', 5, .80],
  ['tuten-payoff', 5, .93],
  ['tuten-race', 6, .50],
  ['tuten-finish', 6, .70],
  ['tuten-gap', 6, .82],
  ['love-climb', 7, .60],
  ['love-run', 8, .60],
  ['love-payoff', 8, .91],
];
for (const [name, lineIndex, fraction] of samples) {
  const frame = lineIndex * framesPerLine + Math.round(framesPerLine * fraction);
  await renderStill({
    composition,
    serveUrl,
    inputProps,
    frame,
    output: path.join(outputDir, `${name}.png`),
    imageFormat: 'png',
    browserExecutable,
    onBrowserDownload: noDownload,
    overwrite: true,
    logLevel: 'warn',
  });
  process.stdout.write(`${name} frame ${frame}\n`);
}
