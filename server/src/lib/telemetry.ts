import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

const loop = monitorEventLoopDelay({ resolution: 20 });
loop.enable();
let queryCount = 0;
let queryTotalMs = 0;
let queryMaxMs = 0;

export async function measureQuery<T>(run: () => T | Promise<T>): Promise<T> {
  const started = performance.now();
  try {
    return await run();
  } finally {
    const duration = performance.now() - started;
    queryCount += 1;
    queryTotalMs += duration;
    queryMaxMs = Math.max(queryMaxMs, duration);
  }
}

export function telemetrySnapshot() {
  return {
    query: {
      count: queryCount,
      average_ms: queryCount === 0 ? 0 : queryTotalMs / queryCount,
      max_ms: queryMaxMs,
    },
    event_loop: {
      mean_ms: Number.isFinite(loop.mean) ? loop.mean / 1e6 : 0,
      p95_ms: loop.percentile(95) / 1e6,
      max_ms: loop.max / 1e6,
    },
  };
}
