import { runOnce } from './orchestrator.js';
import { acquireLock, releaseLock } from './state.js';

const DAY_MS = 86_400_000;

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
  return (DAY_MS / clampedRuns) * (1 + (rand() * 2 - 1) * jitterPct / 100);
}

export async function runDaemon(): Promise<void> {
  const runsPerDay = envNumber('RUNS_PER_DAY', 3);
  const jitterPct = envNumber('RUN_JITTER_PCT', 20);

  const shutdown = (signal: NodeJS.Signals): never => {
    console.log(`[daemon] received ${signal}; shutting down`);
    releaseLock();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  while (true) {
    if (!acquireLock()) {
      console.warn('[daemon] another run holds the lock; sleeping');
    } else {
      try {
        await runOnce();
      } catch (err) {
        console.error('[daemon] run failed:', err);
      } finally {
        releaseLock();
      }
    }

    const delayMs = computeDelayMs(runsPerDay, jitterPct, Math.random);
    const eta = new Date(Date.now() + delayMs);
    console.log(`[daemon] next run at ${eta.toISOString()}`);
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
  }
}
