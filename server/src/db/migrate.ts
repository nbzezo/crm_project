import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from 'better-sqlite3';
import { normalizeOrgName, type CardStatus } from '@workflow/contracts';
import { fold } from '../lib/viSearch.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

export const LATEST_VERSION = 63;

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

/**
 * v47: ghep AM dang la chu tu do voi nguoi dung — theo ho ten, ten dang nhap hoac
 * email, khong phan biet dau va hoa thuong. Chi ghep khi khop DUNG MOT nguoi;
 * mo ho thi de trong de nguoi dung tu chon, khong doan.
 */
function linkRevenueAmUsers(db: Database): void {
  const users = db.prepare(`SELECT id, username, email, full_name FROM users`).all() as {
    id: number;
    username: string;
    email: string | null;
    full_name: string | null;
  }[];
  const byKey = new Map<string, Set<number>>();
  for (const u of users) {
    for (const key of [u.full_name, u.username, u.email]) {
      const folded = fold(key?.trim());
      if (!folded) continue;
      if (!byKey.has(folded)) byKey.set(folded, new Set());
      byKey.get(folded)!.add(u.id);
    }
  }
  const match = (name: string): number | null => {
    const ids = byKey.get(fold(name.trim()));
    return ids && ids.size === 1 ? [...ids][0] : null;
  };

  const lines = db
    .prepare(`SELECT id, am FROM customer_services WHERE am IS NOT NULL AND TRIM(am) <> ''`)
    .all() as { id: number; am: string }[];
  const setLine = db.prepare(`UPDATE customer_services SET am_user_id = ? WHERE id = ?`);
  let linked = 0;
  for (const line of lines) {
    const id = match(line.am);
    if (id !== null) {
      setLine.run(id, line.id);
      linked += 1;
    }
  }

  const targets = db
    .prepare(`SELECT am, period, target_vnd, updated_by, updated_at FROM revenue_kpi_targets_v46`)
    .all() as {
    am: string;
    period: string;
    target_vnd: number;
    updated_by: number | null;
    updated_at: string;
  }[];
  const insert = db.prepare(
    `INSERT OR IGNORE INTO revenue_kpi_targets (am_user_id, period, target_vnd, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  );
  let dropped = 0;
  for (const t of targets) {
    const id = t.am.trim() === '' ? 0 : match(t.am);
    if (id === null) dropped += 1;
    else insert.run(id, t.period, t.target_vnd, t.updated_by, t.updated_at);
  }
  db.exec(`DROP TABLE revenue_kpi_targets_v46`);
  console.log(
    `[db] v47: ghep ${linked}/${lines.length} dong doanh thu voi nguoi dung` +
      (dropped ? `; bo ${dropped} chi tieu KPI khong ghep duoc AM` : '')
  );
}

/**
 * v50: dua ten to chuc da co ve dang "Viet Hoa Chu Dau" — cung quy tac voi luc luu
 * (normalizeOrgName). Chi du lieu, khong doi schema; search_text da fold ve chu
 * thuong nen khong can tinh lai. Ham luy dang nen chay lai cung vo hai.
 *
 * Ten cu cua moi dong bi doi duoc giu trong `customer_names_before_v50` — deploy
 * khong tu sao luu CSDL truoc migration, va cach viet hoa cu khong suy lai duoc.
 * Rollback v50 doc lai bang nay.
 */
function normalizeCustomerNames(db: Database): number {
  db.exec(`CREATE TABLE IF NOT EXISTS customer_names_before_v50 (
             customer_id INTEGER PRIMARY KEY, name TEXT NOT NULL)`);
  const rows = db.prepare('SELECT id, name FROM customers').all() as { id: number; name: string }[];
  const update = db.prepare('UPDATE customers SET name = ? WHERE id = ?');
  const keep = db.prepare(
    'INSERT OR IGNORE INTO customer_names_before_v50 (customer_id, name) VALUES (?, ?)'
  );
  let changed = 0;
  for (const row of rows) {
    const next = normalizeOrgName(row.name);
    if (next && next !== row.name) {
      keep.run(row.id, row.name);
      update.run(next, row.id);
      changed += 1;
    }
  }
  return changed;
}

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

/**
 * v33: dien `position` ban dau cho Ghi chu nhanh theo dung thu tu dang hien
 * (da ghim truoc, roi moi ghim gan day nhat truoc) — nguoi dung khong thay
 * danh sach xao tron ngay sau khi nang cap, cung khuon fillListStatusMapping.
 */
function fillQuickNotePositions(db: Database): void {
  // 1024 = STEP cua server/src/lib/position.ts — khong import truc tiep vi
  // module do lai import nguoc ve connection.ts (tao vong lap voi migrate.ts).
  const STEP = 1024;
  const rows = db
    .prepare(`SELECT id, is_pinned FROM quick_notes ORDER BY is_pinned DESC, updated_at DESC, id`)
    .all() as { id: number; is_pinned: number }[];
  const counters = new Map<number, number>();
  const update = db.prepare(`UPDATE quick_notes SET position = ? WHERE id = ?`);
  for (const row of rows) {
    const next = (counters.get(row.is_pinned) ?? 0) + STEP;
    counters.set(row.is_pinned, next);
    update.run(next, row.id);
  }
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

/**
 * Dung lai mot bang voi cau CREATE TABLE da duoc `transform` sua (v62+).
 *
 * Cung cach voi `rebuildDealsForPoc` (v27): lay cau CREATE that tu `sqlite_master`
 * va chi thay dung phan can doi, de moi cot/mac dinh/khoa ngoai di theo nguyen ven.
 * Khac o cho chup lai CA trigger cua bang: tu v38 `deals` co trigger nhat ky thay
 * doi, va DROP TABLE xoa trigger theo — quen dung lai la mat nhat ky im lang.
 *
 * Nguoi goi phai tat `foreign_keys` va boc trong transaction.
 */
export function rebuildTable(
  db: Database,
  table: string,
  transform: (sql: string) => string
): void {
  const current = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(table) as { sql: string } | undefined;
  if (!current) throw new Error(`Khong tim thay bang ${table}`);

  const indexes = db
    .prepare(
      `SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL`
    )
    .all(table) as { sql: string }[];
  const triggers = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = ?`)
    .all(table) as { sql: string }[];
  const views = db
    .prepare(`SELECT name, sql FROM sqlite_master WHERE type = 'view' AND sql LIKE ?`)
    .all(`%${table}%`) as { name: string; sql: string }[];
  const columns = (db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[])
    .map((column) => `"${column.name}"`)
    .join(', ');

  const temp = `${table}__rebuild`;
  const createNew = transform(current.sql).replace(
    new RegExp(`^CREATE\\s+TABLE\\s+("?${table}"?|\\[${table}\\]|\`${table}\`)`, 'i'),
    `CREATE TABLE "${temp}"`
  );
  if (!createNew.includes(temp)) throw new Error(`Khong doi duoc ten bang ${table} khi dung lai`);

  for (const view of views) db.exec(`DROP VIEW IF EXISTS "${view.name}"`);
  db.exec(createNew);
  db.exec(`INSERT INTO "${temp}" (${columns}) SELECT ${columns} FROM "${table}"`);
  db.exec(`DROP TABLE "${table}"`);
  db.pragma('legacy_alter_table = ON');
  try {
    db.exec(`ALTER TABLE "${temp}" RENAME TO "${table}"`);
  } finally {
    db.pragma('legacy_alter_table = OFF');
  }
  for (const index of indexes) db.exec(index.sql);
  for (const trigger of triggers) db.exec(trigger.sql);
  for (const view of views) db.exec(view.sql);
}

