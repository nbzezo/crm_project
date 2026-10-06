/**
 * Chan tai pham (v64): ma nguon may chu khong duoc goi ten giai doan co hoi.
 *
 * Tu 1.25.1 giai doan la du lieu cau hinh — quan tri vien them, doi ten, an giai
 * doan ma khong sua ma. Mot `stage = 'won'` hay `target === 'negotiating'` moi viet
 * them se dung voi pipeline mac dinh va sai im lang voi pipeline cua khach hang
 * khac. Hoi thuoc tinh thay vi ten: `stage_category`, `gate_bant_min`,
 * `require_economic_buyer`, `track_poc` (xem lib/pipeline.ts).
 *
 * Migration, du lieu mau va test duoc phep — chung mo ta du lieu, khong mo ta luat.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STAGE_KEYS = 'lead|approaching|discussing|poc|quoted|negotiating|won|lost';
const RULES: { name: string; pattern: RegExp }[] = [
  {
    name: 'SQL so sanh deals.stage voi ten giai doan',
    pattern: new RegExp(`\\bstage\\s*(?:=|!=|<>|NOT\\s+IN|IN)\\s*\\(?\\s*'(?:${STAGE_KEYS})'`, 'i'),
  },
  {
    name: 'TS so sanh bien giai doan voi ten giai doan',
    pattern: new RegExp(`\\b\\w*[sS]tage\\s*[!=]==\\s*'(?:${STAGE_KEYS})'`),
  },
];

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'db' || entry.name === 'test') continue;
      files.push(...walk(full));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      files.push(full);
    }
  }
  return files;
}

test('ma may chu khong goi ten giai doan co hoi', () => {
  const offenders: string[] = [];
  for (const file of walk(root)) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) return;
      for (const rule of RULES) {
        if (rule.pattern.test(line))
          offenders.push(`${path.relative(root, file)}:${index + 1} (${rule.name}): ${trimmed}`);
      }
    });
  }
  assert.deepEqual(offenders, [], offenders.join('\n'));
});
