/**
 * Lop Delivery: phan loai mo hinh A/B, bo List mau, va trang thai moc giai doan (v26).
 *
 * Ca ba deu la SUY DIEN chu khong phai du lieu moi: phan loai doc tu hop dong /
 * ke hoach / nhan su da co, moc giai doan doc tu ngay va tu cac viec ben trong
 * bang. Chi ket qua CHOT cua phan loai moi duoc luu (`projects.delivery_model`),
 * vi do la mot quyet dinh cua con nguoi chu khong phai mot phep tinh.
 */
import type { Database } from 'better-sqlite3';
import type { CardStatus } from '@workflow/contracts';
import { HttpError, required } from '../lib/validate.ts';

/* ---------- Cau hinh ---------- */

export interface ClassificationThresholds {
  contract_value_vnd: number;
  duration_days: number;
  phase_count: number;
  team_count: number;
}

export interface BoardTemplateItem {
  name: string;
  status: CardStatus | null;
}

export type BoardTemplates = Record<string, BoardTemplateItem[]>;

export interface DeliverySettings {
  classification: ClassificationThresholds;
  boardTemplates: BoardTemplates;
}

const FALLBACK_THRESHOLDS: ClassificationThresholds = {
  contract_value_vnd: 500_000_000,
  duration_days: 90,
  phase_count: 3,
  team_count: 3,
};

