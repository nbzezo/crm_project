import ExcelJS from 'exceljs';
import type { ContractKind, ContractTerm, RevenueStage, ServiceStatus } from '@workflow/contracts';
import { fold } from '../lib/viSearch.ts';
import type { AnchorMode } from './revenueSegments.ts';

/**
 * Nhap doanh thu tu Excel: tao file mau va doc file nguoi dung dien lai.
 *
 * Mot dong Excel = mot dong doanh thu (khach hang x dich vu) cua MOT nam: thong
 * tin dong + 12 o tien thang + TB thang nam truoc + moc phan nhom. O de trong
 * nghia la "giu nguyen", khong phai "xoa" — nho vay nguoi dung chi can dien
 * phan muon doi, va xoa mot dong trong file khong bao gio xoa du lieu.
 */

export const IMPORT_SHEET = 'Doanh thu';
export const KPI_SHEET = 'Chỉ tiêu KPI';
/** Ten hien thi cua nhom AM rong trong file. */
export const NO_AM_LABEL = '(Chưa gán AM)';
const META_SHEET = '_meta';

const KIND_LABELS: Record<ContractKind, string> = { new: 'Mới', expansion: 'Mở rộng' };
const TERM_LABELS: Record<ContractTerm, string> = {
  long: 'Lâu dài',
  short: 'Ngắn hạn',
  trial: 'Dùng thử',
  other: 'Khác',
};
const STATUS_LABELS: Record<ServiceStatus, string> = {
  using: 'Đang sử dụng',
  pending: 'Chờ triển khai',
  paused: 'Tạm dừng',
  stopped: 'Đã ngừng',
};
const STAGE_LABELS: Record<RevenueStage, string> = {
  forecast: 'Dự kiến',
  reconciled: 'Đã đối soát',
  invoiced: 'Đã xuất hóa đơn',
  paid: 'Đã thanh toán',
};
const ANCHOR_AUTO = 'Tự động';
const ANCHOR_BASE = 'Toàn bộ là Nền';

/** Thu tu cot trong file mau. Doc theo TIEU DE chu khong theo vi tri. */
const COLUMNS = [
  { key: 'line_id', header: 'Mã dòng', width: 10 },
  { key: 'customer', header: 'Khách hàng *', width: 30 },
  { key: 'service', header: 'Dịch vụ', width: 22 },
  { key: 'am', header: 'AM', width: 14 },
  { key: 'kind', header: 'Loại HĐ', width: 11 },
  { key: 'term', header: 'Thời hạn HĐ', width: 12 },
  { key: 'status', header: 'Tình trạng', width: 15 },
  { key: 'start_date', header: 'Ngày bắt đầu', width: 13 },
  { key: 'end_date', header: 'Ngày kết thúc', width: 13 },
  { key: 'anchor', header: 'Mốc phân nhóm', width: 16 },
  { key: 'baseline', header: 'TB tháng năm trước', width: 18 },
  { key: 'stage', header: 'Trạng thái doanh thu', width: 18 },
  ...Array.from({ length: 12 }, (_, i) => ({ key: `m${i + 1}`, header: `T${i + 1}`, width: 14 })),
] as const;

type ColumnKey = (typeof COLUMNS)[number]['key'];

/* ---------- File mau ---------- */

export interface TemplateLine {
  id: number;
  customer_name: string;
  service_name: string | null;
  am: string | null;
  contract_kind: ContractKind;
  contract_term: ContractTerm;
  status: ServiceStatus;
  start_date: string | null;
  end_date: string | null;
  revenue_anchor_mode: AnchorMode;
  revenue_anchor_period: string | null;
  baseline_avg_vnd: number | null;
  /** So tien thang 1..12 cua nam (undefined = chua co o). */
  months: (number | undefined)[];
}

function toExcelDate(value: string | null): Date | null {
  return value ? new Date(`${value}T00:00:00Z`) : null;
}

function anchorLabel(mode: AnchorMode, period: string | null): string {
  if (mode === 'base') return ANCHOR_BASE;
  if (mode === 'manual' && period) return `${period.slice(5, 7)}/${period.slice(0, 4)}`;
  return ANCHOR_AUTO;
}

