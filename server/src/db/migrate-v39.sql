/* ---------- v39: cay don vi, vi tri va ma tran phan quyen ----------

   Y TUONG COT LOI — doc truoc khi sua bat cu thu gi o day:

   CEO / Giam doc Trung tam / Giam doc Khoi / Truong phong KHONG phai bon loai vi
   tri khac nhau. Chung la CUNG MOT loai ("quan ly don vi") dat o DO SAU KHAC NHAU
   trong cay don vi. Ba vi tri giua duoc seed voi bo quyen y het nhau — do khong
   phai trung lap, do la bang chung mo hinh dung. Neu ma hoa cung bon cap thi
   them cap thu nam phai sua code; voi cay `parent_id` thi them mot node la xong.

   `org_units`   cay don vi, do sau tuy y. Cong ty -> Trung tam -> Khoi -> Phong -> To...
   `org_unit_kinds` chi la NHAN hien thi (`level_order` de sap xep). No KHONG
                 quyet dinh quyen — quyen den tu vi tri, pham vi den tu vi tri
                 cua nguoi trong cay. Tron hai thu nay lai se sinh ra cau hoi vo
                 nghia kieu "Khoi co nhieu quyen hon Phong khong".
   `contacts.org_unit_id` la NGUON SU THAT DUY NHAT ve cho ngoi cua mot nguoi.
                 Don vi ma mot quan ly quan ly CHINH LA don vi ho ngoi. Khong
                 nhan ban cot don vi sang `user_positions` — mot ban sao la mot
                 nguon lech, dung ly do `cards.project_id` bi xoa han o v19.
   `positions`   loai vi tri. NGUOI DUNG TU TAO DUOC. Bay dong seed chi la mau.
   `position_permissions` ma tran resource x action -> scope.
   `user_positions` ai giu vi tri nao.

   LUU THUA: khong co dong nao nghia la `none`. Nho vay them mot resource moi
   trong tuong lai thi mac dinh la CAM voi moi vi tri cu, khong phai CHO. Mot he
   phan quyen mac dinh mo la mot he phan quyen se ro ri vao dung ngay nguoi ta
   them tinh nang va quen cap nhat.

   `user_positions.scope_unit_id` de trong o gan het moi truong hop. No danh cho
   kiem nhiem: mot Giam doc Khoi tam thoi phu trach them mot Khoi khac. Cung la
   co che uy quyen khi sep nghi — khong can them mot bang "uy quyen" rieng.

   Dot nay CHUA loc du lieu: `requirePermission` chan theo tinh nang, con pham vi
   (`scope`) duoc tinh va tra ve cho client nhung chua ghep vao cac cau truy van.
   Do la viec cua v40. Trang thai trung gian nay la co y de moi dot deu chay duoc. */

/* ---------- 1. Loai don vi (chi la nhan) ---------- */

CREATE TABLE org_unit_kinds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  /* Chi de sap xep khi hien thi. Khong co rang buoc "Khoi phai nam trong Trung
     tam": co cau that te luon co ngoai le, va mot rang buoc nhu vay se chan dung
     nhung ngoai le do thay vi mo ta duoc chung. */
  level_order INTEGER NOT NULL DEFAULT 0,
  is_system INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0,1))
);

INSERT INTO org_unit_kinds (name, level_order, is_system) VALUES
  ('Công ty', 0, 1),
  ('Trung tâm', 1, 0),
  ('Khối', 2, 0),
  ('Phòng', 3, 0),
  ('Tổ', 4, 0);

/* ---------- 2. Cay don vi ---------- */

