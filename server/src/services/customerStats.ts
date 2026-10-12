import type { Database } from 'better-sqlite3';

export const STATS_COLUMNS_SQL = `
         (SELECT COUNT(*) FROM deals d WHERE d.customer_id = c.id AND d.stage_category = 'open') AS open_deal_count,
         (SELECT COUNT(*) FROM deals d WHERE d.customer_id = c.id) AS deal_count,
         (SELECT COUNT(*) FROM cards k WHERE k.customer_id = c.id AND k.is_done = 0 AND k.is_archived = 0) AS open_task_count,
         (SELECT COALESCE(SUM(d.value_vnd), 0) FROM deals d WHERE d.customer_id = c.id AND d.stage_category = 'won') AS total_won_vnd,
         (SELECT COALESCE(SUM(d.value_vnd), 0) FROM deals d WHERE d.customer_id = c.id AND d.stage_category = 'open') AS open_pipeline_vnd,
         (SELECT COUNT(*) FROM contracts k WHERE k.customer_id = c.id AND k.status = 'active') AS active_contract_count,
         (SELECT MAX(i.occurred_at) FROM interactions i WHERE i.customer_id = c.id) AS last_activity_at,
         (SELECT COUNT(*) FROM deals d
           WHERE d.customer_id = c.id AND d.stage_category = 'open'
             AND trim(COALESCE(d.next_action, '')) = '') AS deals_without_next_action_count,
         (SELECT d.next_action FROM deals d
           WHERE d.customer_id = c.id AND d.stage_category = 'open'
             AND trim(COALESCE(d.next_action, '')) <> ''
           ORDER BY d.next_action_date IS NULL, d.next_action_date, d.updated_at DESC LIMIT 1) AS next_deal_action,
         (SELECT d.next_action_date FROM deals d
           WHERE d.customer_id = c.id AND d.stage_category = 'open'
             AND trim(COALESCE(d.next_action, '')) <> ''
           ORDER BY d.next_action_date IS NULL, d.next_action_date, d.updated_at DESC LIMIT 1) AS next_deal_action_date,
         (SELECT k.title FROM cards k
           WHERE k.customer_id = c.id AND k.is_done = 0 AND k.is_archived = 0
           ORDER BY k.due_date IS NULL, k.due_date, k.updated_at DESC LIMIT 1) AS next_task_title,
         (SELECT k.due_date FROM cards k
           WHERE k.customer_id = c.id AND k.is_done = 0 AND k.is_archived = 0
           ORDER BY k.due_date IS NULL, k.due_date, k.updated_at DESC LIMIT 1) AS next_task_due_date,
         (SELECT r.title FROM reminders r
           WHERE r.customer_id = c.id AND r.is_done = 0
           ORDER BY r.due_at LIMIT 1) AS next_reminder_title,
         (SELECT r.due_at FROM reminders r
           WHERE r.customer_id = c.id AND r.is_done = 0
           ORDER BY r.due_at LIMIT 1) AS next_reminder_due_at`;

const STATS_COLUMNS = [
  'open_deal_count',
  'deal_count',
  'open_task_count',
  'total_won_vnd',
  'open_pipeline_vnd',
  'active_contract_count',
  'last_activity_at',
  'deals_without_next_action_count',
  'next_deal_action',
  'next_deal_action_date',
  'next_task_title',
  'next_task_due_date',
  'next_reminder_title',
  'next_reminder_due_at',
] as const;

export function flushCustomerStats(db: Database): number {
  return db.transaction(() => {
    const dirty = db.prepare(`SELECT id FROM stats_dirty WHERE kind = 'customer'`).all() as Array<{
      id: number;
    }>;
    if (dirty.length === 0) return 0;

    const ids = dirty.map((row) => row.id);
    const upsert = db.prepare(`
      INSERT INTO customer_stats (customer_id, ${STATS_COLUMNS.join(', ')}, refreshed_at)
      SELECT c.id, ${STATS_COLUMNS_SQL}, datetime('now','localtime')
        FROM customers c
       WHERE c.id IN (${Array.from({ length: 500 }, () => '?').join(', ')})
      ON CONFLICT(customer_id) DO UPDATE SET
        ${STATS_COLUMNS.map((column) => `${column} = excluded.${column}`).join(',\n        ')},
        refreshed_at = excluded.refreshed_at
    `);
    const deleteStats = db.prepare(
      `DELETE FROM customer_stats WHERE customer_id IN (${Array.from({ length: 500 }, () => '?').join(', ')})`
    );
    const deleteDirty = db.prepare(
      `DELETE FROM stats_dirty WHERE kind = 'customer' AND id IN (${Array.from({ length: 500 }, () => '?').join(', ')})`
    );
    let refreshed = 0;
    for (let offset = 0; offset < ids.length; offset += 500) {
      const batch = ids.slice(offset, offset + 500);
      const padded = [...batch, ...Array(500 - batch.length).fill(null)];
      const existingRows = db
        .prepare(
          `SELECT COUNT(*) AS count FROM customers WHERE id IN (${batch.map(() => '?').join(', ')})`
        )
        .get(...batch) as { count: number };
      upsert.run(...padded);
      if (existingRows.count < batch.length) {
        const existingIds = new Set(
          (
            db
              .prepare(`SELECT id FROM customers WHERE id IN (${batch.map(() => '?').join(', ')})`)
              .all(...batch) as Array<{ id: number }>
          ).map((row) => row.id)
        );
        const missing = batch.filter((id) => !existingIds.has(id));
        deleteStats.run(...missing, ...Array(500 - missing.length).fill(null));
      }
      deleteDirty.run(...padded);
      refreshed += existingRows.count;
    }
    return refreshed;
  })();
}

export function rebuildCustomerStats(db: Database): void {
  db.prepare(
    `INSERT OR IGNORE INTO stats_dirty (kind, id) SELECT 'customer', id FROM customers`
  ).run();
  flushCustomerStats(db);
}