function listValidation(values: string[]): ExcelJS.DataValidation {
  return {
    type: 'list',
    allowBlank: true,
    formulae: [`"${values.join(',')}"`],
    showErrorMessage: true,
    errorTitle: 'Giá trị không hợp lệ',
    error: `Chọn một trong: ${values.join(', ')}`,
  };
}

/** File mau cua nam `year`, dien san cac dong dang co de sua thang tren do. */
export interface TemplateKpi {
  am: string;
  /** Chi tieu thang 1..12 (undefined = chua dat). */
  months: (number | undefined)[];
}

export async function buildTemplate(
  year: number,
  lines: TemplateLine[],
  customers: string[],
  services: string[],
  kpi: TemplateKpi[] = []
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'WorkFlow';
  const ws = wb.addWorksheet(IMPORT_SHEET, { views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }] });
  ws.columns = COLUMNS.map((c) => ({ key: c.key, header: c.header, width: c.width }));
  const header = ws.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: 'middle', wrapText: true };
  header.height = 30;
  header.eachCell((cell, col) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: col === 1 ? 'FFE5E7EB' : col <= 12 ? 'FFDBEAFE' : 'FFFEF3C7' },
    };
  });
  ws.getCell('A1').note =
    'Để trống khi thêm dòng mới. Giữ nguyên mã khi sửa dòng đã có — đừng sửa tay mã này.';
  ws.getCell('J1').note = `"${ANCHOR_AUTO}", "${ANCHOR_BASE}" hoặc tháng mốc dạng MM/YYYY.`;
  ws.getCell('L1').note =
    'Áp dụng cho các ô tháng có số tiền mới hoặc thay đổi trên dòng này. Để trống: giữ trạng thái đang có (ô mới là Dự kiến).';

  for (const line of lines) {
    const row: Record<string, unknown> = {
      line_id: line.id,
      customer: line.customer_name,
      service: line.service_name ?? '',
      am: line.am ?? '',
      kind: KIND_LABELS[line.contract_kind],
      term: TERM_LABELS[line.contract_term],
      status: STATUS_LABELS[line.status],
      start_date: toExcelDate(line.start_date),
      end_date: toExcelDate(line.end_date),
      anchor: anchorLabel(line.revenue_anchor_mode, line.revenue_anchor_period),
      baseline: line.baseline_avg_vnd ?? null,
    };
    line.months.forEach((amount, i) => {
      if (amount !== undefined) row[`m${i + 1}`] = amount;
    });
    ws.addRow(row);
  }

  /* Lua chon tha xuong cho 500 dong dau — du cho nhap tay, khong lam file nang. */
  const lastRow = Math.max(lines.length + 1, 500);
  const lists = wb.addWorksheet('Danh mục', { state: 'veryHidden' });
  customers.forEach((name, i) => (lists.getCell(i + 1, 1).value = name));
  services.forEach((name, i) => (lists.getCell(i + 1, 2).value = name));
  for (let r = 2; r <= lastRow; r += 1) {
    if (customers.length)
      ws.getCell(r, 2).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`'Danh mục'!$A$1:$A$${customers.length}`],
        showErrorMessage: true,
        errorStyle: 'warning',
        error: 'Khách hàng chưa có trong CRM — cần tạo khách hàng trước.',
      };
    if (services.length)
      ws.getCell(r, 3).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`'Danh mục'!$B$1:$B$${services.length}`],
        showErrorMessage: true,
        errorStyle: 'warning',
        error: 'Dịch vụ chưa có trong danh mục.',
      };
    ws.getCell(r, 5).dataValidation = listValidation(Object.values(KIND_LABELS));
    ws.getCell(r, 6).dataValidation = listValidation(Object.values(TERM_LABELS));
    ws.getCell(r, 7).dataValidation = listValidation(Object.values(STATUS_LABELS));
    ws.getCell(r, 12).dataValidation = listValidation(Object.values(STAGE_LABELS));
    for (const c of [8, 9]) ws.getCell(r, c).numFmt = 'dd/mm/yyyy';
    for (let c = 11; c <= COLUMNS.length; c += 1) {
      if (c !== 12) ws.getCell(r, c).numFmt = '#,##0';
    }
  }

  const kpiSheet = wb.addWorksheet(KPI_SHEET, {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }],
  });
  kpiSheet.columns = [
    { header: 'AM', key: 'am', width: 22 },
    ...Array.from({ length: 12 }, (_, i) => ({ header: `T${i + 1}`, key: `m${i + 1}`, width: 14 })),
  ];
  kpiSheet.getRow(1).font = { bold: true };
  kpiSheet.getCell('A1').note =
    'Mỗi dòng một AM, ghi đúng tên AM như trên dòng doanh thu. Ô để trống = giữ nguyên; điền 0 để xoá chỉ tiêu.';
  for (const item of kpi) {
    const row: Record<string, unknown> = { am: item.am || NO_AM_LABEL };
    item.months.forEach((value, i) => {
      if (value !== undefined) row[`m${i + 1}`] = value;
    });
    kpiSheet.addRow(row);
  }
  for (let r = 2; r <= Math.max(kpi.length + 1, 50); r += 1)
    for (let c = 2; c <= 13; c += 1) kpiSheet.getCell(r, c).numFmt = '#,##0';

  const guide = wb.addWorksheet('Hướng dẫn');
  guide.getColumn(1).width = 110;
  [
    `File mẫu nhập doanh thu năm ${year}. Mỗi dòng là một khách hàng × dịch vụ; T1–T12 là doanh thu từng tháng của năm ${year}.`,
    'Ô để trống = giữ nguyên dữ liệu đang có. Điền 0 nếu muốn đặt số tiền tháng đó về 0.',
    'Xoá một dòng khỏi file KHÔNG xoá dòng doanh thu trong hệ thống.',
    'Dòng mới: để trống "Mã dòng". Khách hàng phải có sẵn trong CRM; dịch vụ phải có trong danh mục dịch vụ.',
    'Không có "Mã dòng": hệ thống tìm dòng đã có theo Khách hàng + Dịch vụ; chưa có thì tạo mới.',
    `Mốc phân nhóm: "${ANCHOR_AUTO}" (12 tháng đầu là Mới / Mở rộng, sau đó là Nền), "${ANCHOR_BASE}", hoặc tháng mốc MM/YYYY.`,
    `TB tháng năm trước: mức so sánh của doanh thu Nền năm ${year} (TB tháng năm ${year - 1}).`,
    'Chỉ những ô tháng có số tiền mới hoặc khác số đang có mới được ghi. "Trạng thái doanh thu" áp dụng cho chính các ô đó — tháng giữ nguyên số tiền thì giữ nguyên trạng thái.',
    `Sheet "${KPI_SHEET}": chỉ tiêu KPI doanh thu năm ${year} theo từng AM và từng tháng. Dòng "${NO_AM_LABEL}" là chỉ tiêu cho doanh thu chưa gán AM.`,
    'Sau khi tải lên, hệ thống cho xem trước từng dòng (thêm / sửa / lỗi) rồi mới ghi.',
  ].forEach((text, i) => {
    guide.getCell(i + 1, 1).value = text;
    guide.getCell(i + 1, 1).alignment = { wrapText: true };
  });

  const meta = wb.addWorksheet(META_SHEET, { state: 'veryHidden' });
  meta.getCell('A1').value = 'year';
  meta.getCell('B1').value = year;

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/* ---------- Doc file ---------- */

