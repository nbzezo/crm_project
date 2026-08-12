import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const root = path.resolve(import.meta.dirname, '..');
const manifestPath = path.join(root, 'dist', '.vite', 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const entry = Object.values(manifest).find((item) => item.isEntry);
if (!entry) throw new Error('Khong tim thay entry chunk trong Vite manifest');

const files = new Set();
function collect(item) {
  if (!item || files.has(item.file)) return;
  files.add(item.file);
  for (const key of item.imports ?? []) collect(manifest[key]);
}
collect(entry);

const gzipBytes = [...files].reduce((sum, file) => {
  const content = fs.readFileSync(path.join(root, 'dist', file));
  return sum + gzipSync(content).byteLength;
}, 0);
const budgetBytes = 260 * 1024;
const actualKiB = (gzipBytes / 1024).toFixed(1);
if (gzipBytes > budgetBytes) {
  throw new Error(`Initial JS ${actualKiB} KiB vuot ngan sach 260 KiB gzip`);
}
console.log(`[bundle] Initial JS ${actualKiB} KiB gzip / 260 KiB`);
