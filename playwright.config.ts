import os from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const e2eData = path.join(os.tmpdir(), 'workflow-clone-trello-e2e');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  reporter: [['list']],
  outputDir: '.playwright/test-results',
  use: {
    baseURL: 'http://127.0.0.1:5174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'npm run start:dev -w server',
      url: 'http://127.0.0.1:3101/api/health',
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        PORT: '3101',
        WORKFLOW_DATA_DIR: e2eData,
        WORKFLOW_DB_PATH: path.join(e2eData, 'app.db'),
      },
    },
    {
      command: 'npm run preview -w client -- --host 127.0.0.1 --port 5174',
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        VITE_API_PROXY_TARGET: 'http://127.0.0.1:3101',
      },
    },
  ],
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
});
