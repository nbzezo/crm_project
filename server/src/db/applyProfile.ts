/**
 * Ap mot ho so cau hinh vao CSDL tu dong lenh — dung khi dung ban cai cho khach moi.
 *
 * Chay:  npm run config:apply --workspace server -- duong/dan/ho-so.json [--dry-run]
 *
 * Import `connection.ts` la co y: mo CSDL theo WORKFLOW_DB_PATH / WORKFLOW_DATA_DIR
 * va chay migration toi ban moi nhat truoc khi ap ho so, dung nhu luc may chu khoi
 * dong. Nhap theo khoa va khong xoa gi (xem services/configProfile.ts).
 */
import fs from 'node:fs';
import { db, closeDatabase } from './connection.ts';
import { applyProfile, parseProfile } from '../services/configProfile.ts';

const args = process.argv.slice(2);
const file = args.find((arg) => !arg.startsWith('--'));
const dryRun = args.includes('--dry-run');
if (!file) {
  console.error('Dung: npm run config:apply --workspace server -- <ho-so.json> [--dry-run]');
  process.exit(1);
}

try {
  const profile = parseProfile(JSON.parse(fs.readFileSync(file, 'utf8')));
  const report = applyProfile(db, profile, dryRun);
  console.log(dryRun ? '[profile] CHAY THU — khong ghi gi' : '[profile] Da ap ho so');
  for (const line of report.created) console.log(`  + ${line}`);
  for (const line of report.updated) console.log(`  ~ ${line}`);
  for (const line of report.warnings) console.log(`  ! ${line}`);
} catch (error) {
  console.error('[profile] Loi:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  closeDatabase();
}