export type RawRow = { row: number } & Partial<Record<ColumnKey, unknown>>;

export interface KpiRow {
  row: number;
  am: string;
  /** Thang (1..12) -> chi tieu; 0 = xoa chi tieu. */
  months: Map<number, number>;
  errors: string[];
}

export interface ParsedWorkbook {
  year: number | null;
  rows: RawRow[];
  kpi: KpiRow[];
}

/** Gia tri thuan cua mot o: bo cong thuc, rich text, hyperlink. */
function plain(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    if ('result' in value) return plain(value.result as ExcelJS.CellValue);
    if ('richText' in value) return value.richText.map((r) => r.text).join('');
    if ('text' in value) return value.text;
    if ('error' in value) return null;
  }
  return value;
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && !value.trim());
}

export async function parseWorkbook(buffer: Buffer): Promise<ParsedWorkbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.getWorksheet(IMPORT_SHEET) ?? wb.worksheets.find((s) => s.state === 'visible');
  if (!ws) return { year: null, rows: [], kpi: [] };

  const metaYear = Number(plain(wb.getWorksheet(META_SHEET)?.getCell('B1').value ?? null));
  const columnOf = new Map<ColumnKey, number>();
  ws.getRow(1).eachCell((cell, col) => {
    const text = fold(
      String(plain(cell.value) ?? '')
        .replace('*', '')
        .trim()
    );
    const match = COLUMNS.find((c) => fold(c.header.replace('*', '').trim()) === text);
    if (match) columnOf.set(match.key, col);
  });

  const rows: RawRow[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const raw: RawRow = { row: rowNumber };
    let any = false;
    for (const [key, col] of columnOf) {
      const value = plain(row.getCell(col).value);
      if (!isBlank(value)) {
        raw[key] = typeof value === 'string' ? value.trim() : value;
        any = true;
      }
    }
    if (any) rows.push(raw);
  });
  return {
    year: Number.isInteger(metaYear) && metaYear >= 2000 && metaYear <= 2100 ? metaYear : null,
    rows,
    kpi: parseKpiSheet(wb.getWorksheet(KPI_SHEET)),
  };
}

