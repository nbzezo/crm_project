import assert from 'node:assert/strict';
import test from 'node:test';
import { schedulerStats, startTrackedScheduler } from './scheduler.ts';

test('stop huy lich moi va cho job dang chay ket thuc', async () => {
  let finish: (() => void) | undefined;
  let runs = 0;
  const scheduler = startTrackedScheduler({
    intervalMs: 5,
    initialDelayMs: 0,
    job: () => {
      runs += 1;
      return new Promise<void>((resolve) => {
        finish = resolve;
      });
    },
    onError: () => undefined,
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(runs, 1, 'job chay cham khong duoc chay chong');
  let stopped = false;
  const stopping = scheduler.stop().then(() => {
    stopped = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(stopped, false, 'stop phai cho job hien tai');
  finish?.();
  await stopping;
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(runs, 1, 'sau stop khong mo job moi');
  const stats = schedulerStats();
  assert.equal(stats.schedulers, 0);
  assert.ok(stats.runs >= 1);
  assert.ok(stats.last_ms > 0);
});
