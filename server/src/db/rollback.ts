/**
 * Quay lui mot phien ban schema — co sao luu bat buoc truoc khi cham vao du lieu.
 *
 * Chay:  npm run db:rollback --workspace server -- 22
 *        (tham so la phien ban DICH, tuc la phien ban muon quay VE)
 *
 * CO Y khong import tu `db/connection.ts`: file do mo CSDL va chay `migrate()`
 * ngay tai thoi diem import (`export const db = openDatabase()`). Chi can cham
 * vao no la CSDL bi keo nguoc len LATEST_VERSION — dung thu ma script nay dang
 * co gang huy. Vi vay duong dan CSDL duoc suy lai o day theo dung quy uoc cua
 * connection.ts thay vi import.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Phien ban quay lui duoc, va tep SQL tuong ung. Them dan khi co ban moi. */
const ROLLBACKS: Record<number, string> = {
  23: 'migrate-v23-rollback.sql',
  24: 'migrate-v24-rollback.sql',
  25: 'migrate-v25-rollback.sql',
  26: 'migrate-v26-rollback.sql',
  27: 'migrate-v27-rollback.sql',
  28: 'migrate-v28-rollback.sql',
};

function resolveDbPath(): string {
  const configured = process.env.WORKFLOW_DB_PATH;
  if (configured) return configured === ':memory:' ? configured : path.resolve(configured);
  const dataDir = process.env.WORKFLOW_DATA_DIR
    ? path.resolve(process.env.WORKFLOW_DATA_DIR)
    : path.resolve(here, '..', '..', 'data');
  return path.join(dataDir, 'app.db');
}

/**
 * Sao luu qua API `backup()` cua SQLite chu khong phai copy tep.
 *
 * CSDL chay o che do WAL: mot phan du lieu moi nhat con nam trong `app.db-wal`
 * chua checkpoint. `fs.copyFileSync('app.db')` se bo lai dung phan do va tao ra
 * mot ban sao luu thieu cac thay doi gan nhat — kieu sao luu chi phat hien ra la
 * hong vao dung luc can khoi phuc.
 */
async function backup(db: Database.Database, dbPath: string, from: number, to: number) {
  const dir = path.join(path.dirname(dbPath), 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dest = path.join(dir, `pre-rollback-v${from}-to-v${to}-${stamp}.db`);
  await db.backup(dest);
  return dest;
}

export async function rollbackTo(target: number): Promise<void> {
  const dbPath = resolveDbPath();
  if (dbPath === ':memory:') throw new Error('Khong the quay lui CSDL trong bo nho');
  if (!fs.existsSync(dbPath)) throw new Error(`Khong tim thay CSDL tai ${dbPath}`);

  const db = new Database(dbPath);
  try {
    db.pragma('journal_mode = WAL');
    const current = db.pragma('user_version', { simple: true }) as number;

    if (current === target) {
      console.log(`[db] Da o v${target}, khong co gi de quay lui`);
      return;
    }
    if (current < target) {
      throw new Error(
        `CSDL dang o v${current}, thap hon dich v${target} — dung migrate de tien len`
      );
    }

    /* Kiem tra TOAN BO chang duong truoc khi ghi mot byte nao: quay lui nua chung
       de lai CSDL o phien ban khong ai mo ta duoc, te hon la khong quay lui. */
    const steps: number[] = [];
    for (let version = current; version > target; version -= 1) {
      const file = ROLLBACKS[version];
      if (!file) throw new Error(`Chua co kich ban quay lui cho v${version}`);
      steps.push(version);
    }

    const saved = await backup(db, dbPath, current, target);
    console.log(`[db] Da sao luu truoc khi quay lui: ${saved}`);

    /* Tat khoa ngoai trong luc doi cau truc — giong cach v4 lam. Bat lai va kiem
       tra ngay sau do de khong am tham de lai tham chieu gay. */
    db.pragma('foreign_keys = OFF');
    try {
      db.transaction(() => {
        for (const version of steps) {
          db.exec(fs.readFileSync(path.join(here, ROLLBACKS[version]), 'utf8'));
          db.pragma(`user_version = ${version - 1}`);
          console.log(`[db] Da quay lui v${version} -> v${version - 1}`);
        }
      })();
    } finally {
      db.pragma('foreign_keys = ON');
    }

    const broken = db.pragma('foreign_key_check') as unknown[];
    if (broken.length > 0) {
      throw new Error(
        `Quay lui xong nhung con ${broken.length} tham chieu gay — khoi phuc tu ${saved}`
      );
    }
    console.log(`[db] Hoan tat, CSDL dang o v${target}`);
  } finally {
    db.close();
  }
}

/*
 * Chay truc tiep tu dong lenh, khong chay khi bi import (vi du trong test).
 *
 * PHAI dung `pathToFileURL`, khong ghep chuoi `file://` + duong dan. Tren Windows
 * `process.argv[1]` la `C:\...\rollback.ts` con `import.meta.url` la
 * `file:///C:/.../rollback.ts` — ba dau gach cheo va dau phan cach nguoc chieu.
 * Ghep tay se khong bao gio khop, va script im lang khong lam gi ca.
 */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = Number(process.argv[2]);
  if (!Number.isInteger(target) || target < 1) {
    console.error('Dung: npm run db:rollback --workspace server -- <phien-ban-dich>');
    process.exit(1);
  }
  rollbackTo(target).catch((error: unknown) => {
    console.error('[db] Quay lui that bai:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
