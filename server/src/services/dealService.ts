import { db } from '../db/connection.ts';
import { isClosed } from '../lib/crm.ts';
import { checkStageGate, snapshotScores } from '../lib/scoring.ts';
import { HttpError, required } from '../lib/validate.ts';
import { assertProjectCustomerLink } from '../lib/entityRelations.ts';

/**
 * Kiem tra lien ket co hoi -> du an truoc khi ghi (v23).
 *
 * Chi muc duy nhat trong CSDL da chan trung roi, nhung no chi nem ra
 * "UNIQUE constraint failed: deals.project_id" — dung ve ky thuat, vo nghia voi
 * nguoi dung. Cho nay bat truoc de noi ro CO HOI NAO dang giu du an do, kem id
 * de giao dien dieu huong thang toi no.
 *
 * `dealId = 0` khi dang tao moi: chua co ban ghi nao de tu loai tru.
 */
export function assertProjectLink(
  dealId: number,
  projectId: number | null | undefined,
  customerId: number | null | undefined
): void {
  if (projectId == null) return;

  const project = required(
    db.prepare(`SELECT id, name, customer_id FROM projects WHERE id = ?`).get(projectId),
    'Khong tim thay du an'
  ) as { id: number; name: string; customer_id: number | null };

  const taken = db
    .prepare(`SELECT id, title FROM deals WHERE project_id = ? AND id <> ?`)
    .get(projectId, dealId) as { id: number; title: string } | undefined;
  if (taken) {
    throw new HttpError(409, `Dự án "${project.name}" đã gắn với cơ hội "${taken.title}"`, {
      code: 'PROJECT_ALREADY_LINKED',
      deal_id: taken.id,
      deal_title: taken.title,
    });
  }

  assertProjectCustomerLink(db, { project_id: projectId, customer_id: customerId }, 'Cơ hội');
}

export function evaluateStageGate(
  id: number,
  target: string,
  currentStage: string,
  query: Record<string, unknown>
): string | null {
  if (target === currentStage) return null;
  const result = checkStageGate(db, id, target as never);
  if (result.ok) return null;

  if (String(query.override ?? '') !== '1') {
    throw new HttpError(409, 'STAGE_GATE_BLOCKED', {
      code: 'STAGE_GATE_BLOCKED',
      target,
      required: result.required,
      bant_total: result.bant_total,
      blocked_by: result.blocked_by,
    });
  }

  const reason = String(query.reason ?? '').trim();
  if (reason.length < 10) {
    throw new HttpError(422, 'Ghi de cong giai doan phai co ly do tu 10 ky tu tro len', {
      code: 'OVERRIDE_REASON_REQUIRED',
    });
  }
  return `${currentStage} -> ${target}: ${reason}`;
}

/** Goi ben trong transaction cap nhat deal de lich su va snapshot khong lech nhau. */
export function applyDealScoreTransition(
  id: number,
  target: string,
  currentStage: string,
  overrideHistory: string | null
): void {
  if (overrideHistory) {
    db.prepare(
      `INSERT INTO deal_score_history (deal_id, factor, old_score, new_score, reason)
       VALUES (?, 'stage_gate_override', NULL, NULL, ?)`
    ).run(id, overrideHistory);
  }

  if (isClosed(target as never) && !isClosed(currentStage as never)) {
    snapshotScores(db, id);
    return;
  }
  if (!isClosed(target as never) && isClosed(currentStage as never)) {
    db.prepare(`UPDATE deals SET score_snapshot = NULL WHERE id = ?`).run(id);
    db.prepare(
      `INSERT INTO deal_score_history (deal_id, factor, old_score, new_score, reason)
       VALUES (?, 'score_unlocked', NULL, NULL, ?)`
    ).run(id, `mo lai co hoi da chot: ${currentStage} -> ${target}`);
  }
}
