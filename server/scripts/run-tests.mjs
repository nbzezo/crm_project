import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(serverRoot, 'src');

function collectTests(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectTests(fullPath));
    else if (entry.name.endsWith('.test.ts')) files.push(fullPath);
  }
  return files;
}

const tests = collectTests(sourceRoot).sort();
if (tests.length === 0) {
  console.error('Khong tim thay tep test nao.');
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...tests], {
  cwd: serverRoot,
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
