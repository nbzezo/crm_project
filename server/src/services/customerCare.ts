import type { Database } from 'better-sqlite3';
import { z } from 'zod';

/*
 * Ho so khach hang 360° (v54): cham soc, goi y co hoi va dong thoi gian gop.
 *
 * Moi thu o day TINH tu du lieu da co (tuong tac, hop dong, dich vu, bao gia, co
 * hoi). Chi `customer_suggestions` duoc luu — de nho goi y nao da nhan/bo qua
 * (khong hien lai) va do duoc ti le chap nhan.
 */

/** Ngay sinh nguoi lien he: 'MM-DD' (khong biet nam) hoac 'YYYY-MM-DD'; chuoi rong = xoa. */
export const birthdaySchema = z
  .string()
  .trim()
  .regex(
    /^(\d{4}-)?(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$|^$/,
    'Ngày sinh dạng MM-DD hoặc YYYY-MM-DD'
  )
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional();

/* ---------- Hang cham soc & nhip lien he ---------- */

export const CARE_TIERS = ['vip', 'key', 'standard', 'low'] as const;
export type CareTier = (typeof CARE_TIERS)[number];

/** So ngay toi da giua hai lan lien he, theo hang. 'standard' = nguong cu cua Trong tam. */
export const TIER_CADENCE_DAYS: Record<CareTier, number> = {
  vip: 14,
  key: 21,
  standard: 30,
  low: 90,
};

/** Cung cong thuc trong SQL — dung o tab Trong tam de khong phai nap tung khach. */
export function cadenceSql(alias = 'c'): string {
  return `COALESCE(${alias}.care_cadence_days,
    CASE ${alias}.care_tier WHEN 'vip' THEN ${TIER_CADENCE_DAYS.vip}
                            WHEN 'key' THEN ${TIER_CADENCE_DAYS.key}
                            WHEN 'low' THEN ${TIER_CADENCE_DAYS.low}
                            ELSE ${TIER_CADENCE_DAYS.standard} END)`;
}

export function cadenceOf(tier: string | null | undefined, custom: number | null | undefined) {
  if (custom && custom > 0) return { days: custom, source: 'custom' as const };
  const known = (CARE_TIERS as readonly string[]).includes(tier ?? '')
    ? (tier as CareTier)
    : 'standard';
  return { days: TIER_CADENCE_DAYS[known], source: 'tier' as const };
}

/* ---------- Ngay thang (chuoi YYYY-MM-DD theo gio dia phuong) ---------- */

export function todayOf(db: Database): string {
  return (db.prepare(`SELECT date('now','localtime') AS d`).get() as { d: string }).d;
}

export function addDaysStr(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetweenStr(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) /
      86_400_000
  );
}

/** 'MM-DD' hoac 'YYYY-MM-DD' -> [thang, ngay], null neu khong doc duoc. */
export function monthDayOf(value: string | null | undefined): [number, number] | null {
  const match = /^(?:\d{4}-)?(\d{2})-(\d{2})$/.exec(value?.trim() ?? '');
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return [month, day];
}

/**
 * Cac lan lap lai hang nam cua mot ngay (thang-ngay) roi vao [from, to].
 * Khoang co the vat qua nam moi (tuan cuoi thang 12), nen xet ca hai nam.
 * 29/02 o nam khong nhuan duoc tinh la 28/02 — van nhac, khong bo sot.
 */
