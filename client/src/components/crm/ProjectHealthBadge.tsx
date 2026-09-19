import { t } from '../../i18n/vi';
import type { ProjectHealth } from '../../types';

/** Màu sức khỏe — đỏ/vàng/xanh, đọc được trong một cái liếc mắt qua danh sách. */
const HEALTH_TONE: Record<ProjectHealth, string> = {
  unknown: 'bg-tr-hover-strong text-tr-muted',
  green: 'bg-tr-success/15 text-tr-success',
  amber: 'bg-tr-warning/15 text-tr-warning',
  red: 'bg-tr-danger/15 text-tr-danger',
};

/**
 * Nhan suc khoe du an.
 *
 * Tach rieng khoi ProjectsPage vi DealDetailPage cung dung: nhap tu trang do keo
 * ca chunk route ProjectsPage (kem Modal, AssigneePicker…) ve chi de ve mot nhan
 * chin dong.
 */
export function HealthBadge({ health }: { health: ProjectHealth }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold ${HEALTH_TONE[health]}`}
    >
      {t.projectHealth[health]}
    </span>
  );
}
