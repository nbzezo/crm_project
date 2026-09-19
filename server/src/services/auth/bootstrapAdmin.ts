import { db } from '../../db/connection.ts';
import { countUsers, createUser, findUserByUsername } from './users.ts';

/*
 * Tao tai khoan dang nhap dau tien tu bien moi truong khi bang `users` con rong.
 *
 * Chi chay MOT LAN trong doi CSDL: sau khi da co nguoi dung, doi mat khau qua
 * PATCH /api/auth/password hoac `npm run auth:reset-password` — khong doc lai env
 * nua, nen redeploy khong lam mat mat khau da doi.
 *
 * Thieu env ma bang con rong => tu choi khoi dong. Tha khong chay con hon chay
 * mot API CRM khong co xac thuc tren internet cong khai.
 *
 * v38: nhan them WORKFLOW_ADMIN_EMAIL. Khong bat buoc — nhung thieu email thi
 * tai khoan dau tien khong tu lay lai mat khau duoc va phai dung duong dong
 * lenh, nen canh bao ro khi vang.
 *
 * v39: gan luon vi tri Quan tri he thong. Migration cung lam viec nay, nhung
 * chi cho CSDL DA CO nguoi dung — voi mot CSDL moi tinh thi migrate chay khi
 * bang users con rong, roi ham nay moi tao tai khoan. Thieu doan duoi day,
 * tai khoan dau tien se ton tai ma khong co mot quyen nao: dang nhap duoc
 * nhung khong lam duoc gi, ke ca tu cap quyen cho chinh minh.
 */
/**
 * Gan vi tri Quan tri he thong cho tai khoan dau tien.
 *
 * `INSERT OR IGNORE`: neu migration da gan roi thi khong ghi de gi ca.
 */
function grantSystemAdmin(userId: number): void {
  const position = db.prepare(`SELECT id FROM positions WHERE code = 'system_admin'`).get() as
    { id: number } | undefined;
  if (!position) return;
  db.prepare(
    `INSERT OR IGNORE INTO user_positions (user_id, position_id, is_primary) VALUES (?, ?, 1)`
  ).run(userId, position.id);
}

export async function ensureAdminUser(): Promise<void> {
  if (countUsers() > 0) return;

  const username = process.env.WORKFLOW_ADMIN_USER?.trim();
  const password = process.env.WORKFLOW_ADMIN_PASSWORD;
  const email = process.env.WORKFLOW_ADMIN_EMAIL?.trim() || null;

  if (!username || !password) {
    console.error(
      '[auth] Chua co tai khoan dang nhap nao. Dat WORKFLOW_ADMIN_USER va ' +
        'WORKFLOW_ADMIN_PASSWORD (mat khau it nhat 8 ky tu) roi khoi dong lai.'
    );
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('[auth] WORKFLOW_ADMIN_PASSWORD phai dai it nhat 8 ky tu.');
    process.exit(1);
  }

  // Chong dua: neu mot tien trinh khac vua tao, bo qua.
  if (findUserByUsername(username)) return;

  const userId = await createUser({ username, email, password });
  grantSystemAdmin(userId);
  console.log(
    `[auth] Da tao tai khoan dang nhap dau tien: ${email ?? username}` +
      (email
        ? ''
        : ' (chua co email — dat WORKFLOW_ADMIN_EMAIL de dung duoc chuc nang quen mat khau)')
  );
}
