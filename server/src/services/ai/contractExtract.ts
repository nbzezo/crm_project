import fs from 'node:fs';
import type { Database } from 'better-sqlite3';
import { z } from 'zod';
import { fold } from '../../lib/viSearch.ts';
import { runStructured } from './gateway.ts';
import { extractText } from './textExtract.ts';

/**
 * AI doc tep hop dong va de xuat cac truong cua form "Them hop dong" + thong tin
 * ben khach hang.
 *
 * KHONG ghi gi vao CSDL: chi tra de xuat de nguoi dung duyet roi moi luu (cung
 * nguyen tac voi /assist/document). Moi gia tri AI tra ve deu di qua bo chuan hoa
 * ben duoi — ngay dd/mm/yyyy, so tien "1.500.000.000 dong" — vi khong mo hinh nao
 * dam bao dung dinh dang dau ra.
 */

const MIN_USEFUL_CHARS = 200;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_PROMPT_CHARS = 24_000;

/* ---------- Chuan hoa ---------- */

/** Nhan YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY; ngay khong ton tai thi null. */
export function normalizeDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  let y: number;
  let m: number;
  let d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  const vn = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (vn) [d, m, y] = [Number(vn[1]), Number(vn[2]), Number(vn[3])];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d)
    return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** So nguyen khong am tu so hoac chuoi kieu "1.500.000.000 đ"; khong doc duoc thi 0. */
export function normalizeMoney(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  if (typeof value !== 'string') return 0;
  const digits = value.replace(/[^\d]/g, '');
  const n = digits ? Number(digits) : 0;
  return Number.isSafeInteger(n) ? n : 0;
}

/** Cong so thang vao ngay ISO, tru 1 ngay (HD 12 thang tu 01/03 het han 28|29/02 nam sau). */
export function addMonthsMinusOneDay(iso: string, months: number): string | null {
  const start = normalizeDate(iso);
  if (!start || !Number.isInteger(months) || months <= 0 || months > 600) return null;
  const [y, m, d] = start.split('-').map(Number);
  const end = new Date(Date.UTC(y, m - 1 + months, d));
  // Cong thang tran sang thang sau (31/01 + 1 thang) thi lui ve cuoi thang dich.
  if (end.getUTCDate() !== d) end.setUTCDate(0);
  end.setUTCDate(end.getUTCDate() - 1);
  return end.toISOString().slice(0, 10);
}

/** MST: bo dau cach/cham/gach — "0 1 0 2-030-405" va "0102030405" la mot. */
export function normalizeTaxCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[^0-9-]/g, '').replace(/^-+|-+$/g, '');
  return /^\d{10}(-\d{3})?$/.test(cleaned) || /^\d{13}$/.test(cleaned) ? cleaned : null;
}

const lenient = (max: number) =>
  z
    .preprocess((v) => (typeof v === 'string' ? v.trim() : v), z.string().max(max).nullable())
    .catch(null);

/** Mo hinh co the bo han mot khoi — coi nhu khoi rong thay vi that bai ca phan hoi. */
const orEmpty = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v && typeof v === 'object' ? v : {}), schema);

const aiResponse = z.object({
  contract: orEmpty(
    z.object({
      name: lenient(300).default(null),
      number: lenient(100).default(null),
      value: z.unknown().default(null),
      currency: lenient(20).default(null),
      sign_date: z.unknown().default(null),
      start_date: z.unknown().default(null),
      end_date: z.unknown().default(null),
      duration_months: z.unknown().default(null),
      payment_terms: lenient(1000).default(null),
      is_signed: z.boolean().nullable().catch(null).default(null),
      auto_renew: z.boolean().nullable().catch(null).default(null),
    })
  ),
  customer: orEmpty(
    z.object({
      name: lenient(300).default(null),
      tax_code: z.unknown().default(null),
      address: lenient(500).default(null),
      phone: lenient(60).default(null),
      email: lenient(200).default(null),
      representative: lenient(200).default(null),
      representative_title: lenient(200).default(null),
    })
  ),
  summary: lenient(1500).default(null),
  key_points: z.array(z.string().max(400)).max(10).catch([]).default([]),
  risks: z.array(z.string().max(400)).max(10).catch([]).default([]),
  confidence: z.number().min(0).max(1).catch(0.5).default(0.5),
});

/* ---------- Ket qua tra cho giao dien ---------- */

