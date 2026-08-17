import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from 'better-sqlite3';
import type { CardStatus } from '@workflow/contracts';
import { fold } from '../lib/viSearch.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

export const LATEST_VERSION = 28;

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

/**
 * v19: doan `status_mapping` cho cac cot da co, roi keo `cards.status` khop lai.
 *
 * Phai lam o TypeScript vi SQLite khong bo dau tieng Viet duoc — giong
 * fillLabelNameNorm. Bang cu co the da doi ten cot tuy y; cot nao khong khop mau
 * nao thi de NULL, nghia la "cot nay khong mang nghia vong doi". De NULL an toan
 * hon la doan bua: nguoi dung gan tay sau, con doan sai thi keo the vao cot se
 * am tham doi trang thai khong dung y ho.
 */
const STATUS_PATTERNS: [CardStatus, string[]][] = [
  ['done', ['hoan thanh', 'hoan tat', 'done', 'xong', 'ket thuc']],
  ['review', ['cho duyet', 'review', 'phe duyet', 'nghiem thu', 'kiem tra']],
  ['blocked', ['bi chan', 'block', 'tac', 'vuong']],
  ['waiting_customer', ['cho khach', 'cho phan hoi', 'cho tra loi', 'waiting']],
  ['doing', ['dang lam', 'doing', 'progress', 'thuc hien', 'trien khai']],
  ['todo', ['can lam', 'todo', 'backlog', 'chua lam', 'moi']],
];

function guessStatus(name: string): CardStatus | null {
  const normalized = fold(name);
  // Duyet theo thu tu tren xuong: 'cho duyet' phai thang truoc 'cho khach',
  // va 'hoan thanh' thang truoc moi thu — nguoc lai se bat nham.
  for (const [status, patterns] of STATUS_PATTERNS) {
    if (patterns.some((pattern) => normalized.includes(pattern))) return status;
  }
  return null;
}

function fillListStatusMapping(db: Database): void {
  const rows = db.prepare(`SELECT id, name FROM lists`).all() as { id: number; name: string }[];
  const update = db.prepare(`UPDATE lists SET status_mapping = ? WHERE id = ?`);
  for (const row of rows) update.run(guessStatus(row.name), row.id);

  /*
   * Keo `cards.status` khop voi cot dang chua no.
   *
   * Truoc v19 hai ben troi tu do nen du lieu hien tai gan nhu chac chan da lech.
   * CHI dong bo the CHUA XONG: mot the da dong ma bi keo ve 'todo' chi vi no nam
   * o cot 'Can lam' la mo lai mot viec da hoan thanh — mat mat that.
   */
  db.prepare(
    `UPDATE cards
        SET status = (SELECT l.status_mapping FROM lists l WHERE l.id = cards.list_id)
      WHERE is_done = 0
        AND (SELECT l.status_mapping FROM lists l WHERE l.id = cards.list_id) IS NOT NULL
        AND (SELECT l.status_mapping FROM lists l WHERE l.id = cards.list_id) <> 'done'`
  ).run();
}

/**
 * v27: dung lai bang `deals` de rang buoc CHECK cua `stage` nhan them 'poc'.
 *
 * SQLite khong sua duoc CHECK tai cho. Thay vi chep tay dinh nghia bang — no da
 * co gan ba muoi cot tich tu tu v4 den v27 va chep sot mot cot la mat du lieu im
 * lang — cho nay lay chinh cau CREATE TABLE tu `sqlite_master` roi CHI thay cum
 * CHECK. Moi thu khac (mac dinh, khoa ngoai, kieu) di theo nguyen ven.
 *
 * `legacy_alter_table = ON` la bat buoc trong luc doi ten: mac dinh SQLite se co
 * sua cac tham chieu toi bang bi doi ten trong view va trigger, va o giua hai
 * buoc DROP/RENAME thi cac tham chieu do dang tro toi mot cai ten khong ton tai.
 */
