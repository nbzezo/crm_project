import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const sourceRoot = path.resolve('client/src');
const allowedPaletteFile = path.join('theme', 'palettes.ts');
const findings = [];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(target)));
    else if (/\.(?:css|ts|tsx)$/.test(entry.name)) files.push(target);
  }
  return files;
}

for (const file of await walk(sourceRoot)) {
  const relative = path.relative(sourceRoot, file);
  const lines = (await readFile(file, 'utf8')).split(/\r?\n/);
  lines.forEach((line, index) => {
    if (/rounded-\[3px\]/.test(line)) {
      findings.push(`${relative}:${index + 1} dùng rounded-[3px]; hãy dùng rounded-compact.`);
    }
    if (/(?:bg|text|border)-\[#[0-9a-f]{3,8}\]/i.test(line)) {
      findings.push(
        `${relative}:${index + 1} chứa màu Tailwind hard-code; hãy tạo semantic token.`
      );
    }
    if (relative !== allowedPaletteFile && /const\s+LABEL_(?:COLORS|PALETTE)/.test(line)) {
      findings.push(
        `${relative}:${index + 1} khai báo bảng màu nhãn riêng; hãy dùng theme/palettes.`
      );
    }
  });
}

if (findings.length > 0) {
  console.error(`UI system guard phát hiện ${findings.length} vấn đề:\n${findings.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('UI system guard: OK');
}
