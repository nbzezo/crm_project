/*
 * Doi mat khau dang nhap tu dong lenh — dung khi bi khoa ngoai ma khong muon
 * redeploy hay cham vao Docker image.
 *
 * Chay:  npm run auth:reset-password --workspace server -- "<mat-khau-moi>" [ten-dang-nhap]
 *
 * Bo qua mat khau hien tai (khac PATCH /api/auth/password) vi day la duong khoi
 * phuc chay trực tiếp tren may chu. Xoa sach phien dang hoat dong.
 */
import { pathToFileURL } from 'node:url';
import { db, closeDatabase } from './connection.ts';
import { countUsers, findUserByUsername, setPassword } from '../services/auth/users.ts';

async function main(): Promise<void> {
  const newPassword = process.argv[2];
  const username = process.argv[3];

  if (!newPassword || newPassword.length < 8) {
    console.error(
      'Dung: npm run auth:reset-password --workspace server -- "<mat-khau-moi>" [ten-dang-nhap]\n' +
        '(mat khau moi phai dai it nhat 8 ky tu)'
    );
    process.exit(1);
  }

  const total = countUsers();
  if (total === 0) {
    console.error(
      '[auth] Chua co tai khoan nao. Dat WORKFLOW_ADMIN_USER/PASSWORD roi khoi dong server.'
    );
    process.exit(1);
  }

  let userId: number;
  let name: string;
  if (username) {
    const user = findUserByUsername(username);
    if (!user) {
      console.error(`[auth] Khong tim thay tai khoan "${username}".`);
      process.exit(1);
    }
    userId = user.id;
    name = user.username;
  } else if (total === 1) {
    const only = db.prepare('SELECT id, username FROM users LIMIT 1').get() as {
      id: number;
      username: string;
    };
    userId = only.id;
    name = only.username;
  } else {
    console.error('[auth] Co nhieu tai khoan — chi ro ten dang nhap o tham so thu hai.');
    process.exit(1);
  }

  await setPassword(userId, newPassword);
  db.prepare('DELETE FROM sessions').run();
  console.log(`[auth] Da doi mat khau cho "${name}" va dang xuat moi phien.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then(() => {
      closeDatabase();
      process.exit(0);
    })
    .catch((error: unknown) => {
      console.error(
        '[auth] Doi mat khau that bai:',
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    });
}