function rebuildDealsForPoc(db: Database): void {
  const table = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'deals'`)
    .get() as { sql: string } | undefined;
  if (!table) throw new Error('v27: khong tim thay bang deals');

  const CHECK_PATTERN = /CHECK\s*\(\s*stage\s+IN\s*\([^)]*\)\s*\)/i;
  if (!CHECK_PATTERN.test(table.sql)) {
    // Khong co CHECK thi khong co gi de noi rong — bo qua, khong dung lai bang.
    return;
  }

  /* Chup lai chi muc va view PHU THUOC truoc khi dong vao bang. */
  const indexes = db
    .prepare(
      `SELECT sql FROM sqlite_master
        WHERE type = 'index' AND tbl_name = 'deals' AND sql IS NOT NULL`
    )
    .all() as { sql: string }[];
  const views = db
    .prepare(`SELECT name, sql FROM sqlite_master WHERE type = 'view' AND sql LIKE '%deals%'`)
    .all() as { name: string; sql: string }[];

  const columns = (db.prepare(`PRAGMA table_info(deals)`).all() as { name: string }[])
    .map((column) => `"${column.name}"`)
    .join(', ');

  const createNew = table.sql
    .replace(
      CHECK_PATTERN,
      `CHECK (stage IN ('lead','approaching','discussing','poc','quoted','negotiating','won','lost'))`
    )
    .replace(/^CREATE\s+TABLE\s+("?deals"?|\[deals\]|`deals`)/i, 'CREATE TABLE deals_new');

  for (const view of views) db.exec(`DROP VIEW IF EXISTS "${view.name}"`);
  db.exec(createNew);
  db.exec(`INSERT INTO deals_new (${columns}) SELECT ${columns} FROM deals`);
  db.exec(`DROP TABLE deals`);

  db.pragma('legacy_alter_table = ON');
  try {
    db.exec(`ALTER TABLE deals_new RENAME TO deals`);
  } finally {
    db.pragma('legacy_alter_table = OFF');
  }

  for (const index of indexes) db.exec(index.sql);
  for (const view of views) db.exec(view.sql);
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

  if (current === 12 && targetVersion >= 13) {
    db.transaction(() => {
      db.exec(readSql('migrate-v13.sql'));
      db.pragma('user_version = 13');
    })();
    console.log('[db] Da nang cap schema len v13 (AI Copilot da nha cung cap)');
    current = 13;
  }

  if (current === 13 && targetVersion >= 14) {
    db.transaction(() => {
      db.exec(readSql('migrate-v14.sql'));
      db.pragma('user_version = 14');
    })();
    console.log('[db] Da nang cap schema len v14 (cong viec gan hop dong / bao gia)');
    current = 14;
  }

  if (current === 14 && targetVersion >= 15) {
    db.transaction(() => {
      db.exec(readSql('migrate-v15.sql'));
      db.pragma('user_version = 15');
    })();
    console.log('[db] Da nang cap schema len v15 (nguoi phu trach cong viec)');
    current = 15;
  }

  if (current === 15 && targetVersion >= 16) {
    db.transaction(() => {
      db.exec(readSql('migrate-v16.sql'));
      db.pragma('user_version = 16');
    })();
    console.log('[db] Da nang cap schema len v16 (vong doi trang thai, nhat ky nhac viec)');
    current = 16;
  }

  if (current === 16 && targetVersion >= 17) {
    db.transaction(() => {
      db.exec(readSql('migrate-v17.sql'));
      db.pragma('user_version = 17');
    })();
    console.log('[db] Da nang cap schema len v17 (lop du an)');
    current = 17;
  }

  if (current === 17 && targetVersion >= 18) {
    db.transaction(() => {
      db.exec(readSql('migrate-v18.sql'));
      db.pragma('user_version = 18');
    })();
    console.log('[db] Da nang cap schema len v18 (truot han, khoi luong, phu thuoc)');
    current = 18;
  }

  if (current === 18 && targetVersion >= 19) {
    db.transaction(() => {
      db.exec(readSql('migrate-v19.sql'));
      fillListStatusMapping(db);
      db.pragma('user_version = 19');
    })();
    console.log('[db] Da nang cap schema len v19 (cot anh xa trang thai, du an suy tu bang)');
    current = 19;
  }

  if (current === 19 && targetVersion >= 20) {
    db.transaction(() => {
      db.exec(readSql('migrate-v20.sql'));
      db.pragma('user_version = 20');
    })();
    console.log('[db] Da nang cap schema len v20 (trung tam thong bao)');
    current = 20;
  }

  if (current === 20 && targetVersion >= 21) {
    db.transaction(() => {
      db.exec(readSql('migrate-v21.sql'));
      db.pragma('user_version = 21');
    })();
    console.log('[db] Da nang cap schema len v21 (thong bao qua Telegram)');
    current = 21;
  }

  if (current === 21 && targetVersion >= 22) {
    db.transaction(() => {
      db.exec(readSql('migrate-v22.sql'));
      db.pragma('user_version = 22');
    })();
    console.log('[db] Da nang cap schema len v22 (sao luu dinh ky qua Telegram)');
    current = 22;
  }

  if (current === 22 && targetVersion >= 23) {
    db.transaction(() => {
      db.exec(readSql('migrate-v23.sql'));
      db.pragma('user_version = 23');
    })();
    console.log('[db] Da nang cap schema len v23 (lien ket co hoi - du an, nhat ky thay doi)');
    current = 23;
  }

  if (current === 23 && targetVersion >= 24) {
    db.transaction(() => {
      db.exec(readSql('migrate-v24.sql'));
      db.pragma('user_version = 24');
    })();
    console.log('[db] Da nang cap schema len v24 (checklist ban giao, nguoi thuc hien)');
    current = 24;
  }

  if (current === 24 && targetVersion >= 25) {
    /* v25 dung lai bang ai_automations (doi rang buoc CHECK) nen phai tam tat
       khoa ngoai — ai_automation_runs va ai_notifications deu tro toi no. Cung
       cach v4 lam; PRAGMA nay khong co tac dung neu dat ben trong transaction. */
    db.pragma('foreign_keys = OFF');
    try {
      db.transaction(() => {
        db.exec(readSql('migrate-v25.sql'));
        db.pragma('user_version = 25');
      })();
    } finally {
      db.pragma('foreign_keys = ON');
    }
    const broken = db.pragma('foreign_key_check') as unknown[];
    if (broken.length > 0) console.warn('[db] Canh bao khoa ngoai sau v25:', broken.length, 'dong');
    console.log('[db] Da nang cap schema len v25 (canh bao Won qua han cho ban giao)');
    current = 25;
  }

  if (current === 25 && targetVersion >= 26) {
    db.transaction(() => {
      db.exec(readSql('migrate-v26.sql'));
      db.pragma('user_version = 26');
    })();
    console.log('[db] Da nang cap schema len v26 (giai doan, phan loai A/B, rui ro, nghiem thu)');
    current = 26;
  }

  if (current === 26 && targetVersion >= 27) {
    /* Dung lai bang deals nen phai tat khoa ngoai — hon muoi bang tro toi no. */
    db.pragma('foreign_keys = OFF');
    try {
      db.transaction(() => {
        db.exec(readSql('migrate-v27.sql'));
        rebuildDealsForPoc(db);
        db.pragma('user_version = 27');
      })();
    } finally {
      db.pragma('foreign_keys = ON');
    }
    const broken = db.pragma('foreign_key_check') as unknown[];
    if (broken.length > 0) console.warn('[db] Canh bao khoa ngoai sau v27:', broken.length, 'dong');
    console.log('[db] Da nang cap schema len v27 (PoC, tam dung, tuoi giai doan)');
    current = 27;
  }

  if (current === 27 && targetVersion >= 28) {
    db.transaction(() => {
      db.exec(readSql('migrate-v28.sql'));
      db.pragma('user_version = 28');
    })();
    console.log('[db] Da nang cap schema len v28 (toan ven du lieu CRM va du an)');
    current = 28;
  }
}