/* ---------- Chuyen o Excel thanh gia tri nghiep vu ---------- */

function fromLabels<T extends string>(labels: Record<T, string>, value: unknown): T | undefined {
  const text = fold(String(value));
  return (Object.keys(labels) as T[]).find((k) => fold(labels[k]) === text || k === text);
}

/** So tien: so trong o, hoac chu "1.234.567" / "1,234,567". Am hoac sai -> loi. */
export function parseAmount(value: unknown): number | null {
  if (typeof value === 'number')
    return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
  const text = String(value).replace(/[\s₫đ]|vnd/gi, '');
  if (!/^\d{1,3}([.,]\d{3})*$|^\d+$/.test(text)) return null;
  return Number(text.replace(/[.,]/g, ''));
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Ngay: o kieu Date, "dd/mm/yyyy" hoac "yyyy-mm-dd". */
export function parseDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
  }
  const text = String(value).trim();
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  if (m) return validDate(Number(m[3]), Number(m[2]), Number(m[1]));
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (m) return validDate(Number(m[1]), Number(m[2]), Number(m[3]));
  return null;
}

function validDate(y: number, mo: number, d: number): string | null {
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d)
    return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

/** Moc phan nhom: Tu dong / Toan bo la Nen / MM/YYYY (hoac YYYY-MM, hoac o ngay). */
export function parseAnchor(value: unknown): { mode: AnchorMode; period: string | null } | null {
  if (value instanceof Date)
    return { mode: 'manual', period: `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}` };
  const text = fold(String(value));
  if (text === fold(ANCHOR_AUTO) || text === 'auto') return { mode: 'auto', period: null };
  if (text === fold(ANCHOR_BASE) || text === 'nen' || text === 'base')
    return { mode: 'base', period: null };
  let m = /^(\d{1,2})[/.-](\d{4})$/.exec(text);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12)
    return { mode: 'manual', period: `${m[2]}-${pad(Number(m[1]))}` };
  m = /^(\d{4})-(\d{2})$/.exec(text);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12)
    return { mode: 'manual', period: `${m[1]}-${m[2]}` };
  return null;
}

/** Mot dong Excel da kiem tra, san sang ghi. `undefined` = giu nguyen. */
export interface ParsedRow {
  row: number;
  line_id?: number;
  customer?: string;
  service?: string;
  am?: string;
  contract_kind?: ContractKind;
  contract_term?: ContractTerm;
  status?: ServiceStatus;
  start_date?: string;
  end_date?: string;
  anchor?: { mode: AnchorMode; period: string | null };
  baseline?: number;
  stage?: RevenueStage;
  /** Thang (1..12) -> so tien. */
  months: Map<number, number>;
  errors: string[];
}