/**
 * v63: bien bon cot chu tu do thanh danh muc luu NHAN (xem PICKLISTS trong contracts).
 *
 * Moi nhom gia tri trung nhau sau khi bo dau, bo hoa thuong va cat khoang trang
 * ("CNTT", "cntt ", "Cntt") gop thanh MOT muc; nhan la bien the xuat hien nhieu
 * nhat, hoac nhan mac dinh neu nhom trung voi mot muc mac dinh. Du lieu duoc viet
 * lai ve dung nhan do de bao cao theo nhom khong bi tach. Nhom chi khac biet that
 * su (vd "CNTT" va "Cong nghe thong tin") thi de nguyen — quan tri vien tu Gop.
 *
 * Viet ham rieng, khong dung lib/picklists.ts: migration phai chay giong het nhau
 * du sau nay thu vien do doi.
 */
const V63_LISTS: {
  list: string;
  table: string;
  column: string;
  defaults: string[];
  /** Chi chen mac dinh khi cot chua co du lieu nao (cai moi, hoac chua ai nhap). */
  defaultsOnlyWhenEmpty: boolean;
  system: { key: string; label: string }[];
}[] = [
  {
    list: 'customer_industry',
    table: 'customers',
    column: 'industry',
    defaults: [
      'Công nghệ thông tin',
      'Tài chính – Ngân hàng',
      'Bảo hiểm',
      'Bán lẻ',
      'Sản xuất',
      'Logistics',
      'Giáo dục',
      'Y tế',
      'Bất động sản',
      'Nhà nước',
    ],
    defaultsOnlyWhenEmpty: true,
    system: [],
  },
  {
    list: 'customer_size',
    table: 'customers',
    column: 'size',
    defaults: ['SME', 'Mid-market', 'Enterprise'],
    defaultsOnlyWhenEmpty: false,
    system: [],
  },
  {
    list: 'customer_source',
    table: 'customers',
    column: 'source',
    defaults: [
      'Giới thiệu',
      'Sự kiện / Hội chợ',
      'LinkedIn',
      'Website',
      'Gọi lạnh',
      'Đối tác',
      'Khác',
    ],
    defaultsOnlyWhenEmpty: false,
    /* Khach hang tao tu luong tai hop dong len (routes/contracts.ts). */
    system: [{ key: 'contract', label: 'Hợp đồng' }],
  },
  {
    list: 'deal_source',
    table: 'deals',
    column: 'source',
    defaults: [
      'Giới thiệu',
      'Sự kiện / Hội chợ',
      'LinkedIn',
      'Website',
      'Gọi lạnh',
      'Đối tác',
      'Khác',
    ],
    defaultsOnlyWhenEmpty: false,
    /* Co hoi gia han tao tu hop dong sap het han (routes/contracts.ts). */
    system: [{ key: 'renewal', label: 'Gia hạn hợp đồng' }],
  },
];

