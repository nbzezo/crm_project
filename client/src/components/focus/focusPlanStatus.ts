import { differenceInCalendarDays, format } from 'date-fns';
import { periodLength } from './focusPeriod';
import type { FocusMode, FocusPlan } from './focusTypes';

/**
 * Ket qua AI cua mot ky con dung duoc khong.
 *
 * Ket qua duoc luu cho toi khi nguoi dung bam "Phân tích lại", nen man hinh phai
 * tu noi ra khi no da cu. Ba tin hieu: du lieu da doi tu luc phan tich, qua lau
 * so voi do dai ky, va ky da ket thuc sau lan phan tich.
 */

/** Sau bao lau thi coi la cu: ky 1 ngay 4 gio, toi 1 tuan 1 ngay, dai hon 3 ngay. */
export function staleAfterHours(days: number): number {
  if (days <= 1) return 4;
  if (days <= 7) return 24;
  return 72;
}

export interface PlanStatus {
  stale: boolean;
  reasons: string[];
  /** "lúc 08:15 hôm nay", "3 ngày trước"... */
  ageLabel: string;
}

function parseLocal(value: string): Date {
  // 'YYYY-MM-DDTHH:mm:ss' khong co mui gio = gio dia phuong; ban ISO co 'Z' van doc dung.
  return new Date(value);
}

export function ageLabel(generatedAt: string, now: Date = new Date()): string {
  const at = parseLocal(generatedAt);
  const minutes = Math.round((now.getTime() - at.getTime()) / 60_000);
  if (minutes < 1) return 'vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const days = differenceInCalendarDays(now, at);
  if (days === 0) return `lúc ${format(at, 'HH:mm')} hôm nay`;
  if (days === 1) return `lúc ${format(at, 'HH:mm')} hôm qua`;
  if (days < 7) return `${days} ngày trước`;
  return `ngày ${format(at, 'dd/MM')}`;
}

function changesText(changes: FocusPlan['changes']): string | null {
  if (!changes || changes.total === 0) return null;
  const parts = [
    changes.done > 0 ? `${changes.done} mục đã xong` : null,
    changes.added > 0 ? `${changes.added} mục mới` : null,
    changes.moved > 0 ? `${changes.moved} mục bị dời ngày` : null,
  ].filter(Boolean);
  return `Từ lúc phân tích: ${parts.join(', ')}.`;
}

export function planStatus(
  plan: Pick<FocusPlan, 'generated_at' | 'changes'>,
  range: { from: string; to: string },
  now: Date = new Date()
): PlanStatus {
  const reasons: string[] = [];
  const at = parseLocal(plan.generated_at);
  const today = format(now, 'yyyy-MM-dd');
  const generatedDay = format(at, 'yyyy-MM-dd');

  const changed = changesText(plan.changes);
  if (changed) reasons.push(changed);

  if (range.to < today) {
    // Ky da qua: chi cu neu phan tich TRUOC khi ky ket thuc.
    if (generatedDay <= range.to) reasons.push('Kỳ này đã kết thúc sau lần phân tích.');
  } else {
    const hours = (now.getTime() - at.getTime()) / 3_600_000;
    const limit = staleAfterHours(periodLength(range));
    if (periodLength(range) === 1 && generatedDay < today && range.from <= today) {
      reasons.push('Phân tích từ hôm trước, chưa tính tình hình hôm nay.');
    } else if (hours >= limit) {
      reasons.push(`Đã quá ${limit} giờ kể từ lần phân tích.`);
    }
  }
  return { stale: reasons.length > 0, reasons, ageLabel: ageLabel(plan.generated_at, now) };
}

/** Khoa React Query cua ket qua AI — nam duoi 'focus' de lam moi cung du lieu ky. */
export function focusPlanKey(from: string, to: string, mode: FocusMode) {
  return ['focus', 'plan', from, to, mode] as const;
}

export function focusPlanUrl(from: string, to: string, mode: FocusMode) {
  return `/api/ai/focus-plan?from=${from}&to=${to}&mode=${mode}`;
}