function parseJson(raw: string | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed !== null && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function getDeliverySettings(db: Database): DeliverySettings {
  const rows = db
    .prepare(`SELECT key, value FROM app_settings WHERE key LIKE 'delivery.%'`)
    .all() as { key: string; value: string }[];
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const raw = parseJson(map.get('delivery.classification')) ?? {};
  const num = (key: keyof ClassificationThresholds): number => {
    const value = Number(raw[key]);
    return Number.isFinite(value) && value > 0 ? value : FALLBACK_THRESHOLDS[key];
  };

  const templatesRaw = parseJson(map.get('delivery.board_templates')) ?? {};
  const boardTemplates: BoardTemplates = {};
  for (const [key, value] of Object.entries(templatesRaw)) {
    if (!Array.isArray(value)) continue;
    const items = value
      .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
      .map((item) => ({
        name: String(item.name ?? '').trim(),
        status: (item.status ?? null) as CardStatus | null,
      }))
      .filter((item) => item.name.length > 0);
    if (items.length > 0) boardTemplates[key] = items;
  }

  return {
    classification: {
      contract_value_vnd: num('contract_value_vnd'),
      duration_days: num('duration_days'),
      phase_count: num('phase_count'),
      team_count: num('team_count'),
    },
    boardTemplates,
  };
}

export function saveDeliverySettings(db: Database, patch: Record<string, unknown>): void {
  const upsert = db.prepare(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, datetime('now','localtime'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  );
  db.transaction(() => {
    for (const [key, value] of Object.entries(patch)) {
      upsert.run(`delivery.${key}`, typeof value === 'string' ? value : JSON.stringify(value));
    }
  })();
}

/* ---------- R-11: phan loai mo hinh trien khai ---------- */

export interface ClassificationSignal {
  key: keyof ClassificationThresholds;
  label: string;
  value: number;
  threshold: number;
  crossed: boolean;
}

export interface Classification {
  suggested: 'A' | 'B';
  signals: ClassificationSignal[];
  /** Mo hinh da duoc chot; null khi chua ai quyet. */
  chosen: 'A' | 'B' | null;
  reason: string | null;
  /** Chot khac de xuat — giao dien can noi ro va bat buoc co ly do. */
  overridden: boolean;
}

const SIGNAL_LABELS: Record<keyof ClassificationThresholds, string> = {
  contract_value_vnd: 'Giá trị hợp đồng',
  duration_days: 'Thời lượng dự kiến (ngày)',
  phase_count: 'Số giai đoạn',
  team_count: 'Số nhóm tham gia',
};

/**
 * Cham diem mot du an theo nguong cau hinh.
 *
 * Vuot BAT KY nguong nao -> de xuat Mo hinh A (dac ta 6.3). Khong cong diem hay
 * lay trung binh: mot du an 50 trieu nhung co sau nhom tham gia va tich hop ben
 * thu ba VAN la du an phuc tap, va mot cong thuc trung binh se lam no chim xuong.
 *
 * `contract_value_vnd` lay tu hop dong da gan du an; neu chua co hop dong thi lay
 * gia tri chot cua co hoi nguon — luc moi khoi tao du an thi do la con so duy
 * nhat ton tai.
 */
export function classifyProject(db: Database, projectId: number): Classification {
  const project = required(
    db
      .prepare(
        `SELECT p.id, p.plan_start, p.plan_end, p.delivery_model, p.model_reason,
                (SELECT COALESCE(SUM(ct.value_vnd), 0) FROM contracts ct
                  WHERE ct.project_id = p.id) AS contract_value,
                (SELECT COALESCE(MAX(COALESCE(d.won_value_vnd, d.value_vnd)), 0) FROM deals d
                  WHERE d.project_id = p.id) AS deal_value,
                (SELECT COUNT(*) FROM boards b
                  WHERE b.project_id = p.id AND b.is_archived = 0) AS phase_count,
                (SELECT COUNT(DISTINCT k.assignee_org_id) FROM cards k
                   JOIN lists l ON l.id = k.list_id
                   JOIN boards b ON b.id = l.board_id
                  WHERE b.project_id = p.id AND k.is_archived = 0
                    AND k.assignee_org_id IS NOT NULL) AS team_count
           FROM projects p WHERE p.id = ?`
      )
      .get(projectId),
    'Khong tim thay du an'
  ) as {
    plan_start: string | null;
    plan_end: string | null;
    delivery_model: 'A' | 'B' | null;
    model_reason: string | null;
    contract_value: number;
    deal_value: number;
    phase_count: number;
    team_count: number;
  };

  const { classification } = getDeliverySettings(db);

  const durationDays =
    project.plan_start && project.plan_end
      ? Math.max(
          0,
          Math.round(
            (Date.parse(`${project.plan_end}T00:00:00`) -
              Date.parse(`${project.plan_start}T00:00:00`)) /
              86_400_000
          )
        )
      : 0;

  const values: Record<keyof ClassificationThresholds, number> = {
    contract_value_vnd: project.contract_value || project.deal_value,
    duration_days: durationDays,
    phase_count: project.phase_count,
    team_count: project.team_count,
  };

  const signals = (Object.keys(classification) as (keyof ClassificationThresholds)[]).map(
    (key) => ({
      key,
      label: SIGNAL_LABELS[key],
      value: values[key],
      threshold: classification[key],
      crossed: values[key] >= classification[key],
    })
  );

  const suggested: 'A' | 'B' = signals.some((s) => s.crossed) ? 'A' : 'B';
  return {
    suggested,
    signals,
    chosen: project.delivery_model,
    reason: project.model_reason,
    overridden: project.delivery_model !== null && project.delivery_model !== suggested,
  };
}

/**
 * Chot mo hinh trien khai. Chot KHAC de xuat thi ly do la bat buoc (dac ta 6.3).
 *
 * Doi lai, chot DUNG de xuat thi khong hoi gi ca — bat giai trinh cho mot lua
 * chon ma he thong vua tu de xuat chi day nguoi dung toi cho go bua cho xong.
 */
export function chooseDeliveryModel(
  db: Database,
  projectId: number,
  model: 'A' | 'B',
  reason: string | null
): Classification {
  const current = classifyProject(db, projectId);
  const trimmed = reason?.trim() ?? '';

  if (model !== current.suggested && trimmed.length < 10) {
    throw new HttpError(422, 'Chọn khác đề xuất phải kèm lý do từ 10 ký tự trở lên', {
      code: 'MODEL_REASON_REQUIRED',
      suggested: current.suggested,
    });
  }

  db.prepare(
    `UPDATE projects SET delivery_model = ?, model_reason = ?,
            updated_at = datetime('now','localtime') WHERE id = ?`
  ).run(model, trimmed || null, projectId);

  return classifyProject(db, projectId);
}

/* ---------- R-12: bo List mau ---------- */

/**
 * Do bo List mau vao mot bang.
 *
 * Bang moi tao luon co san bon cot mac dinh, nen "do mau" gan nhu luon co nghia
 * la THAY chung. Chi thay khi TAT CA cot hien tai deu rong: xoa mot cot dang co
 * viec la mat du lieu that, va khong co man hinh nao hoan tac duoc.
 */
export function applyBoardTemplate(db: Database, boardId: number, key: string): unknown[] {
  required(db.prepare(`SELECT id FROM boards WHERE id = ?`).get(boardId), 'Khong tim thay bang');

  const { boardTemplates } = getDeliverySettings(db);
  const template = boardTemplates[key];
  if (!template || template.length === 0) {
    throw new HttpError(422, `Không tìm thấy bộ mẫu danh sách "${key}"`, {
      code: 'BOARD_TEMPLATE_EMPTY',
    });
  }

  const used = db
    .prepare(
      `SELECT COUNT(*) AS n FROM cards k JOIN lists l ON l.id = k.list_id WHERE l.board_id = ?`
    )
    .get(boardId) as { n: number };
  if (used.n > 0) {
    throw new HttpError(409, 'Bảng này đã có công việc nên không thể thay bộ danh sách', {
      code: 'BOARD_NOT_EMPTY',
    });
  }

  db.transaction(() => {
    db.prepare(`DELETE FROM lists WHERE board_id = ?`).run(boardId);
    const insert = db.prepare(
      `INSERT INTO lists (board_id, name, position, status_mapping) VALUES (?, ?, ?, ?)`
    );
    template.forEach((item, index) =>
      insert.run(boardId, item.name, (index + 1) * 1024, item.status ?? null)
    );
  })();

  return db
    .prepare(`SELECT * FROM lists WHERE board_id = ? ORDER BY position, id`)
    .all(boardId) as unknown[];
}

/* ---------- R-13: so rui ro ---------- */

const RISK_SELECT = `
  SELECT r.*, ct.full_name AS owner_name, co.name AS owner_org_name
    FROM project_risks r
    LEFT JOIN contacts ct ON ct.id = r.owner_contact_id
    LEFT JOIN customers co ON co.id = ct.customer_id`;

export function getRisk(db: Database, id: number): unknown {
  return required(
    db.prepare(`${RISK_SELECT} WHERE r.id = ?`).get(id),
    'Khong tim thay muc trong so rui ro'
  );
}

/**
 * Sap theo muc do CAN XU LY chu khong theo thoi gian tao.
 *
 * Muc da dong xuong duoi cung; trong so muc con mo thi nghiem trong truoc, roi
 * den han gan truoc. Danh sach nay ton tai de tra loi "hom nay lo cai gi", nen
 * thu tu thoi gian tao la thu tu vo dung nhat co the chon.
 */
export function listRisks(db: Database, projectId: number): unknown[] {
  return db
    .prepare(
      `${RISK_SELECT} WHERE r.project_id = ?
        ORDER BY r.status = 'closed',
                 CASE r.severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
                 r.due_date IS NULL, r.due_date, r.id DESC`
    )
    .all(projectId) as unknown[];
}

/* ---------- R-03: trang thai moc giai doan ---------- */

export type MilestoneState = 'none' | 'done' | 'overdue' | 'due_soon' | 'on_track';

export interface PhaseRow {
  milestone_date: string | null;
  card_total: number;
  card_done: number;
}

/**
 * Trang thai cua mot giai doan — TINH KHI DOC, cung ly do voi `projectHealth`.
 *
 * 'done' thang moi dieu kien khac: mot giai doan da xong het viec thi ngay thang
 * qua di khong con lam no tre, va bao do mot thu da hoan tat chi tao bao dong gia.
 */
export function milestoneStateOf(phase: PhaseRow, today = new Date()): MilestoneState {
  if (!phase.milestone_date) return 'none';
  if (phase.card_total > 0 && phase.card_done === phase.card_total) return 'done';

  const due = Date.parse(`${phase.milestone_date}T00:00:00`);
  if (Number.isNaN(due)) return 'none';
  const daysLeft = Math.round((due - today.getTime()) / 86_400_000);

  if (daysLeft < 0) return 'overdue';
  if (daysLeft <= 7) return 'due_soon';
  return 'on_track';
}

export interface Phase extends PhaseRow {
  id: number;
  name: string;
  is_archived: number;
  state: MilestoneState;
  days_left: number | null;
}

/** Cac giai doan cua mot du an — moi Bang la mot giai doan, sap theo han. */
export function listPhases(db: Database, projectId: number): Phase[] {
  const rows = db
    .prepare(
      `SELECT b.id, b.name, b.is_archived, b.milestone_date,
              (SELECT COUNT(*) FROM cards k JOIN lists l ON l.id = k.list_id
                WHERE l.board_id = b.id AND k.is_archived = 0) AS card_total,
              (SELECT COUNT(*) FROM cards k JOIN lists l ON l.id = k.list_id
                WHERE l.board_id = b.id AND k.is_archived = 0 AND k.is_done = 1) AS card_done
         FROM boards b
        WHERE b.project_id = ?
        ORDER BY b.milestone_date IS NULL, b.milestone_date, b.id`
    )
    .all(projectId) as (PhaseRow & { id: number; name: string; is_archived: number })[];

  return rows.map((row) => ({
    ...row,
    state: milestoneStateOf(row),
    days_left: row.milestone_date
      ? Math.round((Date.parse(`${row.milestone_date}T00:00:00`) - Date.now()) / 86_400_000)
      : null,
  }));
}
