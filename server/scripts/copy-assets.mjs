import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(serverRoot, 'src', 'db');
const targetDir = path.join(serverRoot, 'dist', 'db');

fs.mkdirSync(targetDir, { recursive: true });
for (const name of fs.readdirSync(sourceDir)) {
  if (name.endsWith('.sql'))
    fs.copyFileSync(path.join(sourceDir, name), path.join(targetDir, name));
}