export function occurrencesIn(md: [number, number], from: string, to: string): string[] {
  const out: string[] = [];
  const startYear = Number(from.slice(0, 4));
  const endYear = Number(to.slice(0, 4));
  for (let year = startYear; year <= endYear; year += 1) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const day = md[0] === 2 && md[1] === 29 && !leap ? 28 : md[1];
    const date = `${year}-${String(md[0]).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (date >= from && date <= to) out.push(date);
  }
  return out;
}

/* ---------- Tinh trang cham soc cua mot khach ---------- */

export interface CareStatus {
  tier: CareTier;
  cadence_days: number;
  cadence_source: 'tier' | 'custom';
  last_contact_at: string | null;
  next_contact_due: string;
  /** > 0: tre bao nhieu ngay so voi nhip; <= 0: con bao nhieu ngay. */
  days_overdue: number;
  state: 'ok' | 'due_soon' | 'overdue' | 'never';
}

export function careStatusOf(
  db: Database,
  customer: {
    id: number;
    care_tier?: string | null;
    care_cadence_days?: number | null;
    created_at: string;
  }
): CareStatus {
  const today = todayOf(db);
  const cadence = cadenceOf(customer.care_tier, customer.care_cadence_days);
  const last = (
    db
      .prepare(`SELECT MAX(occurred_at) AS at FROM interactions WHERE customer_id = ?`)
      .get(customer.id) as { at: string | null }
  ).at;
  const base = (last ?? customer.created_at).slice(0, 10);
  const due = addDaysStr(base, cadence.days);
  const overdue = daysBetweenStr(due, today);
  return {
    tier: (CARE_TIERS as readonly string[]).includes(customer.care_tier ?? '')
      ? (customer.care_tier as CareTier)
      : 'standard',
    cadence_days: cadence.days,
    cadence_source: cadence.source,
    last_contact_at: last,
    next_contact_due: due,
    days_overdue: overdue,
    state:
      !last && overdue > 0 ? 'never' : overdue > 0 ? 'overdue' : overdue >= -3 ? 'due_soon' : 'ok',
  };
}

/* ---------- Nguy co mat khach (diem tinh, khong can AI) ---------- */

export interface ChurnRisk {
  score: number;
  level: 'low' | 'medium' | 'high';
  factors: string[];
}

export function churnRiskOf(db: Database, customerId: number, care: CareStatus): ChurnRisk {
  const today = todayOf(db);
  const factors: string[] = [];
  let score = 0;

  if (care.days_overdue > 0) {
    const weight = Math.min(35, Math.round((care.days_overdue / care.cadence_days) * 20) + 10);
    score += weight;
    factors.push(
      care.last_contact_at
        ? `Quá nhịp liên hệ ${care.days_overdue} ngày (nhịp ${care.cadence_days} ngày)`
        : 'Chưa từng ghi nhận tương tác'
    );
  }

  const expiring = db
    .prepare(
      `SELECT COUNT(*) AS n FROM contracts k
        WHERE k.customer_id = ? AND k.status = 'active' AND k.end_date IS NOT NULL
          AND k.end_date BETWEEN ? AND ?
          AND NOT EXISTS (SELECT 1 FROM deals d WHERE d.customer_id = k.customer_id
                           AND d.is_renewal = 1 AND d.stage_category = 'open')`
    )
    .get(customerId, today, addDaysStr(today, 60)) as { n: number };
  if (expiring.n > 0) {
    score += 25;
    factors.push(`${expiring.n} hợp đồng hết hạn trong 60 ngày chưa có cơ hội gia hạn`);
  }

  const year = Number(today.slice(0, 4));
  const ytdPeriod = today.slice(0, 7);
  const lastYearSame = `${year - 1}${ytdPeriod.slice(4)}`;
  const revenue = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN r.period BETWEEN ? AND ? THEN r.amount_vnd END), 0) AS this_year,
         COALESCE(SUM(CASE WHEN r.period BETWEEN ? AND ? THEN r.amount_vnd END), 0) AS last_year
         FROM service_revenues r JOIN customer_services cs ON cs.id = r.line_id
        WHERE cs.customer_id = ?`
    )
    .get(`${year}-01`, ytdPeriod, `${year - 1}-01`, lastYearSame, customerId) as {
    this_year: number;
    last_year: number;
  };
  if (revenue.last_year > 0 && revenue.this_year < revenue.last_year * 0.8) {
    const drop = Math.round((1 - revenue.this_year / revenue.last_year) * 100);
    score += drop >= 50 ? 25 : 15;
    factors.push(`Doanh thu từ đầu năm giảm ${drop}% so với cùng kỳ năm trước`);
  }

  const stopped = db
    .prepare(
      `SELECT COUNT(*) AS n FROM customer_services
        WHERE customer_id = ? AND status IN ('stopped','paused')
          AND substr(updated_at,1,10) >= ?`
    )
    .get(customerId, addDaysStr(today, -90)) as { n: number };
  if (stopped.n > 0) {
    score += 15;
    factors.push(`${stopped.n} dịch vụ ngừng/tạm dừng trong 90 ngày qua`);
  }

  const lost = db
    .prepare(
      `SELECT COUNT(*) AS n FROM deals WHERE customer_id = ? AND stage_category = 'lost'
          AND substr(COALESCE(closed_at, updated_at),1,10) >= ?`
    )
    .get(customerId, addDaysStr(today, -90)) as { n: number };
  if (lost.n > 0) {
    score += 10;
    factors.push(`${lost.n} cơ hội thua trong 90 ngày qua`);
  }

  const overdueTasks = db
    .prepare(
      `SELECT COUNT(*) AS n FROM cards WHERE customer_id = ? AND is_done = 0 AND is_archived = 0
          AND due_date IS NOT NULL AND substr(due_date,1,10) < ?`
    )
    .get(customerId, today) as { n: number };
  if (overdueTasks.n > 0) {
    score += Math.min(15, overdueTasks.n * 5);
    factors.push(`${overdueTasks.n} công việc quá hạn với khách`);
  }

  score = Math.min(100, score);
  return { score, level: score >= 50 ? 'high' : score >= 25 ? 'medium' : 'low', factors };
}

