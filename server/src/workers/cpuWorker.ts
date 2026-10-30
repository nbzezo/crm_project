import { parentPort } from 'node:worker_threads';
import { extractFile } from '../services/ai/textExtractCore.ts';
import { parseWorkbook } from '../services/revenueWorkbookParse.ts';
import { executeReadOnlyReportQueries } from '../services/reportQueries.ts';
import type { WorkerJob } from '../lib/workerPool.ts';

if (!parentPort) throw new Error('Worker phải chạy cùng parentPort');

parentPort.on('message', async ({ id, job }: { id: number; job: WorkerJob }) => {
  try {
    const result =
      job.kind === 'extract-text'
        ? await extractFile(job.filePath, job.ext, job.maxChars)
        : job.kind === 'parse-revenue-workbook'
          ? await parseWorkbook(Buffer.from(job.buffer))
          : executeReadOnlyReportQueries(job.dbPath, job.queries);
    parentPort!.postMessage({ id, ok: true, result });
  } catch (error) {
    parentPort!.postMessage({
      id,
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