CREATE TABLE org_units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER REFERENCES org_units(id) ON DELETE RESTRICT,
  kind_id INTEGER REFERENCES org_unit_kinds(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  code TEXT,
  /* Truong don vi — chi de hien thi. Quyen cua ho den tu vi tri ho giu, khong
     tu o nay; neu khong se co hai nguon tra loi "ai quan ly don vi nay". */
  head_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  position REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_org_units_parent ON org_units(parent_id, position);

/* ON DELETE RESTRICT o parent_id: xoa mot don vi con nguyen mot cay ben duoi se
   lam ca nhanh do mat don vi trong im lang. Bat chuyen/ xoa tung buoc tu duoi len. */

INSERT INTO org_units (parent_id, kind_id, name, code, position)
VALUES (NULL, (SELECT id FROM org_unit_kinds WHERE name = 'Công ty'), 'Công ty', 'HQ', 1024);

/* ---------- 3. Cho ngoi cua tung nguoi ---------- */

ALTER TABLE contacts ADD COLUMN org_unit_id INTEGER REFERENCES org_units(id) ON DELETE SET NULL;
CREATE INDEX idx_contacts_org_unit ON contacts(org_unit_id, is_active);

/* Nhan su cong ty minh (`org_kind = 'own'`) mac dinh thuoc node goc. Nguoi lien he
   ben khach hang / doi tac KHONG co don vi: ho khong nam trong co cau to chuc cua
   ta va khong bao gio dang nhap vao he thong nay. */
UPDATE contacts
   SET org_unit_id = (SELECT id FROM org_units WHERE parent_id IS NULL ORDER BY id LIMIT 1)
 WHERE customer_id IN (SELECT id FROM customers WHERE org_kind = 'own');

/* ---------- 4. Vi tri va ma tran quyen ---------- */

CREATE TABLE positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  code TEXT UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  /* Chi dung de KHONG cho doi ten/xoa vi tri quan tri he thong — cai duy nhat
     giu duoc duong vao he thong khi ai do cau hinh nham. Moi vi tri khac, ke ca
     bay dong seed duoi day, deu sua va xoa duoc binh thuong. */
  is_system INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0,1)),
  position REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE position_permissions (
  position_id INTEGER NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('none','own','unit','subtree','all')),
  PRIMARY KEY (position_id, resource, action)
);

/* `resource`/`action` co y KHONG co CHECK liet ke gia tri: danh sach hop le nam
   o packages/contracts/src/permissions.ts va se dai them theo tinh nang. Mot CHECK
   o day nghia la moi lan them mot resource phai co mot migration — dung thu ma
   "cau hinh dong" dang co gang tranh. Route validate theo danh muc truoc khi ghi. */

CREATE TABLE user_positions (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  position_id INTEGER NOT NULL REFERENCES positions(id) ON DELETE RESTRICT,
  /* NULL = dung don vi cua chinh nguoi do (contacts.org_unit_id). Chi dien khi
     kiem nhiem mot don vi khac. */
  scope_unit_id INTEGER REFERENCES org_units(id) ON DELETE CASCADE,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
  PRIMARY KEY (user_id, position_id)
);
CREATE INDEX idx_user_positions_position ON user_positions(position_id);

/* ON DELETE RESTRICT o position_id: xoa mot vi tri dang co nguoi giu se am tham
   tuoc het quyen cua ho. Bat chuyen nguoi sang vi tri khac truoc. */

/* ---------- 5. Bay vi tri mau ---------- */

INSERT INTO positions (name, code, description, is_system, position) VALUES
  ('Tổng giám đốc', 'ceo', 'Xem toàn bộ dữ liệu công ty, sửa bản ghi của mình.', 0, 1024),
  ('Giám đốc Trung tâm', 'center_director', 'Xem toàn bộ cây đơn vị mình phụ trách.', 0, 2048),
  ('Giám đốc Khối', 'division_director', 'Xem toàn bộ cây đơn vị mình phụ trách.', 0, 3072),
  ('Trưởng phòng', 'department_head', 'Xem toàn bộ cây đơn vị mình phụ trách.', 0, 4096),
  ('Nhân viên', 'staff', 'Chỉ dữ liệu của chính mình.', 0, 5120),
  ('Admin doanh thu & công nợ', 'revenue_admin',
   'Toàn quyền doanh thu và hợp đồng toàn công ty, không thấy pipeline.', 0, 6144),
  ('Quản trị hệ thống', 'system_admin', 'Toàn quyền, kể cả quản trị người dùng và phân quyền.', 1, 7168);

