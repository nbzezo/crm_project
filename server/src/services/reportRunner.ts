import type { Database } from 'better-sqlite3';
import { runInWorker } from '../lib/workerPool.ts';
import { executeReportQueries, type ReportQuery } from './reportQueries.ts';
import { measureQuery } from '../lib/telemetry.ts';

/** Test in-memory khong chia se duoc DB; production dung mot worker batch. */
export async function runReportQueries(
  database: Database,
  dbPath: string,
  queries: ReportQuery[]
): Promise<unknown[]> {
  return measureQuery(() =>
    dbPath === ':memory:' || process.env.WORKFLOW_REPORT_WORKERS === 'off'
      ? executeReportQueries(database, queries)
      : runInWorker({ kind: 'report-queries', dbPath, queries })
  );
}
