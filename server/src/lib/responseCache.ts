import type { NextFunction, Request, RequestHandler, Response } from 'express';

/*
 * Luu dem ket qua cac man tong hop nang (1.22.0) — Tong quan, Bao cao, Suc khoe
 * pipeline, Doanh thu tong hop / KPI / so sanh.
 *
 * Cac man nay cong don tren TOAN BO du lieu; them chi muc khong lam chung nhanh hon.
 * Da chot (docs/PLAN-TINH-TRUOC-LUU-DEM.md, muc 6): chap nhan so cu toi 5 phut, va co
 * nut "Lam moi" de tinh lai ngay.
 *
 * Luat:
 *  - Khoa theo NGUOI DUNG + duong dan + query. Moi nguoi mot ban rieng nen khong the
 *    lo so lieu giua hai pham vi du lieu khac nhau.
 *  - Nguoi dung vua ghi (POST/PUT/PATCH/DELETE thanh cong) thi ban dem cua CHINH ho bi
 *    bo: sua xong quay lai Tong quan phai thay ngay thay doi cua minh. Thay doi cua
 *    nguoi khac hien sau toi da 5 phut, hoac khi bam Lam moi.
 *  - Doi quyen / so do to chuc thi bo toan bo dem (pham vi xem co the da doi).
 *  - `?fresh=1` bo qua dem, toi da mot lan moi 10 giay cho moi khoa.
 *  - Ket qua lon hon 2 MB khong luu — giu RAM may chu on dinh voi 100 nguoi dung.
 *  - Phan hoi dang object duoc gan them `computed_at` (ISO) de man hinh ghi
 *    "Cập nhật lúc HH:mm".
 */

export const CACHE_TTL_MS = 5 * 60_000;
const FRESH_MIN_INTERVAL_MS = 10_000;
const MAX_ENTRY_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;

interface Entry {
  storedAt: number;
  body: string;
}

/** Map giu thu tu chen: entry cu nhat nam dau, de don khi vuot gioi han. */
const entries = new Map<string, Entry>();
let totalBytes = 0;
const lastWriteAt = new Map<string, number>();
const lastFreshAt = new Map<string, number>();

/** Duong dan ma ghi vao do co the doi pham vi xem cua nguoi khac. */
const ACCESS_PATHS = ['/api/users', '/api/positions', '/api/org-units'];

function userKeyOf(req: Request): string {
  const id = req.session?.userId;
  return id == null ? 'anon' : `u${id}`;
}

function cacheKey(req: Request): string {
  const query = Object.entries(req.query)
    .filter(([name]) => name !== 'fresh')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${name}=${String(value)}`)
    .join('&');
  return `${userKeyOf(req)} ${req.baseUrl}${req.path}?${query}`;
}

function remove(key: string): void {
  const entry = entries.get(key);
  if (!entry) return;
  totalBytes -= entry.body.length;
  entries.delete(key);
}

export function clearResponseCache(): void {
  entries.clear();
  totalBytes = 0;
  lastWriteAt.clear();
  lastFreshAt.clear();
}

/**
 * Ghi nhan moi lan ghi thanh cong. Mount MOT lan o cap app, truoc cac router.
 */
export function trackWrites(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next();
    return;
  }
  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    if (ACCESS_PATHS.some((prefix) => req.originalUrl.startsWith(prefix))) {
      entries.clear();
      totalBytes = 0;
      return;
    }
    lastWriteAt.set(userKeyOf(req), Date.now());
  });
  next();
}

/**
 * Tat bang `WORKFLOW_RESPONSE_CACHE=off` — bo test chung dat co nay vi nhieu test chen
 * thang vao CSDL (khong qua HTTP) roi doc lai. Doc moi request de test rieng cua lop
 * dem bat lai duoc.
 */
function cacheEnabled(): boolean {
  return process.env.WORKFLOW_RESPONSE_CACHE !== 'off';
}

/** Middleware cho tung route GET can luu dem. */
export const cacheResponse: RequestHandler = (req, res, next) => {
  if (!cacheEnabled()) {
    next();
    return;
  }
  const key = cacheKey(req);
  const userKey = userKeyOf(req);
  const now = Date.now();

  /* Gioi han theo tung khoa: mot lan bam Lam moi tinh lai ca cac phan cua trang
     (vd tong hop + KPI doanh thu) cung luc, nhung bam lien tuc thi khong. */
  let fresh = req.query.fresh === '1';
  if (fresh) {
    const last = lastFreshAt.get(key) ?? 0;
    if (now - last < FRESH_MIN_INTERVAL_MS) fresh = false;
    else lastFreshAt.set(key, now);
  }

  const hit = entries.get(key);
  if (
    hit &&
    !fresh &&
    now - hit.storedAt < CACHE_TTL_MS &&
    hit.storedAt > (lastWriteAt.get(userKey) ?? 0)
  ) {
    res.setHeader('X-Cache', 'hit');
    res.type('application/json').send(hit.body);
    return;
  }
  if (hit) remove(key);

  const json = res.json.bind(res);
  res.json = (body: unknown) => {
    const payload =
      body !== null && typeof body === 'object' && !Array.isArray(body)
        ? { ...(body as Record<string, unknown>), computed_at: new Date().toISOString() }
        : body;
    if (res.statusCode < 400) {
      const text = JSON.stringify(payload);
      if (text.length <= MAX_ENTRY_BYTES) {
        entries.set(key, { storedAt: Date.now(), body: text });
        totalBytes += text.length;
        for (const [oldKey] of entries) {
          if (totalBytes <= MAX_TOTAL_BYTES) break;
          remove(oldKey);
        }
      }
    }
    res.setHeader('X-Cache', 'miss');
    return json(payload);
  };
  next();
};