/* ---------- Goi y co hoi ---------- */

export type SuggestionKind =
  'renewal' | 'cross_sell' | 'reopen_quote' | 'reopen_lost' | 'aftercare';

interface Candidate {
  kind: SuggestionKind;
  key: string;
  title: string;
  reason: string;
  value_vnd: number;
  service_id?: number | null;
  contract_id?: number | null;
  quotation_id?: number | null;
  source_deal_id?: number | null;
  customer_service_id?: number | null;
}

/** Cac buoc cham soc sau ban: so ngay sau ngay chot va viec can lam. */
export const AFTERCARE_STEPS = [
  { day: 7, title: 'Hỏi thăm sau khi triển khai, ghi nhận vướng mắc ban đầu' },
  { day: 30, title: 'Đánh giá mức độ hài lòng sau 1 tháng sử dụng' },
  { day: 90, title: 'Tổng kết giá trị mang lại, mở hướng mở rộng / giới thiệu' },
] as const;

const RENEWAL_WINDOW_DAYS = 90;
const LOST_REOPEN_AFTER_DAYS = 180;

function candidatesFor(db: Database, customerId: number): Candidate[] {
  const today = todayOf(db);
  const out: Candidate[] = [];
  const customer = db
    .prepare(`SELECT id, industry, size FROM customers WHERE id = ?`)
    .get(customerId) as { id: number; industry: string | null; size: string | null };

  /* 1) Gia han hop dong: con hieu luc, het han trong 90 ngay (hoac vua het <= 30
        ngay), chua co co hoi gia han dang mo. */
  const contracts = db
    .prepare(
      `SELECT k.id, k.name, k.end_date, k.value_vnd FROM contracts k
        WHERE k.customer_id = ? AND k.status IN ('active','expired') AND k.end_date IS NOT NULL
          AND k.end_date BETWEEN ? AND ?
          AND NOT EXISTS (SELECT 1 FROM deals d WHERE d.customer_id = k.customer_id
                           AND d.is_renewal = 1 AND d.stage_category = 'open'
                           AND substr(d.created_at,1,10) >= date(k.end_date, '-180 days'))`
    )
    .all(customerId, addDaysStr(today, -30), addDaysStr(today, RENEWAL_WINDOW_DAYS)) as {
    id: number;
    name: string;
    end_date: string;
    value_vnd: number;
  }[];
  for (const k of contracts) {
    const left = daysBetweenStr(today, k.end_date);
    out.push({
      kind: 'renewal',
      key: `renewal-contract-${k.id}`,
      title: `Gia hạn hợp đồng ${k.name}`,
      reason:
        left >= 0
          ? `Hợp đồng hết hạn sau ${left} ngày (${k.end_date}), chưa có cơ hội gia hạn.`
          : `Hợp đồng đã hết hạn ${-left} ngày, chưa có cơ hội gia hạn.`,
      value_vnd: k.value_vnd ?? 0,
      contract_id: k.id,
    });
  }

  /* Dich vu dang dung sap het han (khong gan hop dong da goi y o tren). */
  const services = db
    .prepare(
      `SELECT cs.id, cs.end_date, cs.service_id, s.name AS service_name, cs.contract_id,
              (SELECT COALESCE(SUM(r.amount_vnd),0) FROM service_revenues r
                WHERE r.line_id = cs.id AND r.period >= ?) AS last_year_vnd
         FROM customer_services cs LEFT JOIN services s ON s.id = cs.service_id
        WHERE cs.customer_id = ? AND cs.status = 'using' AND cs.end_date IS NOT NULL
          AND cs.end_date BETWEEN ? AND ?
          /* Dich vu thuoc mot hop dong da tung duoc goi y gia han (dang mo, da nhan
             hay da bo qua): gia han hop dong la gia han ca dich vu, khong goi y lan hai. */
          AND (cs.contract_id IS NULL OR cs.contract_id NOT IN (
                SELECT contract_id FROM customer_suggestions
                 WHERE customer_id = cs.customer_id AND contract_id IS NOT NULL))`
    )
    .all(
      addDaysStr(today, -365).slice(0, 7),
      customerId,
      today,
      addDaysStr(today, RENEWAL_WINDOW_DAYS)
    ) as {
    id: number;
    end_date: string;
    service_id: number | null;
    service_name: string | null;
    contract_id: number | null;
    last_year_vnd: number;
  }[];
  const contractIds = new Set(contracts.map((k) => k.id));
  for (const line of services) {
    if (line.contract_id && contractIds.has(line.contract_id)) continue;
    const name = line.service_name ?? 'dịch vụ';
    out.push({
      kind: 'renewal',
      key: `renewal-service-${line.id}`,
      title: `Gia hạn ${name}`,
      reason: `Dịch vụ đến hạn ${line.end_date} (còn ${daysBetweenStr(today, line.end_date)} ngày).`,
      value_vnd: line.last_year_vnd ?? 0,
      service_id: line.service_id,
      customer_service_id: line.id,
    });
  }

  /* 2) Ban cheo: dich vu ma khach cung nganh (hoac cung quy mo) dang dung nhung khach
        nay chua dung. Thieu ca nganh lan quy mo thi lay dich vu pho bien nhat. */
  const peerFilter = customer.industry
    ? {
        sql: `AND lower(trim(c.industry)) = lower(trim(?))`,
        param: customer.industry,
        label: 'cùng ngành',
      }
    : customer.size
      ? { sql: `AND c.size = ?`, param: customer.size, label: 'cùng quy mô' }
      : null;
  const crossSql = `
    SELECT s.id, s.name, s.default_price_vnd, COUNT(DISTINCT cs.customer_id) AS peers,
           (SELECT COUNT(*) FROM customers c2 WHERE c2.org_kind = 'customer' AND c2.id <> ?
              ${peerFilter ? peerFilter.sql.replace(/c\./g, 'c2.') : ''}) AS peer_total
      FROM customer_services cs
      JOIN services s ON s.id = cs.service_id AND s.is_active = 1
      JOIN customers c ON c.id = cs.customer_id AND c.org_kind = 'customer'
     WHERE cs.status IN ('using','pending') AND cs.customer_id <> ?
       ${peerFilter?.sql ?? ''}
       AND s.id NOT IN (SELECT service_id FROM customer_services
                         WHERE customer_id = ? AND service_id IS NOT NULL
                           AND status IN ('using','pending','paused'))
     GROUP BY s.id HAVING peers >= 2
     ORDER BY peers DESC, s.name LIMIT 3`;
  const params: unknown[] = [customerId];
  if (peerFilter) params.push(peerFilter.param);
  params.push(customerId);
  if (peerFilter) params.push(peerFilter.param);
  params.push(customerId);
  const cross = db.prepare(crossSql).all(...params) as {
    id: number;
    name: string;
    default_price_vnd: number;
    peers: number;
    peer_total: number;
  }[];
  for (const s of cross) {
    out.push({
      kind: 'cross_sell',
      key: `cross_sell-service-${s.id}`,
      title: `Giới thiệu ${s.name}`,
      reason: peerFilter
        ? `${s.peers}/${s.peer_total} khách ${peerFilter.label} đang dùng ${s.name}; khách này chưa dùng.`
        : `${s.peers} khách hàng đang dùng ${s.name}; khách này chưa dùng.`,
      value_vnd: s.default_price_vnd ?? 0,
      service_id: s.id,
    });
  }

  /* 3) Mo lai bao gia: da gui/dang xem xet nhung het hieu luc, co hoi cua no chua chot. */
  const quotes = db
    .prepare(
      `SELECT q.id, q.code, q.version, q.value_vnd, q.valid_until, q.deal_id FROM quotations q
         LEFT JOIN deals d ON d.id = q.deal_id
        WHERE q.customer_id = ? AND q.status IN ('sent','reviewing','revision')
          AND q.valid_until IS NOT NULL AND q.valid_until < ?
          AND (d.id IS NULL OR d.stage_category = 'open')
          AND q.version = (SELECT MAX(q2.version) FROM quotations q2
                            WHERE q2.customer_id = q.customer_id
                              AND COALESCE(q2.code,'') = COALESCE(q.code,'')
                              AND COALESCE(q2.deal_id,0) = COALESCE(q.deal_id,0))
        ORDER BY q.valid_until DESC LIMIT 3`
    )
    .all(customerId, today) as {
    id: number;
    code: string | null;
    version: number;
    value_vnd: number;
    valid_until: string;
    deal_id: number | null;
  }[];
  for (const q of quotes) {
    out.push({
      kind: 'reopen_quote',
      key: `reopen_quote-${q.id}`,
      title: `Làm mới báo giá ${q.code || `#${q.id}`} v${q.version}`,
      reason: `Báo giá hết hiệu lực ${daysBetweenStr(q.valid_until, today)} ngày mà chưa chốt — gửi lại bản cập nhật.`,
      value_vnd: q.value_vnd ?? 0,
      quotation_id: q.id,
      source_deal_id: q.deal_id,
    });
  }

  /* 4) Mo lai co hoi thua: thua tu hon 6 thang (ly do co the da thay doi). */
  const lost = db
    .prepare(
      `SELECT id, title, value_vnd, lost_reason, substr(COALESCE(closed_at, updated_at),1,10) AS lost_on
         FROM deals WHERE customer_id = ? AND stage_category = 'lost'
          AND substr(COALESCE(closed_at, updated_at),1,10) <= ?
          AND substr(COALESCE(closed_at, updated_at),1,10) >= ?
        ORDER BY value_vnd DESC LIMIT 2`
    )
    .all(
      customerId,
      addDaysStr(today, -LOST_REOPEN_AFTER_DAYS),
      addDaysStr(today, -LOST_REOPEN_AFTER_DAYS * 4)
    ) as {
    id: number;
    title: string;
    value_vnd: number;
    lost_reason: string | null;
    lost_on: string;
  }[];
  for (const d of lost) {
    out.push({
      kind: 'reopen_lost',
      key: `reopen_lost-${d.id}`,
      title: `Mở lại: ${d.title}`,
      reason: `Thua từ ${d.lost_on}${d.lost_reason ? ` (lý do: ${d.lost_reason})` : ''} — đủ lâu để liên hệ lại.`,
      value_vnd: d.value_vnd ?? 0,
      source_deal_id: d.id,
    });
  }

  /* 5) Cham soc sau ban: co hoi thang trong 90 ngay qua. */
  const won = db
    .prepare(
      `SELECT id, title, value_vnd, substr(COALESCE(closed_at, updated_at),1,10) AS won_on
         FROM deals WHERE customer_id = ? AND stage_category = 'won'
          AND substr(COALESCE(closed_at, updated_at),1,10) >= ?
        ORDER BY won_on DESC LIMIT 3`
    )
    .all(customerId, addDaysStr(today, -90)) as {
    id: number;
    title: string;
    value_vnd: number;
    won_on: string;
  }[];
  for (const d of won) {
    out.push({
      kind: 'aftercare',
      key: `aftercare-${d.id}`,
      title: `Kịch bản chăm sóc sau bán: ${d.title}`,
      reason: `Chốt ngày ${d.won_on}. Tạo nhắc hẹn ngày 7, 30, 90 để giữ khách và mở đường bán thêm.`,
      value_vnd: 0,
      source_deal_id: d.id,
    });
  }

  return out;
}

