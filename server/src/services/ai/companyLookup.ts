import { z } from 'zod';
import type { Database } from 'better-sqlite3';
import { fold } from '../../lib/viSearch.ts';
import { normalizeTaxCode } from './contractExtract.ts';
import { runStructured } from './gateway.ts';
import {
  AiProviderError,
  WEB_SEARCH_PROVIDERS,
  type AiRunRequest,
  type AiRunResult,
  type WebSource,
} from './types.ts';

/*
 * Goi y dien ho so khach hang tu MA SO THUE hoac TEN.
 *
 * Hai nguon, do tin cay khac han nhau:
 *  - CSDL dang ky doanh nghiep (tra theo MST): ten phap ly, ten quoc te, ten viet
 *    tat, dia chi tru so. Day la du lieu THAT — duoc uu tien va danh dau "registry".
 *  - Mo hinh AI: nganh nghe, quy mo, website... tu kien thuc cua mo hinh. Co the
 *    sai hoac cu, nen luon danh dau "ai" de giao dien nhac nguoi dung kiem lai.
 *
 * MST do AI "nho" ra khi chi go ten la thu nguy hiem nhat: mot MST sai se chan
 * nham ho so that sau nay (MST la khoa chong trung). Vi vay MST do AI goi y phai
 * tra lai duoc trong CSDL dang ky moi duoc giu.
 */

export const CUSTOMER_FIELDS = [
  'name',
  'short_name',
  'tax_code',
  'industry',
  'address',
  'website',
  'phone',
  'email',
  'size',
  'notes',
] as const;
export type CustomerField = (typeof CUSTOMER_FIELDS)[number];

/** Trung voi ACCOUNT_SIZES o client — ngoai danh sach thi bo, khong ep. */
const ACCOUNT_SIZES = ['SME', 'Mid-market', 'Enterprise'];

export interface RegistryRecord {
  tax_code: string;
  name: string;
  international_name: string | null;
  short_name: string | null;
  address: string | null;
}

export type RegistryLookup =
  | { status: 'found'; record: RegistryRecord }
  | { status: 'not_found' }
  /** Tat bang cau hinh, mat mang, het gio — KHONG duoc hieu la "MST khong ton tai". */
  | { status: 'unavailable' };

const DEFAULT_REGISTRY_URL = 'https://api.vietqr.io/v2/business';

/** `WORKFLOW_TAX_LOOKUP_URL=off` de tat han (vd. may chu khong ra Internet). */
function registryBaseUrl(): string | null {
  const configured = process.env.WORKFLOW_TAX_LOOKUP_URL?.trim();
  if (configured === 'off') return null;
  return (configured || DEFAULT_REGISTRY_URL).replace(/\/$/, '');
}

