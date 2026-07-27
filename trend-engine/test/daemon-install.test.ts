import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  acquireRunLock,
  computeDelayMs,
  releaseRunLock,
} from '../src/scheduler.js';
import { acquireLock, releaseLock } from '../src/state.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const installScript = join(repoRoot, 'scripts', 'daemon-install.sh');
const uninstallScript = join(repoRoot, 'scripts', 'daemon-uninstall.sh');
const temporaryDirs: string[] = [];

after(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

test('daemon shell scripts pass bash syntax checks', (t) => {
  const probe = spawnSync('bash', ['--version'], { encoding: 'utf8' });
  if (probe.error && 'code' in probe.error && probe.error.code === 'ENOENT') {
    t.skip('bash is not available');
    return;
  }
  assert.equal(probe.status, 0, probe.stderr);

  for (const script of [installScript, uninstallScript]) {
    const result = spawnSync('bash', ['-n', script], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
});

test('daemon installer contains the required launchd configuration and safe quoting', () => {
  const script = readFileSync(installScript, 'utf8');
  assert.match(script, /set -euo pipefail/);
  assert.match(script, /com\.trendengine\.daemon/);
  assert.match(script, /RunAtLoad/);
  assert.match(script, /StartInterval/);
  assert.match(script, /LOG_PATH="\$DATA_DIR"\/daemon\.log/);
  assert.match(script, /<key>StandardOutPath<\/key>\s*<string>\$\(xml_escape "\$LOG_PATH"\)<\/string>/);
  assert.match(script, /\/opt\/homebrew\/bin/);

  const repoRootExpansions = script.match(/\$REPO_ROOT/g) ?? [];
  const quotedRepoRootExpansions = script.match(/"\$REPO_ROOT"/g) ?? [];
  assert.ok(quotedRepoRootExpansions.length > 0);
  assert.equal(repoRootExpansions.length, quotedRepoRootExpansions.length);

  assert.doesNotMatch(script, /\bgit\s/);
  assert.match(script, /exec \$\(printf '%q' "\$NPM_BIN"\) start/);
  assert.doesNotMatch(script, /exec "\$NPM_BIN" run daemon/);
});

test('daemon uninstaller removes the matching plist without repository commands', () => {
  const script = readFileSync(uninstallScript, 'utf8');
  assert.match(script, /set -euo pipefail/);
  assert.match(script, /com\.trendengine\.daemon\.plist/);
  assert.match(script, /rm -f/);
  assert.doesNotMatch(script, /\bgit\s/);
});

test('scheduler delay clamps hostile jitter values', () => {
  const eightHours = 8 * 60 * 60 * 1000;
  assert.equal(computeDelayMs(3, 200, () => 1), eightHours * 1.9);
  assert.equal(computeDelayMs(3, -50, () => 0), eightHours);
  assert.equal(computeDelayMs(3, Number.NaN, () => 1), eightHours);
  assert.equal(computeDelayMs(3, 20, () => 1), eightHours * 1.2);
});

test('scheduler releases only locks acquired through its hold-tracking wrapper', () => {
  const dir = mkdtempSync(join(tmpdir(), 'trend-engine-daemon-test-'));
  temporaryDirs.push(dir);
  const lockPath = join(dir, 'run.lock');

  assert.equal(acquireLock(dir), true);
  assert.equal(acquireRunLock(dir), false);
  releaseRunLock(dir);
  assert.equal(existsSync(lockPath), true);

  releaseLock(dir);
  assert.equal(acquireRunLock(dir), true);
  releaseRunLock(dir);
  assert.equal(existsSync(lockPath), false);
});
