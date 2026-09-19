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
 * v37: nhan them WORKFLOW_ADMIN_EMAIL. Khong bat buoc — nhung thieu email thi
 * tai khoan dau tien khong tu lay lai mat khau duoc va phai dung duong dong
 * lenh, nen canh bao ro khi vang.
 */
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

  await createUser({ username, email, password });
  console.log(
    `[auth] Da tao tai khoan dang nhap dau tien: ${email ?? username}` +
      (email
        ? ''
        : ' (chua co email — dat WORKFLOW_ADMIN_EMAIL de dung duoc chuc nang quen mat khau)')
  );
}
