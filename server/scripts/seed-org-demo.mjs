/*
 * Dung mot co cau to chuc mau de thu phan cap quan ly.
 *
 * Chi dung de CHAY THU o may local — khong phai mot phan cua san pham. Script
 * tao cay don vi, nguoi, tai khoan va chia lai chu so huu du lieu mau sao cho
 * moi vi tri nhin thay mot tap khac nhau.
 *
 *   Cong ty
 *   └─ Trung tam Kinh doanh          (Giam doc Trung tam: Le Trung Tam)
 *      ├─ Khoi Doanh nghiep          (Giam doc Khoi: Pham Khoi)
 *      │  ├─ Phong Kinh doanh 1      (Truong phong: Tran Truong Phong · Nhan vien: Nguyen Nhan Vien)
 *      │  └─ Phong Kinh doanh 2      (Nhan vien: Hoang Nhan Vien Hai)
 *      └─ Khoi Van hanh              (Admin doanh thu: Vu Ke Toan)
 *
 * Moi tai khoan dung chung mat khau: demo-1234
 */
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const here = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(here, '..', 'data', 'app.db');
const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

const PASSWORD = 'demo-1234';

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return { hash: derived.toString('base64'), salt: salt.toString('base64') };
}

const ownOrg = db
  .prepare(`SELECT id FROM customers WHERE org_kind = 'own' ORDER BY id LIMIT 1`)
  .get();
if (!ownOrg) throw new Error('Chua co to chuc noi bo — chay `npm run seed -w server` truoc.');

const rootUnit = db
  .prepare(`SELECT id FROM org_units WHERE parent_id IS NULL ORDER BY id LIMIT 1`)
  .get();

function kindId(name) {
  return db.prepare(`SELECT id FROM org_unit_kinds WHERE name = ?`).get(name)?.id ?? null;
}

function upsertUnit(name, parentId, kindName) {
  const existing = db.prepare(`SELECT id FROM org_units WHERE name = ?`).get(name);
  if (existing) return existing.id;
  return Number(
    db
      .prepare(`INSERT INTO org_units (name, parent_id, kind_id, position) VALUES (?, ?, ?, 1024)`)
      .run(name, parentId, kindId(kindName)).lastInsertRowid
  );
}

function upsertPerson(fullName, title, unitId, positionCode, email) {
  let contact = db.prepare(`SELECT id FROM contacts WHERE full_name = ?`).get(fullName);
  const contactId = contact
    ? contact.id
    : Number(
        db
          .prepare(
            `INSERT INTO contacts (customer_id, full_name, title, email, org_unit_id, is_active)
             VALUES (?, ?, ?, ?, ?, 1)`
          )
          .run(ownOrg.id, fullName, title, email, unitId).lastInsertRowid
      );
  db.prepare(`UPDATE contacts SET org_unit_id = ?, title = ? WHERE id = ?`).run(
    unitId,
    title,
    contactId
  );

  const { hash, salt } = hashPassword(PASSWORD);
  let user = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email);
  const userId = user
    ? user.id
    : Number(
        db
          .prepare(
            `INSERT INTO users (username, password_hash, password_salt, email, full_name, contact_id)
             VALUES (?, ?, ?, ?, ?, ?)`
          )
          .run(email.split('@')[0], hash, salt, email, fullName, contactId).lastInsertRowid
      );
  db.prepare(
    `UPDATE users SET password_hash = ?, password_salt = ?, contact_id = ? WHERE id = ?`
  ).run(hash, salt, contactId, userId);

  const positionId = db.prepare(`SELECT id FROM positions WHERE code = ?`).get(positionCode).id;
  db.prepare(`DELETE FROM user_positions WHERE user_id = ?`).run(userId);
  db.prepare(`INSERT INTO user_positions (user_id, position_id, is_primary) VALUES (?, ?, 1)`).run(
    userId,
    positionId
  );

  return { contactId, userId, email, fullName };
}

