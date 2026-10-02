import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { LATEST_VERSION, migrate } from '../db/migrate.ts';

for (const sourceVersion of [1, 4, 7, 9, 10, 14, 18, 35, 37]) {
  test(`nang cap fixture v${sourceVersion} len v${LATEST_VERSION} khong mat du lieu`, () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    try {
      migrate(db, sourceVersion);
      db.prepare(`INSERT INTO customers (name, search_text) VALUES (?, ?)`).run(
        `Khach hang fixture v${sourceVersion}`,
        `fixture v${sourceVersion}`
      );
      const customerId = Number(
        (db.prepare(`SELECT id FROM customers ORDER BY id DESC LIMIT 1`).get() as { id: number }).id
      );
      const boardId = Number(
        db
          .prepare(`INSERT INTO boards (name, customer_id) VALUES (?, ?)`)
          .run('Bang cu', customerId).lastInsertRowid
      );
      const listId = Number(
        db
          .prepare(`INSERT INTO lists (board_id, name, position) VALUES (?, ?, ?)`)
          .run(boardId, 'Danh sach cu', 1024).lastInsertRowid
      );
      /* Hai cot de kiem chung backfill cua v19: mot cot mang ten quy trinh quen
         thuoc (phai doan ra 'done') va mot cot ten tu do (phai de NULL). */
      const doneListId = Number(
        db
          .prepare(`INSERT INTO lists (board_id, name, position) VALUES (?, ?, ?)`)
          .run(boardId, 'Hoàn thành', 2048).lastInsertRowid
      );
      db.prepare(
        `INSERT INTO cards (list_id, title, position, customer_id, search_text) VALUES (?, ?, ?, ?, ?)`
      ).run(listId, 'Cong viec cu', 1024, customerId, 'cong viec cu');

      /* Dau vao cho v38: mot nguoi duoc danh dau "toi" va mot tai khoan dang nhap
         cu. Hai thu nay truoc v38 khong he noi voi nhau — migration phai noi duoc. */
      let meContactId: number | null = null;
      if (sourceVersion >= 15) {
        meContactId = Number(
          db
            .prepare(
              `INSERT INTO contacts (customer_id, full_name, email, is_me, is_active)
               VALUES (?, ?, ?, 1, 1)`
            )
            .run(customerId, 'Nguoi Dung Cu', 'toi@congty.vn').lastInsertRowid
        );
      }
      if (sourceVersion >= 35) {
        db.prepare(
          `INSERT INTO users (username, password_hash, password_salt) VALUES (?, ?, ?)`
        ).run('nguoi-dung-cu', 'hash-cu', 'salt-cu');
      }

      let oldNoteId: number | null = null;
      if (sourceVersion >= 30) {
        oldNoteId = Number(
          db.prepare(`INSERT INTO meeting_notes (title) VALUES (?)`).run('Cuộc họp cũ')
            .lastInsertRowid
        );
      }

      migrate(db);

      assert.equal(db.pragma('user_version', { simple: true }), LATEST_VERSION);
      if (oldNoteId !== null) {
        const oldNote = db
          .prepare(`SELECT title, purpose_key FROM meeting_notes WHERE id = ?`)
          .get(oldNoteId) as { title: string; purpose_key: string };
        assert.deepEqual(oldNote, { title: 'Cuộc họp cũ', purpose_key: 'meeting' });
      }
      const globalBoard = db
        .prepare(
          `SELECT id FROM boards WHERE name = 'Công việc chung' AND owner_contact_id IS NULL`
        )
        .get();
      assert.equal(globalBoard, undefined, 'migration khong duoc tao bang chung lo du lieu');
      assert.equal(
        (db.prepare(`SELECT name FROM customers WHERE id = ?`).get(customerId) as { name: string })
          .name,
        // v50 chuan hoa ten ve dang Viet Hoa Chu Dau ("v1" khong nguyen am -> "V1").
        `Khach Hang Fixture V${sourceVersion}`
      );
      assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM cards`).get() as { n: number }).n, 1);

      /* v15: du lieu cu phai roi vao dung mac dinh — moi khach hang san co la
         'customer' (khong lot khoi pipeline) va moi nguoi lien he van giao viec
         duoc (is_active = 1). Sai mac dinh o day la mat du lieu am tham. */
      assert.equal(
        (
          db.prepare(`SELECT org_kind FROM customers WHERE id = ?`).get(customerId) as {
            org_kind: string;
          }
        ).org_kind,
        'customer'
      );
      assert.equal(
        (
          db
            .prepare(`SELECT COUNT(*) AS n FROM cards WHERE assignee_contact_id IS NOT NULL`)
            .get() as { n: number }
        ).n,
        0
      );

      /* v19: cot doan duoc nghia thi mang anh xa, cot ten tu do de NULL — doan
         bua se lam keo the vao do am tham doi trang thai khong dung y nguoi dung.

         Chi kiem tra voi fixture CU HON v19. Tu v19 tro di, backfill da chay xong
         truoc khi test chen cot vao, nen cot moi nay dung ra phai mang NULL: mot
         cot tao sau khong co gi de backfill ca. Khang dinh no bang 'done' se la
         doi migration lam mot viec no khong he hua. */
      if (sourceVersion < 19) {
        const mappings = db.prepare(`SELECT id, status_mapping FROM lists`).all() as {
          id: number;
          status_mapping: string | null;
        }[];
        assert.equal(mappings.find((l) => l.id === doneListId)?.status_mapping, 'done');
        assert.equal(mappings.find((l) => l.id === listId)?.status_mapping, null);
      }

      // `cards.project_id` phai bien mat cung voi chi muc cua no.
      const cardColumns = db.prepare(`PRAGMA table_info(cards)`).all() as { name: string }[];
      assert.ok(!cardColumns.some((c) => c.name === 'project_id'));
      const indexes = db.prepare(`PRAGMA index_list(cards)`).all() as { name: string }[];
      assert.ok(!indexes.some((i) => i.name === 'idx_cards_project'));

      /* v20: trang thai doc/snooze nam o lop tong hop, khong chen cot vao bon
         bang nghiep vu nguon. */
      const notificationColumns = db.prepare(`PRAGMA table_info(notification_states)`).all() as {
        name: string;
      }[];
      assert.deepEqual(
        notificationColumns.map((column) => column.name),
        ['notification_key', 'is_read', 'read_at', 'snoozed_until', 'updated_at']
      );

      // v32: Ghi chu nhanh la bang moc doc lap, khong dung lai bang nao cu.
      const quickNoteColumns = db.prepare(`PRAGMA table_info(quick_notes)`).all() as {
        name: string;
      }[];
      assert.ok(quickNoteColumns.some((c) => c.name === 'is_pinned'));
      const documentColumns = db.prepare(`PRAGMA table_info(documents)`).all() as {
        name: string;
      }[];
      assert.ok(documentColumns.some((c) => c.name === 'quick_note_id'));

      // v36: 9Router la provider rieng, co the luu/sync ma khong muon danh DeepSeek.
      const nineRouter = db
        .prepare(
          `SELECT display_name, base_url FROM ai_provider_configs WHERE provider = '9router'`
        )
        .get() as { display_name: string; base_url: string } | undefined;
      assert.deepEqual(nineRouter, {
        display_name: '9Router',
        base_url: 'http://127.0.0.1:20128/v1',
      });

      /* v38: tai khoan cu duoc noi voi so danh ba va giu nguyen mat khau.
         Chi kiem tra tu v35 tro di — truoc do chua co bang `users` de ma noi. */
      if (sourceVersion >= 35) {
        const user = db
          .prepare(`SELECT username, password_hash, email, contact_id, is_active FROM users`)
          .get() as
          | {
              username: string;
              password_hash: string;
              email: string | null;
              contact_id: number | null;
              is_active: number;
            }
          | undefined;
        assert.ok(user, 'tai khoan cu phai con nguyen sau khi nang cap');
        assert.equal(user.username, 'nguoi-dung-cu');
        assert.equal(user.password_hash, 'hash-cu', 'khong duoc dung toi mat khau da bam');
        assert.equal(user.is_active, 1, 'tai khoan cu mac dinh van hoat dong');
        assert.equal(user.contact_id, meContactId, 'phai noi voi contact dang la "toi"');
        assert.equal(user.email, 'toi@congty.vn', 'email suy tu contact do');

        const emailSettings = db.prepare(`SELECT COUNT(*) AS n FROM email_settings`).get() as {
          n: number;
        };
        assert.equal(emailSettings.n, 1, 'phai co dung mot dong cau hinh email');
      }

      assert.deepEqual(db.pragma('foreign_key_check'), []);
      assert.equal((db.pragma('integrity_check', { simple: true }) as string).toLowerCase(), 'ok');
    } finally {
      db.close();
    }
  });
}

test('v43 giu ghi chu cu trong nhom bien ban hop', () => {
  const db = new Database(':memory:');
  try {
    migrate(db, 42);
    const id = Number(
      db.prepare(`INSERT INTO meeting_notes (title) VALUES (?)`).run('Cuộc họp cũ').lastInsertRowid
    );
    migrate(db);
    assert.deepEqual(
      db.prepare(`SELECT title, purpose_key FROM meeting_notes WHERE id = ?`).get(id),
      { title: 'Cuộc họp cũ', purpose_key: 'meeting' }
    );
  } finally {
    db.close();
  }
});

test('v47 ghep AM chu tu do voi nguoi dung, chuyen chi tieu KPI sang am_user_id', () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db, 46);
  const user = Number(
    db
      .prepare(
        `INSERT INTO users (username, password_hash, password_salt, email, full_name) VALUES ('lan.nt', 'x', 'x', 'lan@congty.vn', 'Nguyễn Thị Lan')`
      )
      .run().lastInsertRowid
  );
  const customer = Number(
    db.prepare(`INSERT INTO customers (name, org_kind) VALUES ('A', 'customer')`).run()
      .lastInsertRowid
  );
  const addLine = (am: string) =>
    Number(
      db.prepare(`INSERT INTO customer_services (customer_id, am) VALUES (?, ?)`).run(customer, am)
        .lastInsertRowid
    );
  const byName = addLine('nguyen thi lan');
  const byUsername = addLine('LAN.NT');
  const unknown = addLine('Người cũ');
  const target = db.prepare(
    `INSERT INTO revenue_kpi_targets (am, period, target_vnd) VALUES (?, '2026-01', ?)`
  );
  target.run('Nguyễn Thị Lan', 100);
  target.run('', 50);
  target.run('Người cũ', 70);

  migrate(db);
  const amOf = (id: number) =>
    (
      db.prepare(`SELECT am_user_id, am FROM customer_services WHERE id = ?`).get(id) as {
        am_user_id: number | null;
        am: string;
      }
    ).am_user_id;
  assert.equal(amOf(byName), user);
  assert.equal(amOf(byUsername), user);
  assert.equal(amOf(unknown), null);
  assert.deepEqual(
    db
      .prepare(`SELECT am_user_id, target_vnd FROM revenue_kpi_targets ORDER BY am_user_id`)
      .all()
      .map((r) => ({ ...(r as object) })),
    [
      { am_user_id: 0, target_vnd: 50 },
      { am_user_id: user, target_vnd: 100 },
    ]
  );
  db.close();
});

test('v48 them dang nhap Google cho email ma giu nguyen cau hinh SMTP, va quay lui duoc', () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db, 47);
  db.prepare(
    `UPDATE email_settings SET enabled = 1, host = 'smtp.gmail.com', from_email = 'a@b.vn'`
  ).run();

  migrate(db);
  const row = db
    .prepare('SELECT host, from_email, auth_type, google_account FROM email_settings')
    .get();
  assert.deepEqual(row, {
    host: 'smtp.gmail.com',
    from_email: 'a@b.vn',
    auth_type: 'password',
    google_account: '',
  });
  assert.throws(() => db.prepare(`UPDATE email_settings SET auth_type = 'yahoo'`).run());

  db.exec(fs.readFileSync(new URL('../db/migrate-v48-rollback.sql', import.meta.url), 'utf8'));
  const columns = (db.pragma('table_info(email_settings)') as { name: string }[]).map(
    (c) => c.name
  );
  assert.equal(columns.includes('auth_type'), false);
  assert.equal(columns.includes('google_account'), false);
  assert.equal(
    (db.prepare('SELECT host FROM email_settings').get() as { host: string }).host,
    'smtp.gmail.com'
  );
});

test('v49 them bang sao luu Drive voi gia tri mac dinh an toan, va quay lui duoc', () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db, 48);
  migrate(db);

  const settings = db
    .prepare(
      'SELECT enabled, interval_hours, keep_db_count, google_account, next_run_at FROM drive_backup_settings'
    )
    .get();
  assert.deepEqual(settings, {
    enabled: 0,
    interval_hours: 24,
    keep_db_count: 14,
    google_account: '',
    next_run_at: null,
  });
  assert.throws(() => db.prepare('UPDATE drive_backup_settings SET keep_db_count = 0').run());
  assert.throws(() => db.prepare('UPDATE drive_backup_settings SET interval_hours = 721').run());
  assert.throws(() => db.prepare(`INSERT INTO drive_backup_settings (id) VALUES (2)`).run());

  db.exec(fs.readFileSync(new URL('../db/migrate-v49-rollback.sql', import.meta.url), 'utf8'));
  const tables = (
    db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as { name: string }[]
  ).map((t) => t.name);
  assert.equal(tables.includes('drive_backup_settings'), false);
  assert.equal(tables.includes('drive_backup_files'), false);
  assert.ok(tables.includes('email_settings'), 'bang cua dot truoc con nguyen');
});

test('v50 chuan hoa ten to chuc da co ve dang Viet Hoa Chu Dau', () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db, 49);
  const insert = db.prepare(`INSERT INTO customers (name, org_kind) VALUES (?, 'customer')`);
  insert.run('CÔNG TY CỔ PHẦN TẬP ĐOÀN GOLDEN GATE');
  insert.run('Ngân hàng TMCP Ngoại thương Việt Nam');
  insert.run('HUD Holdings');
  migrate(db);

  const names = (
    db.prepare('SELECT name FROM customers ORDER BY id').all() as { name: string }[]
  ).map((row) => row.name);
  assert.deepEqual(names, [
    'Công Ty Cổ Phần Tập Đoàn Golden Gate',
    'Ngân Hàng TMCP Ngoại Thương Việt Nam',
    'HUD Holdings',
  ]);
  assert.equal(db.pragma('user_version', { simple: true }), 50);

  db.exec(fs.readFileSync(new URL('../db/migrate-v50-rollback.sql', import.meta.url), 'utf8'));
  const restored = (
    db.prepare('SELECT name FROM customers ORDER BY id').all() as { name: string }[]
  ).map((row) => row.name);
  assert.deepEqual(restored, [
    'CÔNG TY CỔ PHẦN TẬP ĐOÀN GOLDEN GATE',
    'Ngân hàng TMCP Ngoại thương Việt Nam',
    'HUD Holdings',
  ]);
});