/* -- Quan tri he thong: tat ca o muc `all`. Duoc sinh tu chinh danh muc resource
      de khong bao gio sot mot resource nao. Viet tay se la mot danh sach phai nho
      cap nhat moi lan them tinh nang. -- */
INSERT INTO position_permissions (position_id, resource, action, scope)
SELECT (SELECT id FROM positions WHERE code = 'system_admin'), r.resource, a.action, 'all'
  FROM (
    SELECT 'customers' AS resource UNION ALL SELECT 'contacts' UNION ALL SELECT 'deals'
    UNION ALL SELECT 'contracts' UNION ALL SELECT 'quotations' UNION ALL SELECT 'revenues'
    UNION ALL SELECT 'services' UNION ALL SELECT 'projects' UNION ALL SELECT 'boards'
    UNION ALL SELECT 'tasks' UNION ALL SELECT 'documents' UNION ALL SELECT 'notes'
    UNION ALL SELECT 'interactions' UNION ALL SELECT 'report.sales'
    UNION ALL SELECT 'report.revenue' UNION ALL SELECT 'report.tasks'
    UNION ALL SELECT 'report.projects' UNION ALL SELECT 'admin.users'
    UNION ALL SELECT 'admin.org' UNION ALL SELECT 'admin.positions'
    UNION ALL SELECT 'settings.app' UNION ALL SELECT 'settings.ai'
    UNION ALL SELECT 'settings.email' UNION ALL SELECT 'settings.telegram'
    UNION ALL SELECT 'data.export' UNION ALL SELECT 'ai'
  ) r
  CROSS JOIN (
    SELECT 'read' AS action UNION ALL SELECT 'create' UNION ALL SELECT 'update'
    UNION ALL SELECT 'delete' UNION ALL SELECT 'export'
  ) a;

/* -- Quan ly don vi: DOC ca cay, GHI cua minh. Ba vi tri dung chung dinh nghia
      nay; khac nhau duy nhat o cho ho ngoi trong cay. -- */
INSERT INTO position_permissions (position_id, resource, action, scope)
SELECT p.id, r.resource, a.action,
       CASE WHEN a.action IN ('read', 'export') THEN 'subtree' ELSE 'own' END
  FROM positions p
  CROSS JOIN (
    SELECT 'customers' AS resource UNION ALL SELECT 'contacts' UNION ALL SELECT 'deals'
    UNION ALL SELECT 'contracts' UNION ALL SELECT 'quotations' UNION ALL SELECT 'revenues'
    UNION ALL SELECT 'services' UNION ALL SELECT 'projects' UNION ALL SELECT 'boards'
    UNION ALL SELECT 'tasks' UNION ALL SELECT 'documents' UNION ALL SELECT 'notes'
    UNION ALL SELECT 'interactions' UNION ALL SELECT 'report.sales'
    UNION ALL SELECT 'report.revenue' UNION ALL SELECT 'report.tasks'
    UNION ALL SELECT 'report.projects' UNION ALL SELECT 'ai'
  ) r
  CROSS JOIN (
    SELECT 'read' AS action UNION ALL SELECT 'create' UNION ALL SELECT 'update'
    UNION ALL SELECT 'delete' UNION ALL SELECT 'export'
  ) a
 WHERE p.code IN ('center_director', 'division_director', 'department_head')
   AND (a.action IN ('read', 'export') OR r.resource NOT LIKE 'report.%');

