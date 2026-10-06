/**
 * Trang thai cong viec cau hinh duoc (v67).
 *
 * Mot trang thai cu the (`key`) mang mot y nghia (`kind`, mot trong CARD_STATUSES).
 * `cards.status` luu `kind`, `cards.status_key` luu khoa; the cu de trong khoa va
 * trang thai hieu luc la COALESCE(status_key, status) — trang thai dung san cung
 * khoa. Vi vay sau trang thai dung san khong bao gio bi xoa, chi an.
 *
 * Nhan `db` qua tham so, khong import `db/connection.ts`: ho so cau hinh va ngu
 * canh AI dung chung module nay.
 */
import type { Database } from 'better-sqlite3';
import { CARD_STATUSES, type CardStatus, type TaskStatusDef } from '@workflow/contracts';
import { HttpError } from './validate.ts';

/** Trang thai hieu luc cua the bi danh `k`. */
export const STATUS_KEY_SQL = 'COALESCE(k.status_key, k.status)';

export function listTaskStatuses(
  db: Database,
  options: { includeInactive?: boolean; usage?: boolean } = {}
): TaskStatusDef[] {
  const usage = options.usage
    ? `, (SELECT COUNT(*) FROM cards k WHERE ${STATUS_KEY_SQL} = s.key AND k.is_archived = 0) AS usage`
    : '';
  return db
    .prepare(
      `SELECT s.key, s.label, s.color, s.kind, s.position, s.is_active, s.is_builtin${usage}
         FROM task_statuses s
        ${options.includeInactive ? '' : 'WHERE s.is_active = 1'}
        ORDER BY s.position, s.key`
    )
    .all() as TaskStatusDef[];
}

export function getTaskStatus(db: Database, key: string): TaskStatusDef | undefined {
  return db.prepare(`SELECT * FROM task_statuses WHERE key = ?`).get(key) as
    TaskStatusDef | undefined;
}

/**
 * Trang thai dau tien (theo thu tu) mang y nghia `kind`. Viec moi vao trang thai
 * "Chua bat dau" dau tien; "Hoan thanh" nhanh (o tron, checkbox, chuong) vao trang
 * thai Hoan thanh dau tien. Luat cau hinh dam bao luon co, nhung van roi ve khoa
 * dung san de khong bao gio tra ve rong.
 */
export function firstStatusOfKind(db: Database, kind: CardStatus): string {
  const row = db
    .prepare(
      `SELECT key FROM task_statuses WHERE kind = ? AND is_active = 1 ORDER BY position, key LIMIT 1`
    )
    .get(kind) as { key: string } | undefined;
  return row?.key ?? kind;
}

/**
 * Doc khoa nguoi dung gui len: phai ton tai va dang dung. Chap nhan ca gia tri
 * `kind` cu (`'done'`, `'doing'`…) — do cung la khoa cua trang thai dung san, nen
 * cac lo goi cu (bang tinh, Trong tam, AI) van chay.
 */
export function requireActiveStatus(db: Database, key: string): TaskStatusDef {
  const status = getTaskStatus(db, key);
  if (!status || !status.is_active) {
    throw new HttpError(422, 'Trạng thái không tồn tại hoặc đã ẩn', {
      code: 'STATUS_UNKNOWN',
      status: key,
    });
  }
  return status;
}

/**
 * Luat cua danh sach: luon co it nhat mot trang thai "Chua bat dau" (viec moi vao
 * day) va mot "Hoan thanh" (nut hoan thanh nhanh, viec lap lai) dang dung. Thieu mot
 * trong hai thi cong viec khong tao duoc hoac khong bao gio ket thuc duoc.
 */
export function assertStatusInvariants(db: Database): void {
  const active = listTaskStatuses(db);
  if (!active.some((status) => status.kind === 'todo')) {
    throw new HttpError(422, 'Cần ít nhất một trạng thái mang ý nghĩa "Chưa bắt đầu"', {
      code: 'STATUS_NEED_START',
    });
  }
  if (!active.some((status) => status.kind === 'done')) {
    throw new HttpError(422, 'Cần ít nhất một trạng thái mang ý nghĩa "Hoàn thành"', {
      code: 'STATUS_NEED_DONE',
    });
  }
}

/** `kind` cua mot khoa; khoa la (du lieu hong) thi coi chinh no la kind neu hop le. */
export function kindOf(db: Database, key: string): CardStatus {
  const status = getTaskStatus(db, key);
  if (status) return status.kind;
  return (CARD_STATUSES as readonly string[]).includes(key) ? (key as CardStatus) : 'todo';
}
