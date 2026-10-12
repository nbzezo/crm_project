import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import zlib from 'node:zlib';

export type ExtractMethod = 'text' | 'pdf' | 'docx' | 'xlsx' | 'none';
export interface ExtractResult {
  text: string;
  method: ExtractMethod;
  reason?: string;
}
const MAX_TEXT_CHARS = 400_000;
const MAX_PDF_PAGES = 60;
const TEXT_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.csv',
  '.tsv',
  '.json',
  '.xml',
  '.html',
  '.htm',
  '.log',
  '.yaml',
  '.yml',
]);
function clamp(text: string, maxChars = MAX_TEXT_CHARS): string {
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}
function readZipEntry(buffer: Buffer, wanted: (name: string) => boolean): Buffer[] {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0 && i > buffer.length - 22 - 0xffff; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Không đọc được mục lục ZIP');
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const found: Buffer[] = [];
  for (let i = 0; i < count; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    offset += 46 + nameLength + extraLength + commentLength;
    if (!wanted(name)) continue;
    const start =
      localOffset +
      30 +
      buffer.readUInt16LE(localOffset + 26) +
      buffer.readUInt16LE(localOffset + 28);
    const raw = buffer.subarray(start, start + compressedSize);
    found.push(method === 0 ? raw : zlib.inflateRawSync(raw));
  }
  return found;
}
function xmlToText(xml: string, blockTags: RegExp): string {
  return xml
    .replace(blockTags, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
async function extractDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth');
  return (await mammoth.extractRawText({ buffer })).value.trim();
}
function extractXlsx(buffer: Buffer): string {
  const [shared] = readZipEntry(buffer, (name) => name === 'xl/sharedStrings.xml');
  const strings = shared
    ? [...shared.toString('utf8').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
        xmlToText(m[1], /<\/t>/g)
      )
    : [];
  const sheets = readZipEntry(buffer, (name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
  const lines: string[] = [];
  for (const sheet of sheets)
    for (const [, row] of sheet.toString('utf8').matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = [];
      for (const [, attrs, body] of row.matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
        const value = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '';
        if (value) cells.push(/t="s"/.test(attrs) ? (strings[Number(value)] ?? '') : value);
      }
      if (cells.length) lines.push(cells.join('\t'));
    }
  return lines.join('\n').trim();
}
function standardFontsUrl(): string {
  const entry = createRequire(import.meta.url).resolve('pdfjs-dist/package.json');
  return pathToFileURL(path.join(path.dirname(entry), 'standard_fonts/')).href;
}
async function extractPdf(buffer: Buffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    standardFontDataUrl: standardFontsUrl(),
    useSystemFonts: false,
    useWorkerFetch: false,
    verbosity: 0,
  });
  const doc = await task.promise;
  try {
    const pages: string[] = [];
    const total = Math.min(doc.numPages, MAX_PDF_PAGES);
    for (let page = 1; page <= total; page += 1) {
      const content = await (await doc.getPage(page)).getTextContent();
      pages.push(
        content.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ')
          .replace(/[ \t]+/g, ' ')
          .trim()
      );
    }
    if (doc.numPages > total) pages.push(`[Chỉ đọc ${total}/${doc.numPages} trang đầu]`);
    return pages.filter(Boolean).join('\n\n');
  } finally {
    await task.destroy();
  }
}

export async function extractFile(
  filePath: string,
  ext: string,
  maxChars = MAX_TEXT_CHARS
): Promise<ExtractResult> {
  if (!fs.existsSync(filePath)) throw new Error('Không tìm thấy tệp');
  try {
    if (TEXT_EXTENSIONS.has(ext))
      return { text: clamp(fs.readFileSync(filePath, 'utf8'), maxChars), method: 'text' };
    if (ext === '.pdf')
      return { text: clamp(await extractPdf(fs.readFileSync(filePath)), maxChars), method: 'pdf' };
    if (ext === '.docx')
      return {
        text: clamp(await extractDocx(fs.readFileSync(filePath)), maxChars),
        method: 'docx',
      };
    if (ext === '.xlsx')
      return { text: clamp(extractXlsx(fs.readFileSync(filePath)), maxChars), method: 'xlsx' };
  } catch (error) {
    return {
      text: '',
      method: 'none',
      reason: error instanceof Error ? error.message : 'Không đọc được nội dung tệp',
    };
  }
  return { text: '', method: 'none', reason: `Chưa hỗ trợ đọc định dạng ${ext || '?'}` };
}