db.transaction(() => {
  const trungTam = upsertUnit('Trung tâm Kinh doanh', rootUnit.id, 'Trung tâm');
  const khoiDN = upsertUnit('Khối Doanh nghiệp', trungTam, 'Khối');
  const khoiVH = upsertUnit('Khối Vận hành', trungTam, 'Khối');
  const phong1 = upsertUnit('Phòng Kinh doanh 1', khoiDN, 'Phòng');
  const phong2 = upsertUnit('Phòng Kinh doanh 2', khoiDN, 'Phòng');

  const giamDocTT = upsertPerson(
    'Lê Trung Tâm',
    'Giám đốc Trung tâm',
    trungTam,
    'center_director',
    'trungtam@congty.vn'
  );
  const giamDocKhoi = upsertPerson(
    'Phạm Khối',
    'Giám đốc Khối',
    khoiDN,
    'division_director',
    'khoi@congty.vn'
  );
  const truongPhong = upsertPerson(
    'Trần Trưởng Phòng',
    'Trưởng phòng',
    phong1,
    'department_head',
    'truongphong@congty.vn'
  );
  const nhanVien1 = upsertPerson(
    'Nguyễn Nhân Viên',
    'Nhân viên kinh doanh',
    phong1,
    'staff',
    'nhanvien1@congty.vn'
  );
  const nhanVien2 = upsertPerson(
    'Hoàng Nhân Viên Hai',
    'Nhân viên kinh doanh',
    phong2,
    'staff',
    'nhanvien2@congty.vn'
  );
  upsertPerson('Vũ Kế Toán', 'Kế toán doanh thu', khoiVH, 'revenue_admin', 'ketoan@congty.vn');

  db.prepare(`UPDATE org_units SET head_contact_id = ? WHERE id = ?`).run(
    giamDocTT.contactId,
    trungTam
  );
  db.prepare(`UPDATE org_units SET head_contact_id = ? WHERE id = ?`).run(
    giamDocKhoi.contactId,
    khoiDN
  );
  db.prepare(`UPDATE org_units SET head_contact_id = ? WHERE id = ?`).run(
    truongPhong.contactId,
    phong1
  );

  /* Chia lai chu so huu du lieu mau cho ba nguoi khac nhau, de moi vi tri nhin
     thay mot tap khac nhau — day moi la thu lam cho viec thu nghiem co nghia. */
  const customers = db
    .prepare(`SELECT id FROM customers WHERE org_kind = 'customer' ORDER BY id`)
    .all();
  const owners = [nhanVien1.contactId, nhanVien2.contactId, truongPhong.contactId];
  customers.forEach((row, i) => {
    const owner = owners[i % owners.length];
    db.prepare(`UPDATE customers SET owner_contact_id = ? WHERE id = ?`).run(owner, row.id);
    db.prepare(`UPDATE deals SET owner_contact_id = ? WHERE customer_id = ?`).run(owner, row.id);
    db.prepare(`UPDATE customer_services SET owner_contact_id = ? WHERE customer_id = ?`).run(
      owner,
      row.id
    );
  });

  const boards = db.prepare(`SELECT id FROM boards ORDER BY id`).all();
  boards.forEach((row, i) => {
    db.prepare(`UPDATE boards SET owner_contact_id = ? WHERE id = ?`).run(
      owners[i % owners.length],
      row.id
    );
  });
})();

const summary = db
  .prepare(
    `SELECT u.email, u.full_name, p.name AS vi_tri, o.name AS don_vi
       FROM users u
       LEFT JOIN contacts c ON c.id = u.contact_id
       LEFT JOIN org_units o ON o.id = c.org_unit_id
       LEFT JOIN user_positions up ON up.user_id = u.id
       LEFT JOIN positions p ON p.id = up.position_id
      ORDER BY u.id`
  )
  .all();

console.log('\nTai khoan thu nghiem (mat khau chung: ' + PASSWORD + ')\n');
console.table(summary);

const scope = db
  .prepare(
    `SELECT c.full_name AS nguoi, COUNT(cu.id) AS so_khach_hang
       FROM contacts c LEFT JOIN customers cu ON cu.owner_contact_id = c.id
      WHERE c.org_unit_id IS NOT NULL GROUP BY c.id HAVING so_khach_hang > 0`
  )
  .all();
console.log('\nChu so huu khach hang:');
console.table(scope);

db.close();