/* -- Tong giam doc: giong quan ly don vi nhung doc `all`, va xem duoc so do to chuc. -- */
INSERT INTO position_permissions (position_id, resource, action, scope)
SELECT p.id, r.resource, a.action,
       CASE WHEN a.action IN ('read', 'export') THEN 'all' ELSE 'own' END
  FROM positions p
  CROSS JOIN (
    SELECT 'customers' AS resource UNION ALL SELECT 'contacts' UNION ALL SELECT 'deals'
    UNION ALL SELECT 'contracts' UNION ALL SELECT 'quotations' UNION ALL SELECT 'revenues'
    UNION ALL SELECT 'services' UNION ALL SELECT 'projects' UNION ALL SELECT 'boards'
    UNION ALL SELECT 'tasks' UNION ALL SELECT 'documents' UNION ALL SELECT 'notes'
    UNION ALL SELECT 'interactions' UNION ALL SELECT 'report.sales'
    UNION ALL SELECT 'report.revenue' UNION ALL SELECT 'report.tasks'
    UNION ALL SELECT 'report.projects' UNION ALL SELECT 'ai'
  ) r
  CROSS JOIN (
    SELECT 'read' AS action UNION ALL SELECT 'create' UNION ALL SELECT 'update'
    UNION ALL SELECT 'delete' UNION ALL SELECT 'export'
  ) a
 WHERE p.code = 'ceo'
   AND (a.action IN ('read', 'export') OR r.resource NOT LIKE 'report.%');

INSERT INTO position_permissions (position_id, resource, action, scope)
VALUES ((SELECT id FROM positions WHERE code = 'ceo'), 'admin.org', 'read', 'all');

/* -- Nhan vien: chi du lieu cua chinh minh. -- */
INSERT INTO position_permissions (position_id, resource, action, scope)
SELECT p.id, r.resource, a.action, 'own'
  FROM positions p
  CROSS JOIN (
    SELECT 'customers' AS resource UNION ALL SELECT 'contacts' UNION ALL SELECT 'deals'
    UNION ALL SELECT 'contracts' UNION ALL SELECT 'quotations' UNION ALL SELECT 'revenues'
    UNION ALL SELECT 'services' UNION ALL SELECT 'projects' UNION ALL SELECT 'boards'
    UNION ALL SELECT 'tasks' UNION ALL SELECT 'documents' UNION ALL SELECT 'notes'
    UNION ALL SELECT 'interactions' UNION ALL SELECT 'report.tasks' UNION ALL SELECT 'ai'
  ) r
  CROSS JOIN (
    SELECT 'read' AS action UNION ALL SELECT 'create' UNION ALL SELECT 'update'
    UNION ALL SELECT 'delete' UNION ALL SELECT 'export'
  ) a
 WHERE p.code = 'staff'
   AND (a.action IN ('read', 'export') OR r.resource NOT LIKE 'report.%');

/* -- Admin doanh thu & cong no: toan quyen tien bac toan cong ty, KHONG thay
      pipeline. Day la vi tri chung minh mo hinh khong chi la "nhieu hay it
      quyen" theo mot truc: ho rong hon Truong phong o doanh thu va hep hon o
      co hoi ban hang. -- */
INSERT INTO position_permissions (position_id, resource, action, scope)
SELECT p.id, r.resource, a.action, 'all'
  FROM positions p
  CROSS JOIN (
    SELECT 'revenues' AS resource UNION ALL SELECT 'services'
    UNION ALL SELECT 'contracts' UNION ALL SELECT 'ar'
  ) r
  CROSS JOIN (
    SELECT 'read' AS action UNION ALL SELECT 'create' UNION ALL SELECT 'update'
    UNION ALL SELECT 'delete' UNION ALL SELECT 'export'
  ) a
 WHERE p.code = 'revenue_admin';

INSERT INTO position_permissions (position_id, resource, action, scope)
SELECT (SELECT id FROM positions WHERE code = 'revenue_admin'), r.resource, r.action, 'all'
  FROM (
    SELECT 'customers' AS resource, 'read' AS action
    UNION ALL SELECT 'contacts', 'read'
    UNION ALL SELECT 'report.revenue', 'read'
    UNION ALL SELECT 'report.revenue', 'export'
    UNION ALL SELECT 'data.export', 'export'
  ) r;

