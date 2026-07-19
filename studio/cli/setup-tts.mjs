#!/usr/bin/env node

import path from 'node:path';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {env as transformersEnv} from '@huggingface/transformers';
import {KokoroTTS} from 'kokoro-js';

const studioDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = path.join(studioDir, '.cache/kokoro');
await mkdir(cacheDir, {recursive: true});
transformersEnv.cacheDir = cacheDir;
transformersEnv.useBrowserCache = false;
transformersEnv.allowLocalModels = true;
transformersEnv.allowRemoteModels = true;

console.log('[studio] Ensuring Apache-2.0 Kokoro offline TTS fallback');
await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
  dtype: 'q8',
  device: 'cpu',
});
console.log(`[studio] Kokoro model cached at ${cacheDir}`);
