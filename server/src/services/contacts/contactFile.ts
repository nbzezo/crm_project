import { HttpError } from '../../lib/validate.ts';
import { fold } from '../../lib/viSearch.ts';
import { splitMulti } from './contactKeys.ts';

/*
 * Doc file danh ba nguoi dung tai len: vCard (.vcf — iPhone, Android, Outlook,
 * Google Contacts) va CSV (xuat tu Google Contacts / Outlook). Chi doc, khong ghi
 * ra dau ca; ket qua la danh sach `ParsedContact` de dich vu danh ba ca nhan nap.
 */

export interface ParsedContact {
  full_name: string;
  org_name: string | null;
  title: string | null;
  phones: string[];
  emails: string[];
  notes: string;
}

const MAX_CONTACTS = 20000;
const BOM = /^\uFEFF/;

function clean(value: string | undefined | null): string | null {
  const text = value?.trim();
  return text ? text : null;
}

function finish(partial: Partial<ParsedContact> & { name?: string }): ParsedContact | null {
  const phones = [...new Set((partial.phones ?? []).map((p) => p.trim()).filter(Boolean))];
  const emails = [...new Set((partial.emails ?? []).map((e) => e.trim()).filter(Boolean))];
  const org = clean(partial.org_name);
  const name = clean(partial.name) ?? clean(partial.full_name) ?? org ?? emails[0] ?? phones[0];
  if (!name) return null;
  return {
    full_name: name,
    org_name: org,
    title: clean(partial.title),
    phones,
    emails,
    notes: partial.notes?.trim() ?? '',
  };
}

/* ---------- vCard ---------- */