export interface SuggestionRow {
  id: number;
  customer_id: number;
  kind: SuggestionKind;
  key: string;
  title: string;
  reason: string;
  value_vnd: number;
  service_id: number | null;
  contract_id: number | null;
  quotation_id: number | null;
  source_deal_id: number | null;
  customer_service_id: number | null;
  status: 'open' | 'accepted' | 'dismissed';
  dismiss_reason: string | null;
  result_deal_id: number | null;
  decided_at: string | null;
  created_at: string;
}

/**
 * Tinh lai goi y cua mot khach va dong bo vao bang.
 *
 * - Goi y moi: them dong 'open'.
 * - Goi y 'open' con dung: cap nhat tieu de/ly do/gia tri (so lieu co the doi).
 * - Goi y 'open' khong con dung (vd da tao co hoi gia han): xoa.
 * - Da nhan / da bo qua: giu nguyen — khong bao gio hien lai cung mot key.
 */
export function refreshSuggestions(db: Database, customerId: number): SuggestionRow[] {
  const candidates = candidatesFor(db, customerId);
  const keys = new Set(candidates.map((c) => c.key));
  const upsert = db.prepare(
    `INSERT INTO customer_suggestions
       (customer_id, kind, key, title, reason, value_vnd, service_id, contract_id, quotation_id,
        source_deal_id, customer_service_id)
     VALUES (@customer_id, @kind, @key, @title, @reason, @value_vnd, @service_id, @contract_id,
             @quotation_id, @source_deal_id, @customer_service_id)
     ON CONFLICT (customer_id, key) DO UPDATE SET
       title = excluded.title, reason = excluded.reason, value_vnd = excluded.value_vnd,
       updated_at = datetime('now','localtime')
     WHERE customer_suggestions.status = 'open'`
  );
  db.transaction(() => {
    for (const c of candidates) {
      upsert.run({
        customer_id: customerId,
        kind: c.kind,
        key: c.key,
        title: c.title,
        reason: c.reason,
        value_vnd: c.value_vnd,
        service_id: c.service_id ?? null,
        contract_id: c.contract_id ?? null,
        quotation_id: c.quotation_id ?? null,
        source_deal_id: c.source_deal_id ?? null,
        customer_service_id: c.customer_service_id ?? null,
      });
    }
    const open = db
      .prepare(`SELECT id, key FROM customer_suggestions WHERE customer_id = ? AND status = 'open'`)
      .all(customerId) as { id: number; key: string }[];
    const remove = db.prepare(`DELETE FROM customer_suggestions WHERE id = ?`);
    for (const row of open) if (!keys.has(row.key)) remove.run(row.id);
  })();
  return db
    .prepare(
      `SELECT * FROM customer_suggestions WHERE customer_id = ? AND status = 'open'
        ORDER BY CASE kind WHEN 'renewal' THEN 0 WHEN 'aftercare' THEN 1 WHEN 'reopen_quote' THEN 2
                           WHEN 'cross_sell' THEN 3 ELSE 4 END, value_vnd DESC, id`
    )
    .all(customerId) as SuggestionRow[];
}

