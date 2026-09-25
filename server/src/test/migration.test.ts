import test from 'node:test';
import assert from 'node:assert/strict';
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
        `Khach hang fixture v${sourceVersion}`
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
