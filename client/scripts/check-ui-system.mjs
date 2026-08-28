import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const sourceRoot = path.resolve('client/src');
const allowedPaletteFile = path.join('theme', 'palettes.ts');
const findings = [];

/**
 * Cac file duoc phep giu ma mau nguyen ban.
 *
 * Day la bang mau nghiep vu (trang thai hop dong, giai doan ban hang, giay ghi
 * chu, anh nen bang) hoac o chon mau cho nguoi dung — chung khong doi theo
 * theme nen khong the la token. Moi file KHAC phai lay mau tu token.
 *
 * Truoc day guard chi doc class Tailwind dang `bg-[#…]`, nen hang so mau trong
 * file .ts di lot hoan toan: `CHART_INK` giu ba ma hex sang mau cho toan bo
 * bieu do o ca sau theme, va o che do toi nhan truc chi dat 4,24:1 — duoi
 * nguong AA. Danh sach duoi day bien ranh gioi do thanh mot quyet dinh tuong
 * minh thay vi mot ke ho.
 */
const HEX_ALLOWED_FILES = new Set(
  [
    ['theme', 'palettes.ts'],
    ['components', 'quickNotes', 'palette.ts'],
    ['components', 'layout', 'ThemeToggle.tsx'],
    ['components', 'calendar', 'calendarModel.ts'],
    ['components', 'crm', 'meetingNotes', 'blocks', 'MindmapCanvas.tsx'],
    ['i18n', 'vi.ts'],
    ['i18n', 'scoring.ts'],
    ['lib', 'backgrounds.ts'],
    ['lib', 'format.ts'],
  ].map((segments) => path.join(...segments))
);

const HEX_LITERAL = /['"`]#[0-9a-fA-F]{3,8}['"`]/;

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

/**
 * Xoa noi dung comment nhung giu nguyen so dong, de so dong bao loi van dung.
 *
 * Can cho luat "khong ma mau nguyen ban": chinh cac ghi chu giai thich luat nay
 * co trich ma mau, va mot guard tu bao dong ghi chu cua no la guard se bi tat.
 * Bao phu ca `{/* … *\/}` cua JSX vi do cung chi la block comment.
 */
function blankComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (match) => match.replace(/[^\n]/g, ' '));
}

/**
 * `<th>` phai co `scope="col"` (hoac `scope="row"`) — quy tac cua chinh
 * docs/DESIGN-SYSTEM.md. The mo co the trai qua nhieu dong khi co nhieu thuoc
 * tinh, nen doc tu `<th` toi dau `>` dau tien thay vi chi xet mot dong.
 */
function findThWithoutScope(source, relative) {
  const hits = [];
  const openTag = /<th(\s|>)/g;
  let match;
  while ((match = openTag.exec(source)) !== null) {
    const end = source.indexOf('>', match.index);
    const tag = source.slice(match.index, end === -1 ? source.length : end);
    if (/\bscope\s*=/.test(tag)) continue;
    const lineNumber = source.slice(0, match.index).split(/\r?\n/).length;
    hits.push(`${relative}:${lineNumber} thẻ <th> thiếu scope="col"; trình đọc màn hình cần nó.`);
  }
  return hits;
}

for (const file of await walk(sourceRoot)) {
  const relative = path.relative(sourceRoot, file);
  const source = await readFile(file, 'utf8');
  const lines = source.split(/\r?\n/);
  const codeLines = blankComments(source).split(/\r?\n/);

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
    if (
      /\.tsx?$/.test(relative) &&
      !HEX_ALLOWED_FILES.has(relative) &&
      HEX_LITERAL.test(codeLines[index] ?? '')
    ) {
      findings.push(
        `${relative}:${index + 1} chứa mã màu nguyên bản trong mã nguồn; hãy dùng token của theme.`
      );
    }
  });

  if (/\.tsx$/.test(relative)) findings.push(...findThWithoutScope(source, relative));
}

if (findings.length > 0) {
  console.error(`UI system guard phát hiện ${findings.length} vấn đề:\n${findings.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('UI system guard: OK');
}