export function suggestionStats(db: Database, customerId?: number) {
  const where = customerId ? 'WHERE customer_id = ?' : '';
  const params = customerId ? [customerId] : [];
  const rows = db
    .prepare(
      `SELECT kind,
              SUM(status = 'open') AS open,
              SUM(status = 'accepted') AS accepted,
              SUM(status = 'dismissed') AS dismissed
         FROM customer_suggestions ${where} GROUP BY kind`
    )
    .all(...params) as {
    kind: SuggestionKind;
    open: number;
    accepted: number;
    dismissed: number;
  }[];
  const total = rows.reduce(
    (acc, r) => ({
      open: acc.open + r.open,
      accepted: acc.accepted + r.accepted,
      dismissed: acc.dismissed + r.dismissed,
    }),
    { open: 0, accepted: 0, dismissed: 0 }
  );
  const decided = total.accepted + total.dismissed;
  return {
    ...total,
    acceptance_rate: decided > 0 ? Math.round((total.accepted / decided) * 100) : null,
    by_kind: rows,
  };
}

/** Tao nhac hen cho kich ban sau ban. Buoc da qua ngay thi dat vao hom nay. */
export function applyAftercare(
  db: Database,
  input: { customerId: number; dealId: number; ownerContactId: number | null }
): number[] {
  const deal = db
    .prepare(
      `SELECT id, title, substr(COALESCE(closed_at, updated_at),1,10) AS won_on FROM deals
        WHERE id = ? AND customer_id = ?`
    )
    .get(input.dealId, input.customerId) as
    { id: number; title: string; won_on: string } | undefined;
  if (!deal) return [];
  const today = todayOf(db);
  const insert = db.prepare(
    `INSERT INTO reminders (title, note, due_at, customer_id, deal_id, owner_contact_id)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const ids: number[] = [];
  for (const step of AFTERCARE_STEPS) {
    const planned = addDaysStr(deal.won_on, step.day);
    const due = planned < today ? today : planned;
    const info = insert.run(
      `Sau bán ngày ${step.day}: ${step.title}`,
      `Kịch bản chăm sóc sau bán — ${deal.title}`,
      `${due} 09:00`,
      input.customerId,
      deal.id,
      input.ownerContactId
    );
    ids.push(Number(info.lastInsertRowid));
  }
  return ids;
}

/* ---------- Doanh thu, han sap toi, su kien sap toi ---------- */

export function revenueSummary(db: Database, customerId: number) {
  const byYear = db
    .prepare(
      `SELECT substr(r.period,1,4) AS year, COALESCE(SUM(r.amount_vnd),0) AS amount_vnd,
              COALESCE(SUM(CASE WHEN r.stage = 'paid' THEN r.amount_vnd END),0) AS paid_vnd
         FROM service_revenues r JOIN customer_services cs ON cs.id = r.line_id
        WHERE cs.customer_id = ? GROUP BY year ORDER BY year DESC LIMIT 5`
    )
    .all(customerId) as { year: string; amount_vnd: number; paid_vnd: number }[];
  const wonByYear = db
    .prepare(
      `SELECT substr(COALESCE(closed_at, updated_at),1,4) AS year,
              COALESCE(SUM(COALESCE(won_value_vnd, value_vnd)),0) AS won_vnd, COUNT(*) AS deals
         FROM deals WHERE customer_id = ? AND stage_category = 'won' GROUP BY year ORDER BY year DESC LIMIT 5`
    )
    .all(customerId) as { year: string; won_vnd: number; deals: number }[];
  const byService = db
    .prepare(
      `SELECT cs.id, cs.service_id, COALESCE(s.name, 'Dịch vụ khác') AS service_name, cs.status,
              cs.end_date, COALESCE(SUM(r.amount_vnd),0) AS amount_vnd
         FROM customer_services cs
         LEFT JOIN services s ON s.id = cs.service_id
         LEFT JOIN service_revenues r ON r.line_id = cs.id
        WHERE cs.customer_id = ?
        GROUP BY cs.id ORDER BY amount_vnd DESC LIMIT 10`
    )
    .all(customerId);
  return { by_year: byYear, won_by_year: wonByYear, by_service: byService };
}

export function expiringItems(db: Database, customerId: number, days = 90) {
  const today = todayOf(db);
  const until = addDaysStr(today, days);
  const contracts = db
    .prepare(
      `SELECT 'contract' AS kind, id, name, end_date, value_vnd FROM contracts
        WHERE customer_id = ? AND status = 'active' AND end_date BETWEEN ? AND ?`
    )
    .all(customerId, today, until) as { kind: string; end_date: string }[];
  const services = db
    .prepare(
      `SELECT 'service' AS kind, cs.id, COALESCE(s.name,'Dịch vụ') AS name, cs.end_date, 0 AS value_vnd
         FROM customer_services cs LEFT JOIN services s ON s.id = cs.service_id
        WHERE cs.customer_id = ? AND cs.status = 'using' AND cs.end_date BETWEEN ? AND ?`
    )
    .all(customerId, today, until) as { kind: string; end_date: string }[];
  const quotes = db
    .prepare(
      `SELECT 'quotation' AS kind, id, COALESCE(code, 'Báo giá #' || id) AS name,
              valid_until AS end_date, value_vnd FROM quotations
        WHERE customer_id = ? AND status IN ('draft','sent','reviewing','revision')
          AND valid_until BETWEEN ? AND ?`
    )
    .all(customerId, today, until) as { kind: string; end_date: string }[];
  return [...contracts, ...services, ...quotes]
    .map((item) => ({ ...item, days_left: daysBetweenStr(today, item.end_date) }))
    .sort((a, b) => a.end_date.localeCompare(b.end_date));
}

export interface UpcomingCareEvent {
  kind: 'birthday' | 'contract_anniversary';
  date: string;
  title: string;
  contact_id: number | null;
  contract_id: number | null;
  customer_id: number;
  customer_name: string;
}

/**
 * Sinh nhat nguoi lien he va ngay ky niem hop dong roi vao [from, to].
 * `scopeSql` la manh `AND ...` gioi han khach hang (alias `c`).
 */
export function careEventsBetween(
  db: Database,
  from: string,
  to: string,
  options: { customerId?: number; scopeSql?: string } = {}
): UpcomingCareEvent[] {
  const filter = options.customerId ? `AND c.id = ${Number(options.customerId)}` : '';
  const scope = options.scopeSql ?? '';
  const out: UpcomingCareEvent[] = [];
  const people = db
    .prepare(
      `SELECT ct.id, ct.full_name, ct.birthday, c.id AS customer_id, c.name AS customer_name
         FROM contacts ct JOIN customers c ON c.id = ct.customer_id AND c.org_kind = 'customer'
        WHERE ct.is_active = 1 AND ct.birthday IS NOT NULL AND ct.birthday <> '' ${filter}${scope}`
    )
    .all() as {
    id: number;
    full_name: string;
    birthday: string;
    customer_id: number;
    customer_name: string;
  }[];
  for (const p of people) {
    const md = monthDayOf(p.birthday);
    if (!md) continue;
    for (const date of occurrencesIn(md, from, to))
      out.push({
        kind: 'birthday',
        date,
        title: `Sinh nhật ${p.full_name}`,
        contact_id: p.id,
        contract_id: null,
        customer_id: p.customer_id,
        customer_name: p.customer_name,
      });
  }
  const contracts = db
    .prepare(
      `SELECT k.id, k.name, COALESCE(k.sign_date, k.start_date) AS since,
              c.id AS customer_id, c.name AS customer_name
         FROM contracts k JOIN customers c ON c.id = k.customer_id AND c.org_kind = 'customer'
        WHERE k.status = 'active' AND COALESCE(k.sign_date, k.start_date) IS NOT NULL ${filter}${scope}`
    )
    .all() as {
    id: number;
    name: string;
    since: string;
    customer_id: number;
    customer_name: string;
  }[];
  for (const k of contracts) {
    const md = monthDayOf(k.since.slice(0, 10));
    if (!md) continue;
    for (const date of occurrencesIn(md, from, to)) {
      const years = Number(date.slice(0, 4)) - Number(k.since.slice(0, 4));
      if (years < 1) continue;
      out.push({
        kind: 'contract_anniversary',
        date,
        title: `Kỷ niệm ${years} năm hợp đồng ${k.name}`,
        contact_id: null,
        contract_id: k.id,
        customer_id: k.customer_id,
        customer_name: k.customer_name,
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/* ---------- Dong thoi gian gop ---------- */

export interface TimelineEntry {
  kind:
    | 'interaction'
    | 'deal_created'
    | 'deal_stage'
    | 'quotation'
    | 'contract'
    | 'task_done'
    | 'document';
  at: string;
  title: string;
  meta: string;
  deal_id: number | null;
  card_id: number | null;
  sub_type: string | null;
}

export function customerTimeline(db: Database, customerId: number, limit = 80): TimelineEntry[] {
  const rows = db
    .prepare(
      `SELECT * FROM (
         SELECT 'interaction' AS kind, i.occurred_at AS at, i.summary AS title,
                COALESCE(ct.full_name, '') AS meta, i.deal_id, NULL AS card_id, i.type AS sub_type
           FROM interactions i LEFT JOIN contacts ct ON ct.id = i.contact_id
          WHERE i.customer_id = @id
         UNION ALL
         SELECT 'deal_created', d.created_at, d.title, '', d.id, NULL, d.stage
           FROM deals d WHERE d.customer_id = @id
         UNION ALL
         SELECT 'deal_stage', l.changed_at, d.title, COALESCE(l.old_value,'') || '→' || COALESCE(l.new_value,''),
                d.id, NULL, l.new_value
           FROM entity_change_log l JOIN deals d ON d.id = l.entity_id
          WHERE l.entity_type = 'deal' AND l.field = 'stage' AND d.customer_id = @id
         UNION ALL
         SELECT 'quotation', COALESCE(q.quote_date, q.created_at),
                'Báo giá ' || COALESCE(q.code, '#' || q.id) || ' v' || q.version, q.status, q.deal_id, NULL, q.status
           FROM quotations q WHERE q.customer_id = @id
         UNION ALL
         SELECT 'contract', COALESCE(k.sign_date, k.start_date, k.created_at), k.name, k.status, k.deal_id, NULL, k.status
           FROM contracts k WHERE k.customer_id = @id
         UNION ALL
         SELECT 'task_done', k.completed_at, k.title, '', k.deal_id, k.id, NULL
           FROM cards k WHERE k.customer_id = @id AND k.is_done = 1 AND k.completed_at IS NOT NULL
         UNION ALL
         SELECT 'document', doc.created_at, doc.name, doc.doc_type, doc.deal_id, NULL, doc.doc_type
           FROM documents doc WHERE doc.customer_id = @id AND doc.deleted_at IS NULL
       ) WHERE at IS NOT NULL ORDER BY at DESC LIMIT @limit`
    )
    .all({ id: customerId, limit }) as TimelineEntry[];
  return rows;
}
