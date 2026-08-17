import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { BACKUP_DIR, db } from '../db/connection.ts';
import { createBackupFile } from '../lib/backup.ts';
import { HttpError } from '../lib/validate.ts';
import { fold } from '../lib/viSearch.ts';

const router = Router();

const TABLES = [
  'customers',
  'contacts',
  'deals',
  'contracts',
  'quotations',
  'documents',
  'services',
  'customer_services',
  'service_revenues',
  'boards',
  'lists',
  'cards',
  'checklist_items',
  'labels',
  // card_labels la VIEW tu v9 (chi cac lien ket loai 'card'); label_links moi la bang goc
  'card_labels',
  'label_links',
  'card_comments',
  'interactions',
  'reminders',
  // v11 — lich ca nhan
  'calendar_events',
  // v10 — cham diem co hoi. deal_scorecard la VIEW nen khong xuat.
  'deal_scores',
  'deal_committee',
  'deal_events',
  'deal_competitors',
  'deal_score_history',
  'app_settings',
] as const;

/** FR-SRC-01: tim Account, Contact, Opportunity, Contract, Document (khong dau). */
router.get('/search', (req, res) => {
  const q = fold(String(req.query.q ?? '').trim());
  if (!q) {
    res.json({ cards: [], customers: [], contacts: [], deals: [], contracts: [], documents: [] });
    return;
  }
  const like = `%${q}%`;

  const cards = db
    .prepare(
      `SELECT k.id, k.title, k.priority, k.due_date, k.is_done, b.name AS board_name, c.name AS customer_name
         FROM cards k
         JOIN lists l ON l.id = k.list_id
         JOIN boards b ON b.id = l.board_id
         LEFT JOIN customers c ON c.id = k.customer_id
        WHERE k.search_text LIKE ? AND k.is_archived = 0
        ORDER BY k.is_done, k.updated_at DESC LIMIT 8`
    )
    .all(like);

  const customers = db
    .prepare(
      /* Muc nay hien duoi tieu de "Khach hang" nen chi liet ke org_kind='customer';
         to chuc noi bo / doi tac tim o trang To chuc & nhan su. */
      `SELECT id, name, industry, phone, status FROM customers
        WHERE org_kind = 'customer' AND search_text LIKE ? ORDER BY name LIMIT 8`
    )
    .all(like);

  const contacts = (
    db
      .prepare(
        `SELECT ct.id, ct.customer_id, ct.full_name, ct.title, ct.phone, ct.email, c.name AS customer_name
           FROM contacts ct JOIN customers c ON c.id = ct.customer_id`
      )
      .all() as { full_name: string; title: string | null; customer_name: string }[]
  )
    .filter(
      (c) =>
        fold(c.full_name).includes(q) ||
        fold(c.title ?? '').includes(q) ||
        fold(c.customer_name).includes(q)
    )
    .slice(0, 8);

  const deals = db
    .prepare(
      `SELECT d.id, d.title, d.stage, d.value_vnd, c.name AS customer_name
         FROM deals d JOIN customers c ON c.id = d.customer_id AND c.org_kind = 'customer'
        WHERE d.search_text LIKE ? OR c.search_text LIKE ?
        ORDER BY d.updated_at DESC LIMIT 8`
    )
    .all(like, like);

  const contracts = db
    .prepare(
      `SELECT k.id, k.name, k.number, k.status, k.end_date, k.value_vnd, c.name AS customer_name
         FROM contracts k JOIN customers c ON c.id = k.customer_id AND c.org_kind = 'customer'
        WHERE k.search_text LIKE ? OR c.search_text LIKE ?
        ORDER BY k.end_date LIMIT 8`
    )
    .all(like, like);

  const documents = db
    .prepare(
      `SELECT dc.id, dc.name, dc.doc_type, dc.file_name, c.name AS customer_name
         FROM documents dc LEFT JOIN customers c ON c.id = dc.customer_id
        WHERE dc.deleted_at IS NULL
          AND dc.search_text LIKE ? ORDER BY dc.created_at DESC LIMIT 8`
    )
    .all(like);

  res.json({ cards, customers, contacts, deals, contracts, documents });
});

