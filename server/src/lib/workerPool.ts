import os from 'node:os';
import { Worker } from 'node:worker_threads';
import { extractFile } from '../services/ai/textExtractCore.ts';
import { parseWorkbook } from '../services/revenueWorkbookParse.ts';

export type WorkerJob =
  | { kind: 'extract-text'; filePath: string; ext: string; maxChars?: number }
  | { kind: 'parse-revenue-workbook'; buffer: Uint8Array };

type WorkerResponse =
  { id: number; ok: true; result: unknown } | { id: number; ok: false; message: string };
type Pending = {
  job: WorkerJob;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};
type Slot = { worker: Worker; pending?: { item: Pending; timer: NodeJS.Timeout; id: number } };

const JOB_TIMEOUT_MS = 120_000;
const IDLE_SHUTDOWN_MS = 30_000;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
const maxWorkers = Math.max(1, Math.min(2, os.availableParallelism() - 1));
let nextId = 1;
let queue: Pending[] = [];
let slots: Slot[] = [];
let disabled = process.env.WORKFLOW_WORKERS === 'off';

function direct(job: WorkerJob): Promise<unknown> {
  if (job.kind === 'extract-text') return extractFile(job.filePath, job.ext, job.maxChars);
  return parseWorkbook(Buffer.from(job.buffer));
}

function workerUrl(): URL {
  return import.meta.url.endsWith('.ts')
    ? new URL('../workers/cpuWorker.ts', import.meta.url)
    : new URL('../workers/cpuWorker.js', import.meta.url);
}

function rejectSlot(slot: Slot, error: Error, replace: boolean): void {
  const active = slot.pending;
  if (active) {
    clearTimeout(active.timer);
    slot.pending = undefined;
    active.item.reject(error);
  }
  if (replace) {
    void slot.worker.terminate();
    slots = slots.filter((candidate) => candidate !== slot);
    tryCreateWorker();
  }
  dispatch();
}

function attach(slot: Slot): void {
  slot.worker.on('message', (message: WorkerResponse) => {
    const active = slot.pending;
    if (!active || message.id !== active.id) return;
    clearTimeout(active.timer);
    slot.pending = undefined;
    if (message.ok) active.item.resolve(message.result);
    else active.item.reject(new Error(message.message));
    dispatch();
  });
  slot.worker.once('error', (error) =>
    rejectSlot(slot, error instanceof Error ? error : new Error(String(error)), true)
  );
  slot.worker.once('exit', (code) => {
    if (code !== 0 && slots.includes(slot))
      rejectSlot(slot, new Error(`Worker dừng với mã ${code}`), true);
  });
}

function tryCreateWorker(): void {
  if (disabled || slots.length >= maxWorkers) return;
  try {
    const worker = new Worker(
      workerUrl(),
      import.meta.url.endsWith('.ts') ? { execArgv: ['--import', 'tsx'] } : undefined
    );
    worker.unref();
    const slot: Slot = { worker };
    slots.push(slot);
    attach(slot);
  } catch {
    disabled = true;
    for (const slot of slots) void slot.worker.terminate();
    slots = [];
    const pending = queue;
    queue = [];
    for (const item of pending) void direct(item.job).then(item.resolve, item.reject);
  }
}

function dispatch(): void {
  while (queue.length) {
    const slot = slots.find((candidate) => !candidate.pending);
    if (!slot) break;
    const item = queue.shift()!;
    const id = nextId++;
    const timer = setTimeout(
      () => rejectSlot(slot, new Error('Xử lý tệp quá lâu'), true),
      JOB_TIMEOUT_MS
    );
    slot.pending = { item, timer, id };
    slot.worker.postMessage({ id, job: item.job });
  }
  /* Giu worker them mot luc sau job cuoi: khoi dong worker moi ton vai tram ms (nap lai
     pdfjs, exceljs). Rang roi han moi tat de khong chiem RAM khi khong ai tai tep. */
  if (!queue.length && slots.every((candidate) => !candidate.pending)) {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (slotIsIdle()) {
        const current = slots.splice(0);
        for (const slot of current) void slot.worker.terminate();
      }
    }, IDLE_SHUTDOWN_MS);
    idleTimer.unref();
  }
}

function slotIsIdle(): boolean {
  return queue.length === 0 && slots.every((candidate) => !candidate.pending);
}

export function runInWorker<T>(job: WorkerJob): Promise<T> {
  if (disabled) return direct(job) as Promise<T>;
  return new Promise<T>((resolve, reject) => {
    queue.push({ job, resolve: resolve as (value: unknown) => void, reject });
    tryCreateWorker();
    dispatch();
  });
}

export async function shutdownWorkerPool(): Promise<void> {
  clearTimeout(idleTimer);
  const error = new Error('Worker pool đã dừng');
  for (const item of queue.splice(0)) item.reject(error);
  const current = slots.splice(0);
  for (const slot of current) {
    if (slot.pending) {
      clearTimeout(slot.pending.timer);
      slot.pending.item.reject(error);
    }
    await slot.worker.terminate();
  }
}
