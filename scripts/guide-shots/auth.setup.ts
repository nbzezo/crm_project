import { expect, test as setup } from '@playwright/test';
import { SHOT_ADMIN, storageState } from './playwright.config';

/*
 * Dang nhap mot lan qua API roi luu cookie, giong e2e/auth.setup.ts. Tai khoan
 * do playwright.config.ts cap cho may chu qua WORKFLOW_ADMIN_* khi bang `users`
 * con rong, nen no chi ton tai trong ban chay nay.
 */
setup('dang nhap tai khoan chup anh', async ({ request }) => {
  const res = await request.post('/api/auth/login', {
    data: { username: SHOT_ADMIN.email, password: SHOT_ADMIN.password },
  });
  expect(res.ok(), 'dang nhap that bai').toBeTruthy();
  await request.storageState({ path: storageState });
});
