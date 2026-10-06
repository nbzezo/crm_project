import type { Request } from 'express';
import type { PermissionAction } from '@workflow/contracts';
import { db } from '../db/connection.ts';
import { accessOf } from '../middleware/currentUser.ts';
import { HttpError } from './validate.ts';
import { scopeWhere, type ScopeClause } from './scope.ts';
import { anyOf, linkedBranch, taskBranch } from './linkedScope.ts';
import { meetingNoteScope } from './meetingNoteScope.ts';

/*
 * Pham vi du lieu cua kho tep (bang documents) — 1.28.2.
 *
 * Truoc ban nay route /api/documents chi chan theo TINH NANG: ai mo duoc man hinh
 * Tai lieu la liet ke, tai xuong, tai ZIP duoc moi tep cua moi phong.
 *
 * Mot tep thay duoc khi:
 *   1. nguoi tai len nam trong pham vi `documents` cua nguoi xem (cot
 *      owner_contact_id, co tu v65), HOAC
 *   2. tep gan voi mot ban ghi nguoi xem thay duoc: khach hang, nguoi lien he, co
 *      hoi, hop dong, bao gia, viec, ghi chu nhanh, trang tai lieu — dung luat cua
 *      chinh ban ghi do. Mo khach hang thay tep cua no thi kho tep cung phai thay,
 *      HOAC
 *   3. tep CU (truoc v65, khong biet ai tai len) khong gan voi ban ghi nao: giu
 *      nguyen nhu truoc — khong co ai de giao no cho, va an di thi nguoi da tai len
 *      se mat tep cua chinh minh.
 *
 * Tep chua co chu nhung CO gan ban ghi thi chi theo nhanh 2 — khong mo rong ra
 * cho tat ca chi vi thieu nguoi tai len.
 */

const LINK_COLUMNS = [
  'customer_id',
  'contact_id',
  'deal_id',
  'contract_id',
  'quotation_id',
  'card_id',
  'quick_note_id',
  'meeting_note_id',
] as const;

export function documentScope(req: Request, action: PermissionAction, alias = 'dc'): ScopeClause {
  const own = scopeWhere(req, 'documents', action, `${alias}.owner_contact_id`);
  if (own.sql === '') return own;
  const legacy = `(${alias}.owner_contact_id IS NULL AND ${LINK_COLUMNS.map(
    (column) => `${alias}.${column} IS NULL`
  ).join(' AND ')})`;
  const pages = meetingNoteScope(req, action, 'mn');
  return anyOf([
    own,
    { sql: legacy, params: [] },
    linkedBranch(req, `${alias}.customer_id`, 'customer', action),
    linkedBranch(req, `${alias}.contact_id`, 'contact', action),
    linkedBranch(req, `${alias}.deal_id`, 'deal', action),
    linkedBranch(req, `${alias}.contract_id`, 'contract', action),
    linkedBranch(req, `${alias}.quotation_id`, 'quotation', action),
    linkedBranch(req, `${alias}.quick_note_id`, 'quick_note', action),
    taskBranch(req, `${alias}.card_id`),
    pages.sql === ''
      ? { sql: `${alias}.meeting_note_id IS NOT NULL`, params: [] }
      : pages.sql === '1 = 0'
        ? pages
        : {
            sql: `${alias}.meeting_note_id IN (SELECT mn.id FROM meeting_notes mn WHERE ${pages.sql})`,
            params: pages.params,
          },
  ]);
}

/**
 * Kiem mot nhom tep CU THE (tai xuong, sua, xoa, ZIP, AI). Nem 404 neu BAT KY tep
 * nao ngoai pham vi — giong assertInScope: ngoai pham vi va khong ton tai phai
 * khong phan biet duoc.
 */
export function assertDocumentsInScope(
  req: Request,
  ids: readonly number[],
  action: PermissionAction,
  includeDeleted = false
): void {
  if (!accessOf(req).can('documents', action)) {
    throw new HttpError(403, 'Bạn không có quyền dùng chức năng này');
  }
  const unique = [...new Set(ids)];
  if (unique.length === 0) return;
  const scope = documentScope(req, action);
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM documents dc
        WHERE dc.id IN (${unique.map(() => '?').join(',')})
          ${includeDeleted ? '' : 'AND dc.deleted_at IS NULL'}
          ${scope.sql ? `AND ${scope.sql}` : ''}`
    )
    .get(...unique, ...scope.params) as { n: number };
  if (row.n !== unique.length) throw new HttpError(404, 'Khong tim thay tai lieu');
}
