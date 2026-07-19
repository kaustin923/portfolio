import {spawn} from 'node:child_process';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

const [bundleDir, outputDir, startArg = '0', endArg = '719'] = process.argv.slice(2);
if (!bundleDir || !outputDir) throw new Error('Expected bundle and output directories.');
const start = Number(startArg);
const end = Number(endArg);
await mkdir(outputDir, {recursive: true});

const browser = spawn(path.resolve('cli/chrome-single-process.sh'), [
  '--headless',
  '--no-sandbox',
  '--disable-gpu',
  '--allow-file-access-from-files',
  '--hide-scrollbars',
  '--force-device-scale-factor=1',
  '--window-size=1080,1920',
  '--remote-debugging-pipe',
  `--user-data-dir=${path.resolve(outputDir, 'chrome-profile')}`,
], {stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe']});

let nextId = 1;
let incoming = Buffer.alloc(0);
const pending = new Map();
const listeners = new Map();
const protocolIn = browser.stdio[3];
const protocolOut = browser.stdio[4];

protocolOut.on('data', (chunk) => {
  incoming = Buffer.concat([incoming, chunk]);
  for (;;) {
    const separator = incoming.indexOf(0);
    if (separator < 0) break;
    const payload = incoming.subarray(0, separator).toString('utf8');
    incoming = incoming.subarray(separator + 1);
    if (!payload) continue;
    const message = JSON.parse(payload);
    if (message.id) {
      const entry = pending.get(message.id);
      if (!entry) continue;
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(message.error.message));
      else entry.resolve(message.result);
      continue;
    }
    const key = `${message.sessionId ?? 'browser'}:${message.method}`;
    for (const resolve of listeners.get(key) ?? []) resolve(message.params);
    listeners.delete(key);
  }
});

const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, {resolve, reject});
  protocolIn.write(`${JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})})}\0`);
});

const waitForEvent = (method, sessionId) => new Promise((resolve) => {
  const key = `${sessionId ?? 'browser'}:${method}`;
  const current = listeners.get(key) ?? [];
  current.push(resolve);
  listeners.set(key, current);
});

const evaluate = async (expression, sessionId) => {
  const result = await send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true}, sessionId);
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result?.value;
};

const waitUntil = async (expression, sessionId, attempts = 240) => {
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (await evaluate(expression, sessionId)) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const cancelled = await evaluate('window.remotion_cancelledError || null', sessionId);
  throw new Error(`Timed out waiting for composition.${cancelled ? ` ${cancelled}` : ''}`);
};

try {
  const {targetId} = await send('Target.createTarget', {url: 'about:blank', width: 1080, height: 1920});
  const {sessionId} = await send('Target.attachToTarget', {targetId, flatten: true});
  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);
  await send('Emulation.setDeviceMetricsOverride', {width: 1080, height: 1920, deviceScaleFactor: 1, mobile: false}, sessionId);
  const load = waitForEvent('Page.loadEventFired', sessionId);
  await send('Page.navigate', {url: `file://${bundleDir}/index.html?frame=${start}`}, sessionId);
  await load;
  await waitUntil('Boolean(document.getElementById("remotion-canvas") && window.remotion_renderReady)', sessionId);
  await evaluate('document.fonts.ready.then(() => true)', sessionId);

  for (let frame = start; frame <= end; frame++) {
    if (frame !== start) {
      await evaluate(`window.remotion_setFrame(${frame}, "CalledItEpisode", 1); true`, sessionId);
      await waitUntil('window.remotion_renderReady === true', sessionId);
    }
    const {data} = await send('Page.captureScreenshot', {
      format: 'jpeg',
      quality: 90,
      fromSurface: true,
      captureBeyondViewport: true,
      clip: {x: 0, y: 0, width: 1080, height: 1920, scale: 1},
    }, sessionId);
    await writeFile(path.join(outputDir, `frame-${String(frame).padStart(4, '0')}.jpg`), Buffer.from(data, 'base64'));
    if ((frame - start) % 60 === 0 || frame === end) process.stdout.write(`frame ${frame}/${end}\n`);
  }
  await send('Browser.close');
} finally {
  browser.kill();
}