function decodeQuotedPrintable(value: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const hex = value.slice(i + 1, i + 3);
    if (value[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(hex)) {
      bytes.push(parseInt(hex, 16));
      i += 2;
    } else {
      bytes.push(...Buffer.from(value[i], 'utf8'));
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

function unescapeVCard(value: string): string {
  return value.replace(/\\([nN,;\\])/g, (_m, c: string) => (c === 'n' || c === 'N' ? '\n' : c));
}

/** Gop dong gap (bat dau bang khoang trang) va dong QUOTED-PRINTABLE bi ngat bang `=`. */
function unfold(text: string): string[] {
  const physical = text.replace(/\r\n?/g, '\n').split('\n');
  const lines: string[] = [];
  for (const line of physical) {
    const previous = lines[lines.length - 1];
    if (previous !== undefined && /^[ \t]/.test(line)) {
      lines[lines.length - 1] = previous + line.slice(1);
    } else if (
      previous !== undefined &&
      /ENCODING=QUOTED-PRINTABLE/i.test(previous) &&
      previous.endsWith('=')
    ) {
      lines[lines.length - 1] = previous.slice(0, -1) + line;
    } else {
      lines.push(line);
    }
  }
  return lines;
}

export function parseVCard(text: string): ParsedContact[] {
  const result: ParsedContact[] = [];
  let card: (Partial<ParsedContact> & { name?: string; structured?: string }) | null = null;

  for (const line of unfold(text.replace(BOM, ''))) {
    const upper = line.trim().toUpperCase();
    if (upper === 'BEGIN:VCARD') {
      card = { phones: [], emails: [] };
      continue;
    }
    if (upper === 'END:VCARD') {
      if (card) {
        const parsed = finish({ ...card, name: card.name || card.structured });
        if (parsed) result.push(parsed);
      }
      card = null;
      if (result.length > MAX_CONTACTS) throw new HttpError(422, 'File có quá nhiều liên hệ');
      continue;
    }
    if (!card) continue;

    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const head = line.slice(0, colon).split(';');
    const property = head[0].split('.').pop()!.toUpperCase();
    let value = line.slice(colon + 1);
    if (head.some((part) => /^ENCODING=QUOTED-PRINTABLE$/i.test(part))) {
      value = decodeQuotedPrintable(value);
    }

    switch (property) {
      case 'FN':
        card.name = unescapeVCard(value);
        break;
      case 'N': {
        /* Ho;Ten;Dem;Tien to;Hau to -> "Ten Dem Ho" khi khong co FN. */
        const [family = '', given = '', middle = ''] = value.split(';').map(unescapeVCard);
        card.structured = [given, middle, family].filter(Boolean).join(' ');
        break;
      }
      case 'TEL':
        card.phones!.push(unescapeVCard(value).replace(/^tel:/i, ''));
        break;
      case 'EMAIL':
        card.emails!.push(unescapeVCard(value));
        break;
      case 'ORG':
        card.org_name = value.split(';').map(unescapeVCard).filter(Boolean).join(' - ');
        break;
      case 'TITLE':
        card.title = unescapeVCard(value);
        break;
      case 'NOTE':
        card.notes = unescapeVCard(value);
        break;
      default:
        break;
    }
  }
  return result;
}

/* ---------- CSV ---------- */

export function parseCsvRows(text: string): string[][] {
  const source = text.replace(BOM, '');
  const firstLine = source.split(/\r?\n/, 1)[0] ?? '';
  const delimiter =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  row.push(field);
  if (row.some((cell) => cell.trim() !== '')) rows.push(row);
  return rows;
}

const NAME_HEADERS = new Set(['name', 'full name', 'display name', 'ho ten', 'ho va ten', 'ten']);
const FIRST_HEADERS = new Set(['first name', 'given name', 'ten goi']);
const MIDDLE_HEADERS = new Set(['middle name', 'additional name']);
const LAST_HEADERS = new Set(['last name', 'family name', 'surname', 'ho']);
const ORG_HEADERS = new Set([
  'organization name',
  'organization 1 - name',
  'company',
  'organization',
  'cong ty',
  'don vi',
]);
const TITLE_HEADERS = new Set([
  'organization title',
  'organization 1 - title',
  'job title',
  'title',
  'chuc vu',
]);
const NOTE_HEADERS = new Set(['notes', 'note', 'ghi chu']);

function isEmailHeader(h: string): boolean {
  return /e-?mail/.test(h) && !/type|label|display name/.test(h);
}
function isPhoneHeader(h: string): boolean {
  return /phone|mobile|dien thoai|^sdt$|^tel$/.test(h) && !/type|label/.test(h);
}

export function parseContactsCsv(text: string): ParsedContact[] {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => fold(h).trim());
  const index = (set: Set<string>) =>
    headers.map((h, i) => (set.has(h) ? i : -1)).filter((i) => i >= 0);

  const nameCols = index(NAME_HEADERS);
  const firstCols = index(FIRST_HEADERS);
  const middleCols = index(MIDDLE_HEADERS);
  const lastCols = index(LAST_HEADERS);
  const orgCols = index(ORG_HEADERS);
  const titleCols = index(TITLE_HEADERS);
  const noteCols = index(NOTE_HEADERS);
  const emailCols = headers.map((h, i) => (isEmailHeader(h) ? i : -1)).filter((i) => i >= 0);
  const phoneCols = headers.map((h, i) => (isPhoneHeader(h) ? i : -1)).filter((i) => i >= 0);

  const recognised =
    nameCols.length + firstCols.length + lastCols.length + emailCols.length + phoneCols.length;
  if (recognised === 0) {
    throw new HttpError(
      422,
      'Không nhận ra cột nào trong file CSV — hãy xuất danh bạ từ Google Contacts (định dạng Google CSV) hoặc dùng file .vcf'
    );
  }

  const cell = (row: string[], cols: number[]) => {
    for (const col of cols) {
      const value = clean(row[col]);
      if (value) return value;
    }
    return null;
  };

  const result: ParsedContact[] = [];
  for (const row of rows.slice(1)) {
    const joined = [cell(row, firstCols), cell(row, middleCols), cell(row, lastCols)]
      .filter(Boolean)
      .join(' ');
    const parsed = finish({
      name: cell(row, nameCols) ?? (joined || undefined),
      org_name: cell(row, orgCols),
      title: cell(row, titleCols),
      notes: cell(row, noteCols) ?? '',
      emails: emailCols.flatMap((col) => splitMulti(row[col])),
      phones: phoneCols.flatMap((col) => splitMulti(row[col])),
    });
    if (parsed) result.push(parsed);
    if (result.length > MAX_CONTACTS) throw new HttpError(422, 'File có quá nhiều liên hệ');
  }
  return result;
}

/** Chon bo doc theo duoi tep; neu khong ro thi nhin noi dung. */
export function parseContactFile(filename: string, buffer: Buffer): ParsedContact[] {
  const text = buffer.toString('utf8');
  const lower = filename.toLowerCase();
  const looksLikeVCard = /^\s*BEGIN:VCARD/i.test(text.replace(BOM, ''));
  if (lower.endsWith('.vcf') || lower.endsWith('.vcard') || looksLikeVCard) return parseVCard(text);
  if (lower.endsWith('.csv')) return parseContactsCsv(text);
  throw new HttpError(422, 'Chỉ nhận file danh bạ .vcf (vCard) hoặc .csv');
}
