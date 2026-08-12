import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import zlib from 'node:zlib';

/**
 * Trich xuat noi dung van ban tu tep tai len.
 *
 * Truoc day chi doc duoc tep text thuan (`readFileSync(utf8)`), nen PDF/DOCX —
 * dung nhung dinh dang chua noi dung dang gia nhat — chi vao duoc chi muc bang ten
 * va mo ta. Module nay dong lo hong do va la nguon duy nhat cho ca hai phia: lap chi
 * muc RAG va de xuat metadata bang AI.
 *
 * Nguyen tac: moi bo doc deu boc try/catch va co tran tai nguyen. Tai lieu hong hoac
 * la khong duoc lam hong luong upload — cung lam sao thi tra ve `method: 'none'` de
 * phia goi quyet dinh co nho AI doc anh hay khong.
 */

export type ExtractMethod = 'text' | 'pdf' | 'docx' | 'xlsx' | 'none';

export interface ExtractResult {
  text: string;
  method: ExtractMethod;
  /** Ly do khong trich duoc — de len log va len canh bao cho nguoi dung. */
  reason?: string;
}

/** Tran chung: doc qua nguong nay thi khong con la "doc metadata" nua. */
export const MAX_EXTRACT_BYTES = 5 * 1024 * 1024;
const MAX_PDF_PAGES = 60;
const MAX_TEXT_CHARS = 400_000;

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

function clamp(text: string): string {
  return text.length > MAX_TEXT_CHARS ? text.slice(0, MAX_TEXT_CHARS) : text;
}

/* ---------- ZIP: docx/xlsx deu la goi ZIP nen doc chung mot bo giai nen ---------- */

/**
 * Doc mot muc trong goi ZIP ma khong keo them thu vien.
 *
 * Duyet nguoc tu End Of Central Directory de lay bang muc luc — day la cach dung
 * theo dac ta, khong phai do tim chu ky trong phan du lieu (co the trung ngau nhien).
 */
function readZipEntry(buffer: Buffer, wanted: (name: string) => boolean): Buffer[] {
  const eocdSignature = 0x06054b50;
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0 && i > buffer.length - 22 - 0xffff; i -= 1) {
    if (buffer.readUInt32LE(i) === eocdSignature) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Khong doc duoc muc luc ZIP');

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

    // Do dai phan ten/extra o local header co the khac o central directory.
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(start, start + compressedSize);
    found.push(method === 0 ? raw : zlib.inflateRawSync(raw));
  }
  return found;
}

/** Go the XML, giai ma thuc the va gop khoang trang — du de lam ngu lieu doc hieu. */
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
  const { value } = await mammoth.extractRawText({ buffer });
  return value.trim();
}

/**
 * Chuoi trong .xlsx duoc gom vao sharedStrings.xml, o tinh chi luu chi so.
 * Ghep hai phan lai moi ra noi dung nguoi dung nhin thay.
 */
function extractXlsx(buffer: Buffer): string {
  const [shared] = readZipEntry(buffer, (name) => name === 'xl/sharedStrings.xml');
  const strings = shared
    ? [...shared.toString('utf8').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) =>
        xmlToText(match[1], /<\/t>/g)
      )
    : [];

  const sheets = readZipEntry(buffer, (name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
  const lines: string[] = [];
  for (const sheet of sheets) {
    for (const [, row] of sheet.toString('utf8').matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = [];
      for (const [, attrs, body] of row.matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
        const value = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '';
        if (!value) continue;
        // t="s" nghia la o tro toi bang chuoi dung chung, khong phai so.
        cells.push(/t="s"/.test(attrs) ? (strings[Number(value)] ?? '') : value);
      }
      if (cells.length > 0) lines.push(cells.join('\t'));
    }
  }
  return lines.join('\n').trim();
}

/* ---------- PDF ---------- */

/**
 * Duong dan bo font chuan di kem pdfjs.
 *
 * Khong co no thi PDF dung font Type1 chuan (Helvetica, Times...) se canh bao va
 * co the mat ky tu. Phai la URL ket thuc bang '/' theo dung yeu cau cua pdfjs.
 */
function standardFontsUrl(): string {
  const entry = createRequire(import.meta.url).resolve('pdfjs-dist/package.json');
  return pathToFileURL(path.join(path.dirname(entry), 'standard_fonts/')).href;
}

async function extractPdf(buffer: Buffer): Promise<string> {
  // Ban legacy la ban duy nhat chay duoc ngoai trinh duyet.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    standardFontDataUrl: standardFontsUrl(),
    // Tep tai len la du lieu khong tin cay: khong doc font he thong, khong goi mang.
    useSystemFonts: false,
    useWorkerFetch: false,
    /*
     * 0 = chi bao loi. Chi lay getTextContent() nen font chi phuc vu ve hinh —
     * canh bao thieu font la nhieu, va no in thang ra log server moi lan upload.
     */
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

/* ---------- Diem vao ---------- */

export async function extractText(
  filePath: string,
  mime: string | null,
  fileName: string
): Promise<ExtractResult> {
  if (!fs.existsSync(filePath)) return { text: '', method: 'none', reason: 'Không tìm thấy tệp' };
  const { size } = fs.statSync(filePath);
  if (size > MAX_EXTRACT_BYTES) {
    return {
      text: '',
      method: 'none',
      reason: `Tệp lớn hơn ${MAX_EXTRACT_BYTES / 1024 / 1024} MB`,
    };
  }

  const ext = path.extname(fileName).toLowerCase();
  const isText = Boolean(mime?.startsWith('text/')) || TEXT_EXTENSIONS.has(ext);

  try {
    if (isText) return { text: clamp(fs.readFileSync(filePath, 'utf8')), method: 'text' };
    if (ext === '.pdf' || mime === 'application/pdf') {
      return { text: clamp(await extractPdf(fs.readFileSync(filePath))), method: 'pdf' };
    }
    if (ext === '.docx') {
      return { text: clamp(await extractDocx(fs.readFileSync(filePath))), method: 'docx' };
    }
    if (ext === '.xlsx') {
      return { text: clamp(extractXlsx(fs.readFileSync(filePath))), method: 'xlsx' };
    }
  } catch (error) {
    // Tai lieu hong khong duoc lam hong upload — chi bao la khong doc duoc.
    return {
      text: '',
      method: 'none',
      reason: error instanceof Error ? error.message : 'Không đọc được nội dung tệp',
    };
  }

  return { text: '', method: 'none', reason: `Chưa hỗ trợ đọc định dạng ${ext || mime || '?'}` };
}