/** Kiem tra dinh dang tung o — chua dong vao CSDL. */
export function validateRow(raw: RawRow): ParsedRow {
  const out: ParsedRow = { row: raw.row, months: new Map(), errors: [] };
  const err = (text: string) => out.errors.push(text);

  if (raw.line_id !== undefined) {
    const id = Number(raw.line_id);
    if (Number.isInteger(id) && id > 0) out.line_id = id;
    else err(`Mã dòng "${raw.line_id}" không hợp lệ`);
  }
  if (raw.customer !== undefined) out.customer = String(raw.customer);
  else if (out.line_id === undefined) err('Thiếu tên khách hàng');
  if (raw.service !== undefined) out.service = String(raw.service);
  if (raw.am !== undefined) out.am = String(raw.am);

  const pick = <T extends string>(key: ColumnKey, labels: Record<T, string>, name: string) => {
    if (raw[key] === undefined) return undefined;
    const value = fromLabels(labels, raw[key]);
    if (!value) err(`${name} "${raw[key]}" không hợp lệ (${Object.values(labels).join(' / ')})`);
    return value;
  };
  out.contract_kind = pick('kind', KIND_LABELS, 'Loại HĐ');
  out.contract_term = pick('term', TERM_LABELS, 'Thời hạn HĐ');
  out.status = pick('status', STATUS_LABELS, 'Tình trạng');
  out.stage = pick('stage', STAGE_LABELS, 'Trạng thái doanh thu');

  for (const key of ['start_date', 'end_date'] as const) {
    if (raw[key] === undefined) continue;
    const date = parseDate(raw[key]);
    if (date) out[key] = date;
    else
      err(
        `${key === 'start_date' ? 'Ngày bắt đầu' : 'Ngày kết thúc'} "${raw[key]}" không đọc được (dd/mm/yyyy)`
      );
  }
  if (out.start_date && out.end_date && out.end_date < out.start_date)
    err('Ngày kết thúc trước ngày bắt đầu');

  if (raw.anchor !== undefined) {
    const anchor = parseAnchor(raw.anchor);
    if (anchor) out.anchor = anchor;
    else
      err(`Mốc phân nhóm "${raw.anchor}" không hợp lệ (${ANCHOR_AUTO} / ${ANCHOR_BASE} / MM/YYYY)`);
  }
  if (raw.baseline !== undefined) {
    const value = parseAmount(raw.baseline);
    if (value === null) err(`TB tháng năm trước "${raw.baseline}" không phải số tiền hợp lệ`);
    else out.baseline = value;
  }
  for (let m = 1; m <= 12; m += 1) {
    const cell = raw[`m${m}` as ColumnKey];
    if (cell === undefined) continue;
    const value = parseAmount(cell);
    if (value === null) err(`T${m}: "${cell}" không phải số tiền hợp lệ`);
    else out.months.set(m, value);
  }
  return out;
}

/** Sheet chi tieu KPI: cot "AM" + T1..T12, doc theo tieu de. */
function parseKpiSheet(ws: ExcelJS.Worksheet | undefined): KpiRow[] {
  if (!ws) return [];
  const columnOf = new Map<string, number>();
  ws.getRow(1).eachCell((cell, col) => {
    columnOf.set(fold(String(plain(cell.value) ?? '').trim()), col);
  });
  const amCol = columnOf.get('am');
  if (!amCol) return [];
  const rows: KpiRow[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const name = String(plain(row.getCell(amCol).value) ?? '').trim();
    const item: KpiRow = {
      row: rowNumber,
      am: name === NO_AM_LABEL ? '' : name,
      months: new Map(),
      errors: [],
    };
    for (let m = 1; m <= 12; m += 1) {
      const col = columnOf.get(`t${m}`);
      if (!col) continue;
      const value = plain(row.getCell(col).value);
      if (isBlank(value)) continue;
      const amount = parseAmount(value);
      if (amount === null) item.errors.push(`T${m}: "${String(value)}" không phải số tiền hợp lệ`);
      else item.months.set(m, amount);
    }
    if (!name && item.months.size > 0) item.errors.push('Thiếu tên AM');
    if (name || item.months.size > 0 || item.errors.length > 0) rows.push(item);
  });
  return rows;
}