/* ---------- 6. Tai khoan dau tien thanh Quan tri he thong ---------- */

/* KHONG dung `SELECT MIN(id) FROM users`: mot truy van gop khong co GROUP BY
   luon tra ve DUNG MOT DONG, va tren bang rong dong do mang NULL — chen thang
   vao day se vi pham NOT NULL. Loc bang WHERE de bang rong thi khong co dong nao.

   CSDL moi tinh dung la truong hop do: `ensureAdminUser()` chay SAU migrate.
   Viec gan vi tri cho tai khoan dau tien vi vay nam o ca hai cho — o day cho CSDL
   da co nguoi dung, va trong bootstrapAdmin.ts cho CSDL vua tao. */
INSERT INTO user_positions (user_id, position_id, is_primary)
SELECT u.id, (SELECT id FROM positions WHERE code = 'system_admin'), 1
  FROM users u
 WHERE u.id = (SELECT MIN(id) FROM users);

/* ---------- 7. Nhat ky doi quyen ----------

   `entity_change_log` da la nhat ky da hinh; chi can mo rong CHECK cua cot
   entity_type. "Ai cho phong Kinh doanh xem duoc doanh thu toan cong ty, luc
   nao" la cau hoi chac chan se co nguoi hoi. */

/* Bo ba trigger don nhat ky cua v29 TRUOC khi thay bang. Chung nam tren deals /
   projects / contracts chu khong tren entity_change_log, nen DROP TABLE khong dong
   chung; nhung `ALTER TABLE ... RENAME TO` se tu choi chay khi trong schema con
   mot trigger tro toi mot bang vua bien mat. Tao lai nguyen van o cuoi muc nay. */
DROP TRIGGER IF EXISTS trg_entity_change_log_deal;
DROP TRIGGER IF EXISTS trg_entity_change_log_project;
DROP TRIGGER IF EXISTS trg_entity_change_log_contract;

CREATE TABLE entity_change_log_v39 (
  id INTEGER PRIMARY KEY,
  entity_type TEXT NOT NULL
    CHECK (entity_type IN ('deal', 'project', 'contract', 'position', 'user_position', 'org_unit')),
  entity_id INTEGER NOT NULL,
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  note TEXT,
  actor_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  changed_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
INSERT INTO entity_change_log_v39 (id, entity_type, entity_id, field, old_value, new_value, note, actor_contact_id, changed_at)
SELECT id, entity_type, entity_id, field, old_value, new_value, note, actor_contact_id, changed_at
  FROM entity_change_log;
DROP TABLE entity_change_log;
ALTER TABLE entity_change_log_v39 RENAME TO entity_change_log;
CREATE INDEX idx_entity_change_log ON entity_change_log(entity_type, entity_id, changed_at DESC);

CREATE TRIGGER trg_entity_change_log_deal AFTER DELETE ON deals BEGIN
  DELETE FROM entity_change_log WHERE entity_type = 'deal' AND entity_id = OLD.id;
END;
CREATE TRIGGER trg_entity_change_log_project AFTER DELETE ON projects BEGIN
  DELETE FROM entity_change_log WHERE entity_type = 'project' AND entity_id = OLD.id;
END;
CREATE TRIGGER trg_entity_change_log_contract AFTER DELETE ON contracts BEGIN
  DELETE FROM entity_change_log WHERE entity_type = 'contract' AND entity_id = OLD.id;
END;

/* ---------- 8. Moc phien ban quyen ----------

   Client giu menu va ma tran quyen trong bo nho. Khi quan tri doi mot o, cac tab
   dang mo cua nguoi khac khong co cach nao biet. So nay tang moi lan ghi; /me tra
   ve kem, client so lech thi tu nap lai. Re hon nhieu so voi polling ca ma tran. */
INSERT INTO app_settings (key, value) VALUES ('permissions.version', '1');