export interface ContractExtraction {
  contract: {
    name: string;
    number: string;
    value_vnd: number;
    sign_date: string | null;
    start_date: string | null;
    end_date: string | null;
    payment_terms: string;
    /** De xuat — suy ra tu ngay thang + co da ky hay chua, nguoi dung van sua duoc. */
    status: 'draft' | 'signing' | 'active' | 'expired';
    auto_renew: boolean | null;
  };
  /** Ben doi tac trong hop dong (khong phai cong ty minh). */
  customer: {
    name: string;
    tax_code: string;
    address: string;
    phone: string;
    email: string;
    representative: string;
    representative_title: string;
  };
  customer_match: {
    id: number;
    name: string;
    reason: 'tax_code' | 'name';
  } | null;
  /** Gan dung nhung khong chac — de nguoi dung bam chon. */
  customer_candidates: { id: number; name: string; tax_code: string | null }[];
  suggested_deal_id: number | null;
  summary: string;
  key_points: string[];
  risks: string[];
  confidence: number;
  extraction: string;
  warnings: string[];
}

interface CustomerRow {
  id: number;
  name: string;
  tax_code: string | null;
}

/**
 * Khop khach hang theo MST truoc (chinh xac), roi theo ten da bo dau/bo tien to
 * phap nhan. Khop ten chi nhan khi TRUNG HAN — "gan giong" chi la ung vien de
 * nguoi dung chon, vi tu dong gan nham hop dong vao khach hang khac nguy hiem hon
 * viec tao them mot ban ghi.
 */
const LEGAL_PREFIX =
  /^(cong ty (co phan|tnhh|trach nhiem huu han|cp)?|tnhh|cty|ctcp|tap doan|ngan hang|doanh nghiep tu nhan|dntn)\s+/;

export function matchCustomer(
  rows: CustomerRow[],
  name: string | null,
  taxCode: string | null
): Pick<ContractExtraction, 'customer_match' | 'customer_candidates'> {
  if (taxCode) {
    const hit = rows.find((r) => normalizeTaxCode(r.tax_code) === taxCode);
    if (hit)
      return {
        customer_match: { id: hit.id, name: hit.name, reason: 'tax_code' },
        customer_candidates: [],
      };
  }
  if (!name) return { customer_match: null, customer_candidates: [] };
  const core = (s: string) => fold(s).replace(LEGAL_PREFIX, '').replace(LEGAL_PREFIX, '').trim();
  const needle = core(name);
  if (needle.length < 2) return { customer_match: null, customer_candidates: [] };
  const exact = rows.find((r) => core(r.name) === needle);
  if (exact)
    return {
      customer_match: { id: exact.id, name: exact.name, reason: 'name' },
      customer_candidates: [],
    };
  const candidates = rows
    .filter((r) => {
      const other = core(r.name);
      return other.length >= 3 && (other.includes(needle) || needle.includes(other));
    })
    .slice(0, 3);
  return { customer_match: null, customer_candidates: candidates };
}

function deriveStatus(
  signed: boolean | null,
  start: string | null,
  end: string | null,
  today: string
): ContractExtraction['contract']['status'] {
  if (end && end < today) return 'expired';
  if (signed === false) return 'signing';
  if (signed === true) return 'active';
  return start && start <= today ? 'active' : 'draft';
}

export interface ExtractInput {
  filePath: string;
  fileName: string;
  mime: string | null;
  size: number;
  /** Danh sach khach hang trong pham vi nguoi dung — de khop sau khi AI doc xong. */
  customers: CustomerRow[];
  /** Ten cong ty minh (org_kind='own') de AI biet ben nao la "ta". */
  ownNames: string[];
  today: string;
}