const registryResponse = z.object({
  code: z.string(),
  data: z
    .object({
      id: z.string().optional(),
      name: z.string().optional(),
      internationalName: z.string().nullable().optional(),
      shortName: z.string().nullable().optional(),
      address: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});

const clean = (value: string | null | undefined): string | null => {
  const trimmed = value?.replace(/\s+/g, ' ').trim();
  return trimmed ? trimmed : null;
};

/** Tra CSDL dang ky doanh nghiep (API cong khai VietQR) theo MST. */
export async function lookupBusinessRegistry(taxCode: string): Promise<RegistryLookup> {
  const base = registryBaseUrl();
  if (!base) return { status: 'unavailable' };
  try {
    const res = await fetch(`${base}/${encodeURIComponent(taxCode)}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404) return { status: 'not_found' };
    if (!res.ok) return { status: 'unavailable' };
    const body = registryResponse.parse(await res.json());
    const name = clean(body.data?.name);
    if (body.code !== '00' || !name) return { status: 'not_found' };
    return {
      status: 'found',
      record: {
        tax_code: clean(body.data?.id) ?? taxCode,
        name,
        international_name: clean(body.data?.internationalName),
        short_name: clean(body.data?.shortName),
        address: clean(body.data?.address),
      },
    };
  } catch {
    return { status: 'unavailable' };
  }
}

/** Mo hinh tra chuoi rong, "N/A", "không rõ"... deu coi la khong biet. */
const loose = (max: number) =>
  z
    .preprocess((v) => {
      if (typeof v !== 'string') return null;
      const trimmed = v.trim();
      return /^(n\/?a|null|none|unknown|không rõ|chưa rõ|không có|-)?$/i.test(trimmed)
        ? null
        : trimmed.slice(0, max);
    }, z.string().nullable())
    .catch(null);

const aiCompanySchema = z.object({
  name: loose(300),
  short_name: loose(100),
  tax_code: loose(30),
  industry: loose(200),
  address: loose(500),
  website: loose(200),
  phone: loose(50),
  email: loose(200),
  size: loose(30),
  notes: loose(1500),
  confidence: z.number().min(0).max(1).catch(0.5),
  rationale: loose(1000),
});
type AiCompany = z.infer<typeof aiCompanySchema>;

export type CustomerSuggestion = Partial<Record<CustomerField, string>>;

export interface CustomerAssistResult {
  suggestion: CustomerSuggestion;
  /** Nguon cua tung truong: `registry` da xac thuc, `ai` can kiem tra lai. */
  sources: Partial<Record<CustomerField, 'registry' | 'ai'>>;
  registry: RegistryRecord | null;
  warnings: string[];
  confidence: number | null;
  rationale: string;
  /** Mo hinh co thuc su tim tren web khong, va cac trang da dung lam can cu. */
  web_searched: boolean;
  web_sources: WebSource[];
  meta: AiRunResult | null;
}

export function normalizeWebsite(value: string | null): string | null {
  if (!value) return null;
  const host = value
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/[/?#].*$/, '')
    .toLowerCase();
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
}

function normalizeEmail(value: string | null): string | null {
  const email = value?.trim().toLowerCase();
  return email && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(email) ? email : null;
}

function normalizePhone(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/[^\d+]/g, '');
  return /^\+?\d{8,15}$/.test(digits) ? value.trim() : null;
}

function normalizeSize(value: string | null): string | null {
  if (!value) return null;
  return ACCOUNT_SIZES.find((size) => size.toLowerCase() === value.trim().toLowerCase()) ?? null;
}

/** Bo hinh thuc phap ly de so ten ma khong bi "Cong ty TNHH" lam lech. */
function coreName(value: string): string {
  return fold(value)
    .replace(
      /\b(cong ty|ctcp|cty|cp|tnhh|co phan|mot thanh vien|mtv|tap doan|chi nhanh|jsc|co\.?,? ?ltd|ltd|company|corporation|corp)\b/g,
      ' '
    )
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Ten AI doan co chi dung doanh nghiep trong CSDL khong.
 *
 * Chi mot chieu: moi tu cua ten AI phai co trong ten dang ky (hoac ten quoc te /
 * viet tat). Chieu nguoc lai se nhan nham cong ty me — "FPT" nam tron trong
 * "FPT Software" nhung MST cua FPT khong phai cua FPT Software.
 */
export function namesLikelyMatch(aiName: string, record: RegistryRecord): boolean {
  const wanted = coreName(aiName).split(' ').filter(Boolean);
  if (wanted.length === 0) return false;
  return [record.name, record.international_name, record.short_name].some((candidate) => {
    if (!candidate) return false;
    const have = new Set(coreName(candidate).split(' '));
    return wanted.every((word) => have.has(word));
  });
}

function buildPrompt(
  query: string,
  taxCode: string | null,
  registry: RegistryRecord | null,
  webSearch: boolean
) {
  const today = new Date().toISOString().slice(0, 10);
  return [
    'Hãy điền hồ sơ doanh nghiệp (khách hàng B2B tại Việt Nam) theo JSON:',
    '{"name":"tên pháp lý đầy đủ","short_name":"tên viết tắt / thương hiệu","tax_code":"mã số thuế 10 hoặc 13 số","industry":"ngành nghề chính, ngắn gọn","address":"địa chỉ trụ sở","website":"tên miền","phone":"điện thoại tổng đài","email":"email liên hệ chung","size":"SME | Mid-market | Enterprise","notes":"2-3 câu giới thiệu doanh nghiệp hữu ích cho người bán hàng","confidence":0.0,"rationale":"căn cứ ngắn gọn"}',
    webSearch
      ? 'Bạn ĐƯỢC PHÉP tìm trên web khi kiến thức sẵn có chưa đủ hoặc cần xác minh (ưu tiên website chính thức của doanh nghiệp, cổng đăng ký kinh doanh, trang tra cứu MST). Không cần tìm nếu đã biết chắc.'
      : '',
    'Quy tắc: chỉ điền khi bạn khá chắc chắn hoặc thấy trong nguồn; không biết thì để null. TUYỆT ĐỐI không bịa số điện thoại, email, website hay mã số thuế.',
    'Sau cùng chỉ trả về DUY NHẤT một đối tượng JSON, không kèm lời dẫn.',
    'size: SME (< 200 nhân sự), Mid-market (200–1000), Enterprise (> 1000 hoặc tập đoàn lớn).',
    `Hôm nay: ${today}.`,
    taxCode ? `Mã số thuế người dùng nhập: ${taxCode}` : `Người dùng nhập: ${query}`,
    registry
      ? `Dữ liệu ĐÃ XÁC THỰC từ cơ sở dữ liệu đăng ký doanh nghiệp (giữ nguyên tên, MST, địa chỉ; dùng để suy ra ngành nghề, quy mô, website):\n${JSON.stringify(registry)}`
      : taxCode
        ? 'Không tra được MST này trong cơ sở dữ liệu đăng ký doanh nghiệp — nếu không biết chắc doanh nghiệp nào mang MST này thì để các trường null.'
        : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Ghep ket qua: du lieu dang ky de len du lieu AI o cac truong ma no co.
 * Tach rieng (thuan) de test duoc khong can mang hay mo hinh.
 */
export function mergeSuggestion(
  ai: AiCompany | null,
  registry: RegistryRecord | null
): Pick<CustomerAssistResult, 'suggestion' | 'sources'> {
  const suggestion: CustomerSuggestion = {};
  const sources: CustomerAssistResult['sources'] = {};
  const put = (field: CustomerField, value: string | null, source: 'registry' | 'ai') => {
    if (!value) return;
    suggestion[field] = value;
    sources[field] = source;
  };

  if (ai) {
    put('name', ai.name, 'ai');
    put('short_name', ai.short_name, 'ai');
    put('tax_code', normalizeTaxCode(ai.tax_code), 'ai');
    put('industry', ai.industry, 'ai');
    put('address', ai.address, 'ai');
    put('website', normalizeWebsite(ai.website), 'ai');
    put('phone', normalizePhone(ai.phone), 'ai');
    put('email', normalizeEmail(ai.email), 'ai');
    put('size', normalizeSize(ai.size), 'ai');
    put('notes', ai.notes, 'ai');
  }
  if (registry) {
    put('name', registry.name, 'registry');
    put('tax_code', registry.tax_code, 'registry');
    put('short_name', registry.short_name, 'registry');
    put('address', registry.address, 'registry');
  }
  return { suggestion, sources };
}

export async function assistCustomer(
  db: Database,
  query: string,
  options: { webSearch?: boolean } = {}
): Promise<CustomerAssistResult> {
  const webSearch = options.webSearch ?? false;
  const warnings: string[] = [];
  const typedTaxCode = /^[\d\s.-]+$/.test(query) ? normalizeTaxCode(query) : null;
  if (/^[\d\s.-]+$/.test(query) && !typedTaxCode) {
    warnings.push('Mã số thuế phải gồm 10 chữ số (hoặc 10 số kèm "-xxx" cho chi nhánh).');
  }

  let registry: RegistryRecord | null = null;
  if (typedTaxCode) {
    const lookup = await lookupBusinessRegistry(typedTaxCode);
    if (lookup.status === 'found') registry = lookup.record;
    else if (lookup.status === 'not_found') {
      warnings.push(`Không tìm thấy MST ${typedTaxCode} trong cơ sở dữ liệu đăng ký doanh nghiệp.`);
    } else {
      warnings.push('Chưa tra được cơ sở dữ liệu đăng ký doanh nghiệp — chỉ có gợi ý của AI.');
    }
  }

  let ai: AiCompany | null = null;
  let meta: AiRunResult | null = null;
  const run = (withWeb: boolean) => {
    const request: AiRunRequest = {
      task: 'customer_assist',
      mode: 'fast',
      contextType: 'customer',
      system:
        'Bạn là trợ lý tra cứu thông tin doanh nghiệp Việt Nam cho CRM B2B. Chỉ dùng thông tin bạn biết chắc, tìm thấy trong nguồn, hoặc dữ liệu được cung cấp; không bịa. Trả JSON hợp lệ.',
      prompt: buildPrompt(query, typedTaxCode, registry, withWeb),
      maxOutputTokens: withWeb ? 2500 : 1200,
      webSearch: withWeb,
      // Tim web cham hon nhieu so voi tra loi tu kien thuc san co.
      timeoutMs: withWeb ? 90_000 : undefined,
    };
    return runStructured(db, request, aiCompanySchema);
  };
  try {
    let result: Awaited<ReturnType<typeof run>>;
    try {
      result = await run(webSearch);
    } catch (error) {
      /* Tim web co the bi tu choi rieng (to chuc chua bat web search, model khong ho
         tro cong cu...). Loi cau hinh/quota thi thu lai cung vo ich. */
      const hopeless =
        error instanceof AiProviderError &&
        (error.code === 'not_configured' || /quota/.test(error.code));
      if (!webSearch || hopeless) throw error;
      result = await run(false);
      warnings.push('Không tìm được trên web — gợi ý chỉ dựa trên kiến thức sẵn có của AI.');
    }
    ai = result.data;
    meta = result.meta;
  } catch (error) {
    // Da co du lieu dang ky thi van tra ve duoc — AI chi la phan bo sung.
    if (!registry) throw error;
    warnings.push(
      error instanceof AiProviderError && error.code === 'not_configured'
        ? 'Chưa cấu hình AI — chỉ điền được thông tin từ cơ sở dữ liệu đăng ký.'
        : 'AI không phản hồi — chỉ điền được thông tin từ cơ sở dữ liệu đăng ký.'
    );
  }
  if (webSearch && meta && !WEB_SEARCH_PROVIDERS.includes(meta.provider)) {
    warnings.push(
      `Nhà cung cấp ${meta.provider} không hỗ trợ tìm web — gợi ý chỉ dựa trên kiến thức sẵn có.`
    );
  }

  // MST do AI goi y (nguoi dung chi go ten): phai doi chieu duoc moi giu.
  const aiTaxCode = normalizeTaxCode(ai?.tax_code ?? null);
  if (ai && !registry && aiTaxCode && aiTaxCode !== typedTaxCode) {
    const lookup = await lookupBusinessRegistry(aiTaxCode);
    if (lookup.status === 'found' && namesLikelyMatch(ai.name ?? query, lookup.record)) {
      registry = lookup.record;
    } else if (lookup.status === 'found' || lookup.status === 'not_found') {
      ai = { ...ai, tax_code: null };
      warnings.push(
        lookup.status === 'found'
          ? `AI gợi ý MST ${aiTaxCode} nhưng MST này thuộc "${lookup.record.name}" — đã bỏ.`
          : `AI gợi ý MST ${aiTaxCode} nhưng không tra được trong cơ sở dữ liệu — đã bỏ.`
      );
    } else {
      warnings.push(
        `MST ${aiTaxCode} do AI gợi ý chưa được xác minh — hãy kiểm tra trước khi lưu.`
      );
    }
  }

  const merged = mergeSuggestion(ai, registry);
  if (Object.keys(merged.suggestion).length === 0) {
    warnings.push('Không tìm thấy thông tin đủ tin cậy về doanh nghiệp này.');
  }
  return {
    ...merged,
    registry,
    warnings,
    confidence: ai ? ai.confidence : null,
    rationale: ai?.rationale ?? '',
    web_searched: meta?.webSearched ?? false,
    web_sources: meta?.webSources ?? [],
    meta,
  };
}