function seedLabelPicklists(db: Database): void {
  const insert = db.prepare(
    `INSERT INTO picklist_items (list_key, item_key, label, position, is_system) VALUES (?, ?, ?, ?, ?)`
  );
  for (const spec of V63_LISTS) {
    const { table, column } = spec;
    db.prepare(`UPDATE "${table}" SET "${column}" = NULL WHERE TRIM("${column}") = ''`).run();
    const rows = db
      .prepare(
        `SELECT "${column}" AS value, COUNT(*) AS n FROM "${table}"
          WHERE "${column}" IS NOT NULL GROUP BY "${column}"`
      )
      .all() as { value: string; n: number }[];

    /* Nhom theo dang da bo dau. */
    const groups = new Map<string, { variants: { value: string; n: number }[] }>();
    for (const row of rows) {
      const folded = fold(row.value.trim()).replace(/\s+/g, ' ');
      if (!folded) continue;
      const group = groups.get(folded) ?? { variants: [] };
      group.variants.push(row);
      groups.set(folded, group);
    }

    const labels: { label: string; key?: string; system?: boolean }[] = [];
    const seen = new Set<string>();
    const add = (label: string, key?: string, system = false) => {
      const folded = fold(label).replace(/\s+/g, ' ');
      if (seen.has(folded)) return;
      seen.add(folded);
      labels.push({ label, key, system });
    };
    const useDefaults = !spec.defaultsOnlyWhenEmpty || groups.size === 0;
    if (useDefaults) for (const label of spec.defaults) add(label);
    for (const item of spec.system) add(item.label, item.key, true);

    const canonical = new Map<string, string>();
    for (const [folded, group] of groups) {
      const fromDefaults = labels.find(
        (entry) => fold(entry.label).replace(/\s+/g, ' ') === folded
      );
      const best = [...group.variants].sort(
        (a, b) => b.n - a.n || a.value.trim().localeCompare(b.value.trim())
      )[0];
      const label = fromDefaults?.label ?? best.value.trim().replace(/\s+/g, ' ');
      canonical.set(folded, label);
      for (const variant of group.variants) {
        if (variant.value !== label) {
          db.prepare(`UPDATE "${table}" SET "${column}" = ? WHERE "${column}" = ?`).run(
            label,
            variant.value
          );
        }
      }
    }
    for (const label of [...canonical.values()].sort((a, b) => a.localeCompare(b, 'vi')))
      add(label);

    const taken = new Set<string>();
    labels.forEach((entry, index) => {
      let key =
        entry.key ??
        (fold(entry.label)
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '')
          .slice(0, 40) ||
          'muc');
      if (taken.has(key)) {
        let n = 2;
        while (taken.has(`${key}_${n}`)) n += 1;
        key = `${key}_${n}`;
      }
      taken.add(key);
      insert.run(spec.list, key, entry.label, index + 1, entry.system ? 1 : 0);
    });
  }
}

