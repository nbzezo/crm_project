import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from 'better-sqlite3';
import { fold } from '../lib/viSearch.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

export const LATEST_VERSION = 12;

/** v5: viec con — mot the co the la con cua the khac (toi da 1 cap). */
const V5 = `
  ALTER TABLE cards ADD COLUMN parent_id INTEGER REFERENCES cards(id) ON DELETE CASCADE;
  CREATE INDEX idx_cards_parent ON cards(parent_id);
`;

/** v6: tep dinh kem tren the (dung lai bang documents) + truong thong tin tuy chinh theo bang. */
const V6 = `
  ALTER TABLE documents ADD COLUMN card_id INTEGER REFERENCES cards(id) ON DELETE CASCADE;
  CREATE INDEX idx_documents_card ON documents(card_id, created_at DESC);

  CREATE TABLE card_fields (
    id INTEGER PRIMARY KEY,
    board_id INTEGER REFERENCES boards(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    field_type TEXT NOT NULL DEFAULT 'text'
      CHECK (field_type IN ('text','number','date','select','checkbox')),
    options TEXT NOT NULL DEFAULT '[]',
    show_on_card INTEGER NOT NULL DEFAULT 0,
    position REAL NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_card_fields_board ON card_fields(board_id, position);

  CREATE TABLE card_field_values (
    card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    field_id INTEGER NOT NULL REFERENCES card_fields(id) ON DELETE CASCADE,
    value TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (card_id, field_id)
  );
`;

/** v2: nen bang (mau/gradient), gan sao, anh bia the, thu gon danh sach. */
const V2 = `
  ALTER TABLE boards ADD COLUMN background TEXT NOT NULL DEFAULT '#0079bf';
  ALTER TABLE boards ADD COLUMN is_starred INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE cards ADD COLUMN cover_color TEXT;
  ALTER TABLE lists ADD COLUMN is_collapsed INTEGER NOT NULL DEFAULT 0;
  UPDATE boards SET background = color WHERE color IS NOT NULL;
`;

/** v3: nhan xet tren the + luu tru the. */
const V3 = `
  CREATE TABLE card_comments (
    id INTEGER PRIMARY KEY,
    card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at TEXT
  );
  CREATE INDEX idx_comments_card ON card_comments(card_id, created_at DESC);
  ALTER TABLE cards ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;
`;

function readSql(name: string): string {
  return fs.readFileSync(path.join(here, name), 'utf8');
}

/**
 * v9: dien cot name_norm (ten da bo dau) roi moi tao chi muc duy nhat.
 *
 * SQLite khong bo dau tieng Viet duoc nen phai tinh o TypeScript. Neu du lieu cu
 * da co hai nhan trung ten trong cung mot nhom (truoc v9 khong he cam), them hau to
 * so cho nhan sau de chi muc duy nhat tao duoc — va bao ro ten nao bi doi.
 */
function fillLabelNameNorm(db: Database): void {
  const rows = db.prepare(`SELECT id, name, parent_id FROM labels ORDER BY id`).all() as {
    id: number;
    name: string;
    parent_id: number | null;
  }[];

  const update = db.prepare(`UPDATE labels SET name = ?, name_norm = ? WHERE id = ?`);
  const taken = new Set<string>();
  const renamed: string[] = [];

  for (const row of rows) {
    const base = fold(row.name).replace(/\s+/g, ' ').trim();
    let name = row.name;
    let norm = base;
    for (let n = 2; taken.has(`${row.parent_id ?? 0}|${norm}`); n += 1) {
      name = `${row.name} ${n}`;
      norm = `${base} ${n}`;
    }
    if (name !== row.name) renamed.push(`"${row.name}" -> "${name}"`);
    taken.add(`${row.parent_id ?? 0}|${norm}`);
    update.run(name, norm, row.id);
  }

  db.exec(`CREATE UNIQUE INDEX idx_labels_unique ON labels(IFNULL(parent_id, 0), name_norm)`);
  if (renamed.length > 0) {
    console.warn('[db] v9: doi ten nhan bi trung trong cung nhom:', renamed.join(', '));
  }
}

/**
 * v10: dien name_norm cho doi thu vua chuyen tu deals.competitor sang deal_competitors.
 *
 * Giong fillLabelNameNorm: SQLite khong bo dau tieng Viet duoc nen phai tinh o TypeScript.
 * Khong co chi muc duy nhat o day — name_norm chi dung de goi y ten da nhap truoc do.
 */
