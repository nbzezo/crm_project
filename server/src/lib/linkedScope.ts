import type { Request } from 'express';
import type { PermissionAction, PermissionResource } from '@workflow/contracts';
import { accessOf } from '../middleware/currentUser.ts';
import { scopeWhere, scopeWhereOrUnowned, type ScopeClause } from './scope.ts';

/*
 * Pham vi cho ban ghi PHU — trang tai lieu, tep — khong co pham vi rieng ma "di
 * theo" ban ghi chung gan vao (khach hang, co hoi, hop dong…). Xem
 * meetingNoteScope.ts va documentScope.ts.
 */

/** Hanh dong tren ban ghi gan kem: doc → read, moi thao tac ghi → update. */
export function linkedAction(action: PermissionAction): PermissionAction {
  return action === 'read' ? 'read' : 'update';
}

/**
 * Cach suy chu so huu cua tung loai ban ghi gan kem — cung luat voi route cua
 * chinh no (hop dong, bao gia suy tu co hoi roi khach hang; nguoi lien he suy tu
 * khach hang). Lech khoi route goc thi tep se hien o noi ban ghi bi an.
 */
const LINKED: Record<
  string,
  { resource: PermissionResource; from: string; owner: string; unowned: boolean }
> = {
  customer: {
    resource: 'customers',
    from: 'customers x',
    owner: 'x.owner_contact_id',
    unowned: true,
  },
  deal: { resource: 'deals', from: 'deals x', owner: 'x.owner_contact_id', unowned: true },
  project: { resource: 'projects', from: 'projects x', owner: 'x.owner_contact_id', unowned: true },
  contract: {
    resource: 'contracts',
    from: 'contracts x LEFT JOIN deals d ON d.id = x.deal_id LEFT JOIN customers c ON c.id = x.customer_id',
    owner: 'COALESCE(d.owner_contact_id, c.owner_contact_id)',
    unowned: true,
  },
  quotation: {
    resource: 'quotations',
    from: 'quotations x LEFT JOIN deals d ON d.id = x.deal_id LEFT JOIN customers c ON c.id = x.customer_id',
    owner: 'COALESCE(d.owner_contact_id, c.owner_contact_id)',
    unowned: true,
  },
  contact: {
    resource: 'contacts',
    from: 'contacts x JOIN customers c ON c.id = x.customer_id',
    owner: 'c.owner_contact_id',
    unowned: false,
  },
  /* Ghi chu nhanh la du lieu ca nhan: KHONG co nhanh "chua co chu" (giong
     danh sach ghi chu nhanh o quickNoteService.ts). */
  quick_note: {
    resource: 'notes',
    from: 'quick_notes x',
    owner: 'x.owner_contact_id',
    unowned: false,
  },
};

export type LinkedKind = keyof typeof LINKED;

/** `column IN (id cac ban ghi loai `kind` nguoi xem thay duoc)`. */
export function linkedBranch(
  req: Request,
  column: string,
  kind: LinkedKind,
  action: PermissionAction
): ScopeClause {
  const spec = LINKED[kind];
  const linked = kind === 'quick_note' ? action : linkedAction(action);
  const clause = (spec.unowned ? scopeWhereOrUnowned : scopeWhere)(
    req,
    spec.resource,
    linked,
    spec.owner
  );
  if (clause.sql === '') return { sql: `${column} IS NOT NULL`, params: [] };
  if (clause.sql === '1 = 0') return clause;
  return {
    sql: `${column} IN (SELECT x.id FROM ${spec.from} WHERE ${clause.sql})`,
    params: clause.params,
  };
}

/**
 * Viec (the): giong `taskScope` o routes/views.ts — bang thuoc pham vi, bang chua
 * co chu, viec giao cho minh, hoac viec chua giao ai.
 */
export function taskBranch(req: Request, column: string): ScopeClause {
  const board = scopeWhere(req, 'tasks', 'read', 'b.owner_contact_id');
  if (board.sql === '') return { sql: `${column} IS NOT NULL`, params: [] };
  const me = accessOf(req).contactId;
  const parts = [board.sql === '1 = 0' ? '' : board.sql, 'b.owner_contact_id IS NULL'];
  const params = [...board.params];
  if (me != null) {
    parts.push('k.assignee_contact_id = ?');
    params.push(me);
  }
  parts.push('k.assignee_contact_id IS NULL');
  return {
    sql: `${column} IN (SELECT k.id FROM cards k JOIN lists l ON l.id = k.list_id
                         JOIN boards b ON b.id = l.board_id
                        WHERE ${parts.filter(Boolean).join(' OR ')})`,
    params,
  };
}

/** Gop cac nhanh bang OR; bo nhanh "khong thay gi". */
export function anyOf(branches: ScopeClause[]): ScopeClause {
  if (branches.some((branch) => branch.sql === '')) return { sql: '', params: [] };
  const live = branches.filter((branch) => branch.sql !== '1 = 0');
  if (live.length === 0) return { sql: '1 = 0', params: [] };
  return {
    sql: `(${live.map((branch) => branch.sql).join(' OR ')})`,
    params: live.flatMap((branch) => branch.params),
  };
}
