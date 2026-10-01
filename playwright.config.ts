import os from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const e2eData = path.join(os.tmpdir(), 'workflow-clone-trello-e2e');
const storageState = path.join(e2eData, 'storage-state.json');
const apiPort = Number(process.env.E2E_API_PORT ?? 3101);
const webPort = Number(process.env.E2E_WEB_PORT ?? 5174);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  reporter: [['list']],
  outputDir: '.playwright/test-results',
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'npm run start:dev -w server',
      url: `http://127.0.0.1:${apiPort}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        PORT: String(apiPort),
        WORKFLOW_DATA_DIR: e2eData,
        WORKFLOW_DB_PATH: path.join(e2eData, 'app.db'),
        WORKFLOW_SESSION_SECRET: 'e2e-session-secret-value-at-least-32-characters',
        WORKFLOW_ADMIN_USER: 'e2e',
        WORKFLOW_ADMIN_EMAIL: 'e2e@workflow.test',
        WORKFLOW_ADMIN_PASSWORD: 'e2e-password-123',
      },
    },
    {
      command: `npm run preview -w client -- --host 127.0.0.1 --port ${webPort}`,
      url: `http://127.0.0.1:${webPort}`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        VITE_API_PROXY_TARGET: `http://127.0.0.1:${apiPort}`,
      },
    },
  ],
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], storageState },
      dependencies: ['setup'],
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'], storageState },
      dependencies: ['setup'],
    },
  ],
});
