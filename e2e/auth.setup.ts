import os from 'node:os';
import path from 'node:path';
import { expect, test as setup } from '@playwright/test';

/*
 * Tu v35 moi route deu doi dang nhap. Project "setup" nay chay truoc, dang nhap
 * mot lan qua API roi luu cookie vao storageState de ca `page` lan `request`
 * trong app.spec.ts dung lai — khong phai dang nhap trong tung test.
 *
 * Tai khoan e2e do playwright.config.ts cap qua WORKFLOW_ADMIN_USER/EMAIL/PASSWORD
 * khi khoi dong server test. Dang nhap bang EMAIL de E2E di dung duong ma nguoi
 * dung that di tu v38 — dang nhap bang username van chay nhung la duong di san.
 */
export const authFile = path.join(os.tmpdir(), 'workflow-clone-trello-e2e', 'storage-state.json');

setup('dang nhap tai khoan e2e', async ({ request }) => {
  const res = await request.post('/api/auth/login', {
    data: { username: 'e2e@workflow.test', password: 'e2e-password-123' },
  });
  expect(res.ok(), 'dang nhap e2e that bai').toBeTruthy();
  await request.storageState({ path: authFile });
});
