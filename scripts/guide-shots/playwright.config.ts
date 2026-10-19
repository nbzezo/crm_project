import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

/*
 * Bo chup anh cho tai lieu huong dan (`npm run guide:shots`).
 *
 * Dung lai dung khuon cua playwright.config.ts o goc: mot thu muc du lieu rieng
 * trong temp, tai khoan admin cap qua bien moi truong, dang nhap mot lan qua API
 * roi luu cookie. Nho vay anh chup KHONG BAO GIO chua du lieu khach hang that
 * cua may dev — moi thu tren anh den tu `npm run seed`.
 *
 * Khong gop vao playwright.config.ts cua e2e: day khong phai kiem thu (khong
 * khang dinh gi, va no GHI file vao client/public), nen `npm run check` khong
 * duoc phep chay no.
 *
 * Don thu muc + seed nam o prepare.mjs chay TRUOC `playwright test`, giong e2e:
 * thu tu giua globalSetup va webServer khong co gi bao dam, ma seed thi phai
 * xong truoc khi may chu mo CSDL.
 */

export const SHOT_DATA_DIR = path.join(os.tmpdir(), 'workflow-guide-shots');
export const storageState = path.join(SHOT_DATA_DIR, 'storage-state.json');
export const SHOT_ADMIN = { email: 'huongdan@workflow.test', password: 'huong-dan-123' };

const here = path.dirname(fileURLToPath(import.meta.url));
const apiPort = Number(process.env.SHOTS_API_PORT ?? 3102);
const webPort = Number(process.env.SHOTS_WEB_PORT ?? 5175);

export default defineConfig({
  testDir: here,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: [['list']],
  outputDir: path.join(SHOT_DATA_DIR, 'test-results'),
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    /* 1280x800, deviceScaleFactor 1: chu du net de doc ma file chi tam 100 KB.
       Man rong hon chi lam chu nho hon khi anh bi co lai trong bai viet. */
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'shots',
      testMatch: /capture\.spec\.ts/,
      use: { storageState },
      dependencies: ['setup'],
    },
  ],
  webServer: [
    {
      command: 'npm run start:dev -w server',
      url: `http://127.0.0.1:${apiPort}/api/health`,
      reuseExistingServer: false,
      timeout: 180_000,
      cwd: path.resolve(here, '../..'),
      env: {
        PORT: String(apiPort),
        WORKFLOW_DATA_DIR: SHOT_DATA_DIR,
        WORKFLOW_DB_PATH: path.join(SHOT_DATA_DIR, 'app.db'),
        WORKFLOW_SESSION_SECRET: 'guide-shots-session-secret-at-least-32-chars',
        WORKFLOW_ADMIN_USER: 'huongdan',
        WORKFLOW_ADMIN_EMAIL: SHOT_ADMIN.email,
        WORKFLOW_ADMIN_PASSWORD: SHOT_ADMIN.password,
      },
    },
    {
      command: `npm run dev -w client -- --host 127.0.0.1 --port ${webPort} --strictPort`,
      url: `http://127.0.0.1:${webPort}`,
      reuseExistingServer: false,
      timeout: 180_000,
      cwd: path.resolve(here, '../..'),
      env: { VITE_API_PROXY_TARGET: `http://127.0.0.1:${apiPort}` },
    },
  ],
});