function fillCompetitorNameNorm(db: Database): void {
  const rows = db.prepare(`SELECT id, name FROM deal_competitors`).all() as {
    id: number;
    name: string;
  }[];
  const update = db.prepare(`UPDATE deal_competitors SET name_norm = ? WHERE id = ?`);
  for (const row of rows) {
    update.run(fold(row.name).replace(/\s+/g, ' ').trim(), row.id);
  }
}

export function migrate(db: Database, targetVersion = LATEST_VERSION): void {
  if (!Number.isInteger(targetVersion) || targetVersion < 1 || targetVersion > LATEST_VERSION) {
    throw new Error(`Phien ban migration dich khong hop le: ${targetVersion}`);
  }
  let current = db.pragma('user_version', { simple: true }) as number;
  if (current >= targetVersion) return;

  if (current === 0 && targetVersion >= 1) {
    db.transaction(() => {
      db.exec(readSql('schema.sql'));
      db.pragma('user_version = 1');
    })();
    console.log('[db] Da khoi tao schema v1');
    current = 1;
  }

  if (current === 1 && targetVersion >= 2) {
    db.transaction(() => {
      db.exec(V2);
      db.pragma('user_version = 2');
    })();
    console.log('[db] Da nang cap schema len v2');
    current = 2;
  }

  if (current === 2 && targetVersion >= 3) {
    db.transaction(() => {
      db.exec(V3);
      db.pragma('user_version = 3');
    })();
    console.log('[db] Da nang cap schema len v3');
    current = 3;
  }

  if (current === 3 && targetVersion >= 4) {
    // v4 dung lai bang customers/deals/interactions nen phai tam tat rang buoc khoa ngoai
    db.pragma('foreign_keys = OFF');
    try {
      db.transaction(() => {
        db.exec(readSql('migrate-v4.sql'));
        db.pragma('user_version = 4');
      })();
    } finally {
      db.pragma('foreign_keys = ON');
    }
    const broken = db.pragma('foreign_key_check') as unknown[];
    if (broken.length > 0) console.warn('[db] Canh bao khoa ngoai sau v4:', broken.length, 'dong');
    console.log('[db] Da nang cap schema len v4 (BRD: hop dong, bao gia, tai lieu)');
    current = 4;
  }

  if (current === 4 && targetVersion >= 5) {
    db.transaction(() => {
      db.exec(V5);
      db.pragma('user_version = 5');
    })();
    console.log('[db] Da nang cap schema len v5 (viec con)');
    current = 5;
  }

  if (current === 5 && targetVersion >= 6) {
    db.transaction(() => {
      db.exec(V6);
      db.pragma('user_version = 6');
    })();
    console.log('[db] Da nang cap schema len v6 (tep dinh kem the, truong thong tin)');
    current = 6;
  }

  if (current === 6 && targetVersion >= 7) {
    db.transaction(() => {
      db.exec(readSql('migrate-v7.sql'));
      db.pragma('user_version = 7');
    })();
    console.log('[db] Da nang cap schema len v7 (dich vu su dung, doanh thu theo thang)');
    current = 7;
  }

  if (current === 7 && targetVersion >= 8) {
    db.transaction(() => {
      db.exec(readSql('migrate-v8.sql'));
      db.pragma('user_version = 8');
    })();
    console.log('[db] Da nang cap schema len v8 (doanh thu theo giai doan)');
    current = 8;
  }

  if (current === 8 && targetVersion >= 9) {
    db.transaction(() => {
      db.exec(readSql('migrate-v9.sql'));
      fillLabelNameNorm(db);
      db.pragma('user_version = 9');
    })();
    console.log('[db] Da nang cap schema len v9 (nhan 2 cap, gan cho Account/Opportunity)');
    current = 9;
  }

  if (current === 9 && targetVersion >= 10) {
    db.transaction(() => {
      db.exec(readSql('migrate-v10.sql'));
      fillCompetitorNameNorm(db);
      db.pragma('user_version = 10');
    })();
    console.log('[db] Da nang cap schema len v10 (cham diem co hoi BANT + 4P)');
    current = 10;
  }

  if (current === 10 && targetVersion >= 11) {
    db.transaction(() => {
      db.exec(readSql('migrate-v11.sql'));
      db.pragma('user_version = 11');
    })();
    console.log('[db] Da nang cap schema len v11 (lich ca nhan)');
    current = 11;
  }

  if (current === 11 && targetVersion >= 12) {
    db.transaction(() => {
      db.exec(readSql('migrate-v12.sql'));
      db.pragma('user_version = 12');
    })();
    console.log('[db] Da nang cap schema len v12 (quan ly tai lieu va thung rac)');
    current = 12;
  }
}
