export interface SchedulerHandle {
  stop(): Promise<void>;
}

const schedulerMetrics = { schedulers: 0, active: 0, runs: 0, errors: 0, last_ms: 0, max_ms: 0 };

/** Interval không chạy chồng job và có thể chờ job hiện tại trước khi đóng DB. */
export function startTrackedScheduler(options: {
  intervalMs: number;
  initialDelayMs: number;
  job: () => unknown | Promise<unknown>;
  onError: (error: unknown) => void;
}): SchedulerHandle {
  schedulerMetrics.schedulers += 1;
  let stopped = false;
  let active: Promise<unknown> | null = null;
  const tick = () => {
    if (stopped || active) return;
    const started = performance.now();
    schedulerMetrics.active += 1;
    schedulerMetrics.runs += 1;
    active = Promise.resolve()
      .then(options.job)
      .catch((error) => {
        schedulerMetrics.errors += 1;
        options.onError(error);
      })
      .finally(() => {
        const duration = performance.now() - started;
        schedulerMetrics.active -= 1;
        schedulerMetrics.last_ms = duration;
        schedulerMetrics.max_ms = Math.max(schedulerMetrics.max_ms, duration);
        active = null;
      });
  };
  const interval = setInterval(tick, options.intervalMs);
  const initial = setTimeout(tick, options.initialDelayMs);
  interval.unref();
  initial.unref();
  return {
    async stop() {
      if (stopped) {
        await active;
        return;
      }
      stopped = true;
      schedulerMetrics.schedulers -= 1;
      clearInterval(interval);
      clearTimeout(initial);
      await active;
    },
  };
}

export function schedulerStats() {
  return { ...schedulerMetrics };
}
