import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';

export interface ReportQuery {
  mode: 'all' | 'get';
  sql: string;
  params?: unknown[] | Record<string, unknown>;
}

/** Chay mot batch doc; moi endpoint tu ghep SQL pham vi tren luong chinh. */
export function executeReportQueries(database: DatabaseType, queries: ReportQuery[]): unknown[] {
  return queries.map(({ mode, sql, params = [] }) => {
    const statement = database.prepare(sql);
    return mode === 'all'
      ? Array.isArray(params)
        ? statement.all(...params)
        : statement.all(params)
      : Array.isArray(params)
        ? statement.get(...params)
        : statement.get(params);
  });
}

/** Worker mo ket noi rieng, chi doc; khong import connection.ts nen khong chay migration. */
export function executeReadOnlyReportQueries(dbPath: string, queries: ReportQuery[]): unknown[] {
  const database = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    database.pragma('query_only = ON');
    database.pragma('busy_timeout = 5000');
    return executeReportQueries(database, queries);
  } finally {
    database.close();
  }
}