router.get('/backups', (_req, res) => {
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith('.db'))
    .map((f) => {
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      return { name: f, size: stat.size, created_at: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  res.json(files);
});

router.post('/backup', async (_req, res, next) => {
  try {
    const file = await createBackupFile(db);
    res.json(file);
  } catch (err) {
    next(err);
  }
});

const SAFE_BACKUP_NAME = /^[\w.-]+\.db$/;

router.get('/backups/:name/download', (req, res) => {
  const name = String(req.params.name);
  if (!SAFE_BACKUP_NAME.test(name)) throw new HttpError(400, 'Ten file khong hop le');
  const file = path.join(BACKUP_DIR, name);
  if (!fs.existsSync(file)) throw new HttpError(404, 'Khong tim thay ban sao luu');
  res.download(file, name);
});

router.get('/export', (_req, res) => {
  const dump: Record<string, unknown[]> = {};
  for (const table of TABLES) dump[table] = db.prepare(`SELECT * FROM ${table}`).all();
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=workflow-export-${date}.json`);
  res.send(JSON.stringify({ exported_at: new Date().toISOString(), data: dump }, null, 2));
});

/* ---------- NFR-06: xuat CSV cho Account / Contact / Opportunity / Task ---------- */

const CSV_QUERIES: Record<string, { sql: string; label: string }> = {
  customers: {
    label: 'khach-hang',
    sql: `SELECT name AS "Tên doanh nghiệp", short_name AS "Tên viết tắt", tax_code AS "Mã số thuế",
                 industry AS "Ngành nghề", size AS "Quy mô", source AS "Nguồn", status AS "Trạng thái",
                 phone AS "Điện thoại", email AS "Email", website AS "Website", address AS "Địa chỉ",
                 notes AS "Ghi chú" FROM customers WHERE org_kind = 'customer' ORDER BY name`,
  },
  contacts: {
    label: 'nguoi-lien-he',
    sql: `SELECT ct.full_name AS "Họ tên", c.name AS "Doanh nghiệp", ct.title AS "Chức vụ",
                 ct.department AS "Phòng ban", ct.phone AS "Điện thoại", ct.email AS "Email",
                 ct.zalo AS "Zalo", ct.linkedin AS "LinkedIn", ct.buying_role AS "Vai trò mua",
                 ct.relationship AS "Mức độ quan hệ", ct.notes AS "Ghi chú"
            FROM contacts ct JOIN customers c ON c.id = ct.customer_id ORDER BY c.name, ct.full_name`,
  },
  deals: {
    label: 'co-hoi',
    sql: `SELECT d.title AS "Tên cơ hội", c.name AS "Doanh nghiệp", d.product AS "Sản phẩm",
                 d.stage AS "Giai đoạn", d.probability AS "Xác suất %", d.value_vnd AS "Giá trị",
                 d.won_value_vnd AS "Giá trị chốt", d.expected_close_date AS "Dự kiến chốt",
                 d.next_action AS "Hành động tiếp theo", d.next_action_date AS "Ngày hành động",
                 d.source AS "Nguồn", d.competitor AS "Đối thủ", d.lost_reason AS "Lý do thua",
                 d.bant_total AS "BANT", d.p4_total AS "4P", s.quadrant AS "Ô ma trận",
                 CASE WHEN s.v1_no_event = 1 OR s.v2_no_economic = 1 THEN 'Có' ELSE '' END AS "Veto",
                 s.score_age_days AS "Tuổi điểm (ngày)",
                 d.notes AS "Ghi chú"
            FROM deals d JOIN customers c ON c.id = d.customer_id AND c.org_kind = 'customer'
            JOIN deal_scorecard s ON s.deal_id = d.id
           ORDER BY d.updated_at DESC`,
  },
  /* Xuat chi tiet cham diem: moi dong mot yeu to, kem bang chung — de ra soat
     xem diem nao dang duoc cham ma khong co can cu. */
  scores: {
    label: 'cham-diem-co-hoi',
    sql: `SELECT d.title AS "Cơ hội", c.name AS "Doanh nghiệp", sc.factor AS "Yếu tố",
                 CASE WHEN sc.factor IN ('budget','authority','need','timeline') THEN 'BANT' ELSE '4P' END AS "Trục",
                 sc.score AS "Điểm", sc.status AS "Trạng thái",
                 CASE sc.verified WHEN 1 THEN 'Đã xác thực' ELSE 'Chưa xác thực' END AS "Xác thực",
                 sc.evidence AS "Bằng chứng", sc.challenge AS "Phản biện", sc.scored_at AS "Chấm lúc"
            FROM deal_scores sc
            JOIN deals d ON d.id = sc.deal_id
            JOIN customers c ON c.id = d.customer_id AND c.org_kind = 'customer'
           ORDER BY d.id, sc.factor`,
  },
  tasks: {
    label: 'cong-viec',
    sql: `SELECT k.title AS "Công việc", b.name AS "Bảng", l.name AS "Danh sách",
                 c.name AS "Khách hàng", d.title AS "Cơ hội", k.priority AS "Ưu tiên",
                 ac.full_name AS "Người phụ trách", ao.name AS "Tổ chức phụ trách",
                 pr.name AS "Dự án",
                 k.start_date AS "Bắt đầu", k.due_date AS "Hạn",
                 k.baseline_due_date AS "Hạn ban đầu",
                 (SELECT COUNT(*) FROM card_due_changes dc WHERE dc.card_id = k.id) AS "Số lần dời hạn",
                 k.estimate_hours AS "Ước lượng (giờ)", k.spent_hours AS "Đã dùng (giờ)",
                 k.status AS "Vòng đời", k.blocked_reason AS "Lý do bị chặn",
                 CASE k.is_done WHEN 1 THEN 'Hoàn thành' ELSE 'Đang mở' END AS "Trạng thái"
            FROM cards k JOIN lists l ON l.id = k.list_id JOIN boards b ON b.id = l.board_id
            LEFT JOIN customers c ON c.id = k.customer_id
            LEFT JOIN deals d ON d.id = k.deal_id
            LEFT JOIN contacts ac ON ac.id = k.assignee_contact_id
            LEFT JOIN customers ao ON ao.id = k.assignee_org_id
            LEFT JOIN projects pr ON pr.id = b.project_id
           WHERE k.is_archived = 0 ORDER BY k.due_date IS NULL, k.due_date`,
  },
  contracts: {
    label: 'hop-dong',
    sql: `SELECT k.name AS "Tên hợp đồng", k.number AS "Số hợp đồng", c.name AS "Doanh nghiệp",
                 k.value_vnd AS "Giá trị", k.sign_date AS "Ngày ký", k.start_date AS "Bắt đầu",
                 k.end_date AS "Kết thúc", k.status AS "Trạng thái",
                 k.payment_terms AS "Điều khoản thanh toán", k.notes AS "Ghi chú"
            FROM contracts k JOIN customers c ON c.id = k.customer_id AND c.org_kind = 'customer' ORDER BY k.end_date`,
  },
  revenues: {
    label: 'doanh-thu',
    sql: `SELECT c.name AS "Khách hàng", s.name AS "Dịch vụ sử dụng", cs.am AS "AM",
                 CASE cs.contract_kind WHEN 'expansion' THEN 'Mở rộng' ELSE 'Mới' END AS "Loại hợp đồng",
                 CASE cs.contract_term WHEN 'long' THEN 'Lâu dài' WHEN 'short' THEN 'Ngắn hạn'
                      WHEN 'trial' THEN 'Dùng thử' ELSE 'Khác' END AS "Thời hạn",
                 CASE cs.status WHEN 'using' THEN 'Đang sử dụng' WHEN 'pending' THEN 'Chờ triển khai'
                      WHEN 'paused' THEN 'Tạm dừng' ELSE 'Đã ngừng' END AS "Tình trạng hợp đồng",
                 r.period AS "Kỳ", r.forecast_vnd AS "Doanh thu dự kiến",
                 r.amount_vnd AS "Doanh thu thực tế",
                 r.amount_vnd - r.forecast_vnd AS "Chênh lệch",
                 CASE r.stage WHEN 'forecast' THEN 'Dự kiến' WHEN 'reconciled' THEN 'Đã đối soát'
                      WHEN 'invoiced' THEN 'Đã xuất hóa đơn' ELSE 'Đã thanh toán' END AS "Trạng thái",
                 r.note AS "Ghi chú"
            FROM service_revenues r
            JOIN customer_services cs ON cs.id = r.line_id
            JOIN customers c ON c.id = cs.customer_id AND c.org_kind = 'customer'
            LEFT JOIN services s ON s.id = cs.service_id
           ORDER BY r.period, c.name COLLATE NOCASE`,
  },
};

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => {
    if (value === null || value === undefined) return '';
    const text = String(value);
    return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(',')),
  ].join('\r\n');
}

router.get('/export/:entity.csv', (req, res) => {
  const entity = String(req.params.entity);
  const query = CSV_QUERIES[entity];
  if (!query) throw new HttpError(404, 'Khong ho tro xuat du lieu nay');

  const rows = db.prepare(query.sql).all() as Record<string, unknown>[];
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=${query.label}-${date}.csv`);
  // BOM de Excel tren Windows doc dung tieng Viet
  res.send('﻿' + toCsv(rows));
});

export default router;
