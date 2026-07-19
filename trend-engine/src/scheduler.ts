import { runOnce } from './orchestrator.js';
import { acquireLock, releaseLock } from './state.js';

const DAY_MS = 86_400_000;
let holdsLock = false;

function envNumber(name: string, fallback: number): number {
  const value = process.env[name];
  if (value == null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function computeDelayMs(
  runsPerDay: number,
  jitterPct: number,
  rand: () => number,
): number {
  const finiteRuns = Number.isFinite(runsPerDay) ? runsPerDay : 1;
  const clampedRuns = Math.min(24, Math.max(1, finiteRuns));
  const finiteJitter = Number.isFinite(jitterPct) ? jitterPct : 0;
  const clampedJitter = Math.min(90, Math.max(0, finiteJitter));
  return (DAY_MS / clampedRuns) * (1 + (rand() * 2 - 1) * clampedJitter / 100);
}

export function acquireRunLock(dir?: string): boolean {
  const acquired = acquireLock(dir);
  if (acquired) holdsLock = true;
  return acquired;
}

export function releaseRunLock(dir?: string): void {
  if (!holdsLock) return;
  try {
    releaseLock(dir);
  } finally {
    holdsLock = false;
  }
}

export async function runDaemon(): Promise<void> {
  const runsPerDay = envNumber('RUNS_PER_DAY', 3);
  const jitterPct = envNumber('RUN_JITTER_PCT', 20);

  const shutdown = (signal: NodeJS.Signals): never => {
    console.log(`[daemon] received ${signal}; shutting down`);
    releaseRunLock();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  while (true) {
    if (!acquireRunLock()) {
      console.warn('[daemon] another run holds the lock; sleeping');
    } else {
      try {
        await runOnce();
      } catch (err) {
        console.error('[daemon] run failed:', err);
      } finally {
        releaseRunLock();
      }
    }

    const delayMs = computeDelayMs(runsPerDay, jitterPct, Math.random);
    const eta = new Date(Date.now() + delayMs);
    console.log(`[daemon] next run at ${eta.toISOString()}`);
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
  }
}