export async function extractContract(
  db: Database,
  input: ExtractInput
): Promise<ContractExtraction> {
  const warnings: string[] = [];
  const { text, method, reason } = await extractText(input.filePath, input.mime, input.fileName);
  const usable = text.trim().length >= MIN_USEFUL_CHARS;

  let attachments: { mime: string; dataBase64: string; fileName: string }[] | undefined;
  if (!usable) {
    if (reason) warnings.push(reason);
    if (input.size > MAX_ATTACHMENT_BYTES) {
      throw new Error(
        'Không đọc được chữ trong tệp và tệp quá lớn (>10 MB) để gửi AI đọc trực tiếp.'
      );
    }
    attachments = [
      {
        mime: input.mime ?? 'application/octet-stream',
        dataBase64: fs.readFileSync(input.filePath).toString('base64'),
        fileName: input.fileName,
      },
    ];
    warnings.push('Không tách được chữ (có thể là bản scan) nên đã gửi tệp cho AI đọc trực tiếp.');
  }

  const own = input.ownNames.length
    ? `Công ty của người dùng (KHÔNG phải đối tác): ${input.ownNames.join('; ')}.\n`
    : '';

  const { data, meta } = await runStructured(
    db,
    {
      task: 'contract_extract',
      mode: 'balanced',
      contextType: 'contract',
      maxOutputTokens: 2000,
      timeoutMs: 120_000,
      requiresCapability: attachments ? 'documentInput' : undefined,
      attachments,
      system:
        'Bạn đọc hợp đồng kinh doanh tiếng Việt và trích xuất thông tin có cấu trúc. Chỉ dùng thông tin có ' +
        'trong văn bản, không suy đoán; không thấy thì để null. Ngày phải đúng YYYY-MM-DD. ' +
        'Chỉ trả về một đối tượng JSON.',
      prompt:
        own +
        'Xác định bên ĐỐI TÁC (khách hàng) — bên còn lại trong hợp đồng, không phải công ty của người dùng. ' +
        'Nếu không rõ công ty nào là của người dùng thì lấy bên mua/bên sử dụng dịch vụ (thường là Bên A).\n' +
        'Trả JSON đúng cấu trúc:\n' +
        '{"contract":{"name":"tên/tiêu đề hợp đồng","number":"số hợp đồng","value":"tổng giá trị hợp đồng (số, gồm VAT nếu ghi tổng)",' +
        '"currency":"VND|USD|...","sign_date":null,"start_date":null,"end_date":null,"duration_months":null,' +
        '"payment_terms":"tóm tắt tiến độ/điều khoản thanh toán","is_signed":true,"auto_renew":null},' +
        '"customer":{"name":"tên pháp nhân đầy đủ","tax_code":"mã số thuế","address":null,"phone":null,"email":null,' +
        '"representative":"người đại diện ký","representative_title":"chức vụ"},' +
        '"summary":"tóm tắt 2-3 câu phạm vi/đối tượng hợp đồng",' +
        '"key_points":["điều khoản quan trọng: SLA, bảo hành, bảo mật, gia hạn…"],' +
        '"risks":["điều khoản cần lưu ý: phạt vi phạm, tự động gia hạn, đơn phương chấm dứt, giới hạn trách nhiệm…"],' +
        '"confidence":0.0}\n' +
        '"is_signed" = văn bản có dấu hiệu đã ký/đóng dấu hay chỉ là bản dự thảo. ' +
        '"duration_months" chỉ điền khi hợp đồng nêu thời hạn mà không có ngày kết thúc cụ thể.\n' +
        `Tên tệp: ${input.fileName}\n` +
        (usable
          ? `Nội dung (đã trích bằng ${method}):\n${text.slice(0, MAX_PROMPT_CHARS)}`
          : 'Nội dung tệp được gửi kèm.'),
    },
    aiResponse
  );

  const c = data.contract;
  const sign = normalizeDate(c.sign_date);
  const start = normalizeDate(c.start_date);
  let end = normalizeDate(c.end_date);
  const months = Number(c.duration_months);
  if (!end && start && months > 0) {
    end = addMonthsMinusOneDay(start, Math.round(months));
    if (end)
      warnings.push(`Ngày kết thúc được tính từ thời hạn ${months} tháng — hãy kiểm tra lại.`);
  }
  let endFinal = end;
  if (start && endFinal && endFinal < start) {
    warnings.push(`AI đọc ngày kết thúc (${endFinal}) trước ngày bắt đầu nên đã bỏ trống ô này.`);
    endFinal = null;
  }

  let value = normalizeMoney(c.value);
  const currency = (c.currency ?? 'VND').toUpperCase().replace(/Đ/g, 'D');
  if (value > 0 && currency && !/^(VND|VNĐ|DONG|D)$/.test(currency)) {
    warnings.push(`Giá trị hợp đồng tính bằng ${currency}, không phải VND — hãy nhập lại quy đổi.`);
    value = 0;
  }

  const taxCode = normalizeTaxCode(data.customer.tax_code);
  const customerName = data.customer.name ?? '';
  const match = matchCustomer(input.customers, customerName || null, taxCode);
  if (!customerName && !taxCode)
    warnings.push('AI không xác định được bên khách hàng trong hợp đồng.');

  return {
    contract: {
      name: c.name ?? '',
      number: c.number ?? '',
      value_vnd: value,
      sign_date: sign,
      start_date: start,
      end_date: endFinal,
      payment_terms: c.payment_terms ?? '',
      status: deriveStatus(c.is_signed, start, endFinal, input.today),
      auto_renew: c.auto_renew,
    },
    customer: {
      name: customerName,
      tax_code: taxCode ?? '',
      address: data.customer.address ?? '',
      phone: data.customer.phone ?? '',
      email: data.customer.email ?? '',
      representative: data.customer.representative ?? '',
      representative_title: data.customer.representative_title ?? '',
    },
    ...match,
    suggested_deal_id: null,
    summary: data.summary ?? '',
    key_points: data.key_points,
    risks: data.risks,
    confidence: data.confidence,
    extraction: `${method}${attachments ? '+file' : ''} · ${meta.provider}`,
    warnings,
  };
}
