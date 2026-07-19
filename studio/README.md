# CALLED IT. Studio

`studio` is a standalone Remotion package for code-rendered 1080×1920 prediction-show videos. It contains no stock footage, remote images, or render-time fetches: the visual system is React/SVG, fonts ship from npm, SFX are synthesized with ffmpeg, and all episode assets are generated locally.

## Setup

Requirements: macOS on Apple Silicon, Node 22+, npm, and the binary paths documented below.

```sh
npm install
npx studio render scripts/demo.script.json
```

`npm install` downloads Remotion's tested headless shell and the Apache-2.0 Kokoro q8 fallback model into package-local caches. Once setup finishes, rendering works offline. With a Samantha/Daniel voice, the renderer attempts `/usr/bin/say` first; if macOS returns no samples (as it can inside a restricted process sandbox), it uses the cached offline fallback. Setting the voice to `Kokoro` (as `scripts/demo.script.json` does) skips `say` entirely and always uses the package-local Kokoro model, so renders are byte-stable across sandboxed and unsandboxed environments. `/usr/bin/afconvert`, `/opt/homebrew/bin/whisper-cli`, `/opt/homebrew/bin/ffmpeg`, and `/opt/homebrew/bin/ffprobe` remain part of the pipeline.

Useful commands:

```sh
npm run render:demo
npm run preview
npm run typecheck
npx studio render scripts/demo.script.json --out out/custom.mp4
npx studio render scripts/demo.script.json --voice Daniel --rate 176
```

The CLI attempts hardware H.264 encoding first and automatically falls back to x264 CRF 19 if VideoToolbox is unavailable.

## Architecture

- `cli/studio.mjs` orchestrates TTS, WAV conversion, Whisper, cue resolution, procedural SFX, bundling, and programmatic `renderMedia()`.
- `src/timing-core.js` is the shared, Remotion-free timing engine. It defensively parses whisper.cpp JSON, aligns the authored narration onto Whisper's word timings (so burned-in captions always show the written words, never Whisper mis-hearings), fuzzy-matches cues, and falls back to narration-proportional timing without aborting a render.
- `src/schema.ts` defines the portable episode, word, caption, and cue contracts.
- `src/tokens.ts` and `src/fonts.ts` hold the fixed palette, type system, canvas rules, and offline font imports.
- `src/components/` contains the prop-driven card, stamp, ledger, dial, flip-clock, caption, chart, texture, and impact primitives.
- `src/scenes/` contains the six demo scene assemblies; timing is driven entirely by frame numbers and resolved cue boundaries.
- `public/generated/<episode-id>/` receives narration and timing artifacts. Shared procedural SFX live in `public/generated/sfx/`.
- `out/` receives finished MP4 files.

## Add an episode

Create a JSON file in `scripts/` with an ID, title, voice, narration, and an ordered scene list. Each scene needs a unique `id` and a short `cue` phrase that appears in the narration:

```json
{
  "id": "ep-053-example",
  "title": "EXAMPLE — 3 CALLS",
  "voice": {"name": "Samantha", "rate": 178},
  "narration": "Full narration goes here.",
  "scenes": [
    {"id": "hook", "type": "hook", "cue": "Full narration"},
    {"id": "loop", "type": "loop", "cue": "goes here"}
  ]
}
```

Run `npx studio render scripts/your.script.json`. The CLI prints every resolved scene boundary and marks proportional fallbacks as warnings. New scene IDs can be mapped in `src/Episode.tsx`; reusable visual behavior belongs in `src/components/`.

## Demo output

The included episode is `scripts/demo.script.json`, and its finished render is `out/demo.mp4`.