/** v62: go CHECK liet ke cung cua `interactions.type` — gia tri gio nam o picklist_items. */
function dropInteractionTypeCheck(db: Database): void {
  const pattern = /\s*CHECK\s*\(\s*type\s+IN\s*\([^)]*\)\s*\)/i;
  const current = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'interactions'`)
    .get() as { sql: string } | undefined;
  if (!current || !pattern.test(current.sql)) return;
  rebuildTable(db, 'interactions', (sql) => sql.replace(pattern, ''));
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

  if (current === 28 && targetVersion >= 29) {
    db.transaction(() => {
      db.exec(readSql('migrate-v29.sql'));
      db.pragma('user_version = 29');
    })();
    console.log(
      '[db] Da nang cap schema len v29 (don nhat ky thay doi khi xoa deal/project/contract)'
    );
    current = 29;
  }

  if (current === 29 && targetVersion >= 30) {
    db.transaction(() => {
      db.exec(readSql('migrate-v30.sql'));
      db.pragma('user_version = 30');
    })();
    console.log('[db] Da nang cap schema len v30 (Ghi chu hop cho Co hoi va Du an)');
    current = 30;
  }

  if (current === 30 && targetVersion >= 31) {
    /* v31 dung lai bang meeting_notes (bo rang buoc CHECK bat buoc Co hoi/Du an)
       nen phai tam tat khoa ngoai — meeting_note_attendees tro toi no. Cung
       cach v25/v4 lam; PRAGMA nay khong co tac dung neu dat ben trong transaction. */
    db.pragma('foreign_keys = OFF');
    try {
      db.transaction(() => {
        db.exec(readSql('migrate-v31.sql'));
        db.pragma('user_version = 31');
      })();
    } finally {
      db.pragma('foreign_keys = ON');
    }
    const broken = db.pragma('foreign_key_check') as unknown[];
    if (broken.length > 0) console.warn('[db] Canh bao khoa ngoai sau v31:', broken.length, 'dong');
    console.log(
      '[db] Da nang cap schema len v31 (ghi chu hop doc lap, khong bat buoc Co hoi/Du an)'
    );
    current = 31;
  }

  if (current === 31 && targetVersion >= 32) {
    db.transaction(() => {
      db.exec(readSql('migrate-v32.sql'));
      db.pragma('user_version = 32');
    })();
    console.log('[db] Da nang cap schema len v32 (Ghi chu nhanh — Quick Notes)');
    current = 32;
  }

  if (current === 32 && targetVersion >= 33) {
    db.transaction(() => {
      db.exec(readSql('migrate-v33.sql'));
      fillQuickNotePositions(db);
      db.pragma('user_version = 33');
    })();
    console.log('[db] Da nang cap schema len v33 (keo tha sap xep + chon mau Ghi chu nhanh)');
    current = 33;
  }

  if (current === 33 && targetVersion >= 34) {
    db.transaction(() => {
      db.exec(readSql('migrate-v34.sql'));
      db.pragma('user_version = 34');
    })();
    console.log('[db] Da nang cap schema len v34 (dinh kem tep vao Ghi chu hop)');
    current = 34;
  }

  if (current === 34 && targetVersion >= 35) {
    db.transaction(() => {
      db.exec(readSql('migrate-v35.sql'));
      db.pragma('user_version = 35');
    })();
    console.log('[db] Da nang cap schema len v35 (dang nhap mot nguoi dung + phien server-side)');
    current = 35;
  }

  if (current === 35 && targetVersion >= 36) {
    /* Mo rong CHECK cua bang cha; tat khoa ngoai trong luc thay bang, sau do kiem tra lai. */
    db.pragma('foreign_keys = OFF');
    try {
      db.transaction(() => {
        db.exec(readSql('migrate-v36.sql'));
        db.pragma('user_version = 36');
      })();
    } finally {
      db.pragma('foreign_keys = ON');
    }
    const broken = db.pragma('foreign_key_check') as unknown[];
    if (broken.length > 0) console.warn('[db] Canh bao khoa ngoai sau v36:', broken.length, 'dong');
    console.log('[db] Da nang cap schema len v36 (nha cung cap AI 9Router)');
    current = 36;
  }

  if (current === 36 && targetVersion >= 37) {
    db.transaction(() => {
      db.exec(readSql('migrate-v37.sql'));
      db.pragma('user_version = 37');
    })();
    console.log('[db] Da nang cap schema len v37 (phien chat voi Tro ly AI)');
    current = 37;
  }

  if (current === 37 && targetVersion >= 38) {
    db.transaction(() => {
      db.exec(readSql('migrate-v38.sql'));
      db.pragma('user_version = 38');
    })();
    console.log('[db] Da nang cap schema len v38 (nhieu nguoi dung, dang nhap bang email)');
    current = 38;
  }

  if (current === 38 && targetVersion >= 39) {
    /* Thay bang entity_change_log de mo rong CHECK; tat khoa ngoai trong luc do,
       sau do kiem tra lai — cung khuon voi v36. */
    db.pragma('foreign_keys = OFF');
    try {
      db.transaction(() => {
        db.exec(readSql('migrate-v39.sql'));
        db.pragma('user_version = 39');
      })();
    } finally {
      db.pragma('foreign_keys = ON');
    }
    const broken = db.pragma('foreign_key_check') as unknown[];
    if (broken.length > 0) console.warn('[db] Canh bao khoa ngoai sau v39:', broken.length, 'dong');
    console.log('[db] Da nang cap schema len v39 (cay don vi, vi tri, ma tran phan quyen)');
    current = 39;
  }

  if (current === 39 && targetVersion >= 40) {
    db.transaction(() => {
      db.exec(readSql('migrate-v40.sql'));
      db.pragma('user_version = 40');
    })();
    console.log('[db] Da nang cap schema len v40 (chu so huu ban ghi)');
    current = 40;
  }

  if (current === 40 && targetVersion >= 41) {
    db.transaction(() => {
      db.exec(readSql('migrate-v41.sql'));
      db.pragma('user_version = 41');
    })();
    console.log('[db] Da nang cap schema len v41 (phien chat AI theo nguoi dung)');
    current = 41;
  }

  if (current === 41 && targetVersion >= 42) {
    db.transaction(() => {
      db.exec(readSql('migrate-v42.sql'));
      db.pragma('user_version = 42');
    })();
    console.log('[db] Da nang cap schema len v42 (cong viec chung)');
    current = 42;
  }

  if (current === 42 && targetVersion >= 43) {
    db.transaction(() => {
      db.exec(readSql('migrate-v43.sql'));
      db.pragma('user_version = 43');
    })();
    console.log('[db] Da nang cap schema len v43 (trang tai lieu va muc dich su dung)');
    current = 43;
  }

  if (current === 43 && targetVersion >= 44) {
    db.transaction(() => {
      db.exec(readSql('migrate-v44.sql'));
      db.pragma('user_version = 44');
    })();
    console.log('[db] Da nang cap schema len v44 (workspace Cong viec, theo doi va saved views)');
    current = 44;
  }

  if (current === 44 && targetVersion >= 45) {
    db.transaction(() => {
      db.exec(readSql('migrate-v45.sql'));
      db.pragma('user_version = 45');
    })();
    console.log('[db] Da nang cap schema len v45 (doanh thu Moi + Mo rong / Nen)');
    current = 45;
  }

  if (current === 45 && targetVersion >= 46) {
    db.transaction(() => {
      db.exec(readSql('migrate-v46.sql'));
      db.pragma('user_version = 46');
    })();
    console.log('[db] Da nang cap schema len v46 (chi tieu KPI doanh thu theo AM)');
    current = 46;
  }

  if (current === 46 && targetVersion >= 47) {
    db.transaction(() => {
      db.exec(readSql('migrate-v47.sql'));
      linkRevenueAmUsers(db);
      db.pragma('user_version = 47');
    })();
    console.log('[db] Da nang cap schema len v47 (AM doanh thu la nguoi dung)');
    current = 47;
  }

  if (current === 47 && targetVersion >= 48) {
    db.transaction(() => {
      db.exec(readSql('migrate-v48.sql'));
      db.pragma('user_version = 48');
    })();
    console.log('[db] Da nang cap schema len v48 (gui email bang tai khoan Google)');
    current = 48;
  }

  if (current === 48 && targetVersion >= 49) {
    db.transaction(() => {
      db.exec(readSql('migrate-v49.sql'));
      db.pragma('user_version = 49');
    })();
    console.log('[db] Da nang cap schema len v49 (sao luu len Google Drive)');
    current = 49;
  }

  if (current === 49 && targetVersion >= 50) {
    let changed = 0;
    db.transaction(() => {
      changed = normalizeCustomerNames(db);
      db.pragma('user_version = 50');
    })();
    console.log(
      `[db] Da nang cap len v50 (chuan hoa ${changed} ten to chuc ve dang Viet Hoa Chu Dau)`
    );
    current = 50;
  }

  if (current === 50 && targetVersion >= 51) {
    db.transaction(() => {
      db.exec(readSql('migrate-v51.sql'));
      db.pragma('user_version = 51');
    })();
    console.log(
      '[db] Da nang cap schema len v51 (chia se tai lieu/bao gia/hop dong bang link chi xem)'
    );
    current = 51;
  }

  if (current === 51 && targetVersion >= 52) {
    /* Thay bang share_links de bo CHECK loai ban ghi; tat khoa ngoai trong luc do
       (share_link_views tro vao no), sau do kiem tra lai — cung khuon voi v36/v39. */
    db.pragma('foreign_keys = OFF');
    try {
      db.transaction(() => {
        db.exec(readSql('migrate-v52.sql'));
        db.pragma('user_version = 52');
      })();
    } finally {
      db.pragma('foreign_keys = ON');
    }
    const broken = db.pragma('foreign_key_check') as unknown[];
    if (broken.length > 0) console.warn('[db] Canh bao khoa ngoai sau v52:', broken.length, 'dong');
    console.log('[db] Da nang cap schema len v52 (chia se Trang tai lieu, bo CHECK loai ban ghi)');
    current = 52;
  }

  if (current === 52 && targetVersion >= 53) {
    db.transaction(() => {
      db.exec(readSql('migrate-v53.sql'));
      db.pragma('user_version = 53');
    })();
    console.log('[db] Da nang cap schema len v53 (danh ba ca nhan, dong bo danh ba Google)');
    current = 53;
  }

  if (current === 53 && targetVersion >= 54) {
    db.transaction(() => {
      db.exec(readSql('migrate-v54.sql'));
      db.pragma('user_version = 54');
    })();
    console.log('[db] Da nang cap schema len v54 (ho so khach hang 360, goi y co hoi, cham soc)');
    current = 54;
  }

  if (current === 54 && targetVersion >= 55) {
    db.transaction(() => {
      db.exec(readSql('migrate-v55.sql'));
      db.pragma('user_version = 55');
    })();
    console.log('[db] Da nang cap schema len v55 (luu ket qua AI phan tich cua man Trong tam)');
    current = 55;
  }

  if (current === 55 && targetVersion >= 56) {
    db.transaction(() => {
      db.exec(readSql('migrate-v56.sql'));
      db.pragma('user_version = 56');
    })();
    console.log(
      '[db] Da nang cap schema len v56 (canh bao khach mo lien ket chuyen sang thong bao)'
    );
    current = 56;
  }

  if (current === 56 && targetVersion >= 57) {
    db.transaction(() => {
      db.exec(readSql('migrate-v57.sql'));
      db.pragma('user_version = 57');
    })();
    console.log('[db] Da nang cap schema len v57 (luu ma lien ket chia se da ma hoa)');
    current = 57;
  }

  if (current === 57 && targetVersion >= 58) {
    db.transaction(() => {
      db.exec(readSql('migrate-v58.sql'));
      db.pragma('user_version = 58');
    })();
    console.log('[db] Da nang cap schema len v58 (ma khoa man hinh cho theo tai khoan)');
    current = 58;
  }

  if (current === 58 && targetVersion >= 59) {
    db.transaction(() => {
      db.exec(readSql('migrate-v59.sql'));
      db.pragma('user_version = 59');
    })();
    console.log('[db] Da nang cap schema len v59 (link nhac yeu thich theo tai khoan)');
    current = 59;
  }

  if (current === 59 && targetVersion >= 60) {
    db.transaction(() => {
      db.exec(readSql('migrate-v60.sql'));
      db.pragma('user_version = 60');
    })();
    console.log('[db] Da nang cap schema len v60 (chi muc cho cot lien ket)');
    current = 60;
  }

  if (current === 60 && targetVersion >= 61) {
    db.transaction(() => {
      db.exec(readSql('migrate-v61.sql'));
      db.pragma('user_version = 61');
    })();
    console.log('[db] Da nang cap schema len v61 (chi muc dem viec theo cot)');
    current = 61;
  }

  if (current === 61 && targetVersion >= 62) {
    db.pragma('foreign_keys = OFF');
    try {
      db.transaction(() => {
        db.exec(readSql('migrate-v62.sql'));
        dropInteractionTypeCheck(db);
        db.pragma('user_version = 62');
      })();
    } finally {
      db.pragma('foreign_keys = ON');
    }
    const broken = db.pragma('foreign_key_check') as unknown[];
    if (broken.length > 0) console.warn('[db] Canh bao khoa ngoai sau v62:', broken.length, 'dong');
    console.log('[db] Da nang cap schema len v62 (danh muc dong)');
    current = 62;
  }

  if (current === 62 && targetVersion >= 63) {
    db.transaction(() => {
      seedLabelPicklists(db);
      db.pragma('user_version = 63');
    })();
    console.log('[db] Da nang cap schema len v63 (nganh, quy mo, nguon thanh danh muc)');
    current = 63;
  }
}
