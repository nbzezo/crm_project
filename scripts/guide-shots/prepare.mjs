import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/*
 * Don thu muc du lieu cua bo chup anh roi nap du lieu mau.
 *
 * Chay truoc `playwright test` (xem npm script `guide:shots`), khong dat trong
 * globalSetup: thu tu giua globalSetup va webServer khong co gi bao dam, ma seed
 * phai xong truoc khi may chu mo CSDL.
 */

const parent = path.resolve(os.tmpdir());
const target = path.join(parent, 'workflow-guide-shots');
if (path.dirname(target) !== parent) {
  throw new Error(`Tu choi don thu muc ngoai pham vi temp: ${target}`);
}

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
execFileSync('npm', ['run', 'seed', '-w', 'server'], {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    WORKFLOW_DATA_DIR: target,
    WORKFLOW_DB_PATH: path.join(target, 'app.db'),
  },
});

console.log(`[guide-shots] du lieu mau da san sang: ${target}`);
