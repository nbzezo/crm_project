import { db } from '../db/connection.ts';
import { isClosed } from '../lib/crm.ts';
import { checkStageGate, snapshotScores } from '../lib/scoring.ts';
import { HttpError } from '../lib/validate.ts';

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
