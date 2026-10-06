/**
 * Cot SQL ve quy trinh dang chay (v66), de gop vao cac truy van danh sach the.
 * Can bi danh `k` cho bang cards. Chi la SQL thuan — dung duoc ca o noi nhan `db`
 * qua tham so (ngu canh AI) lan noi dung ket noi chung.
 *
 * "Dang chay" = quy trinh cua trang thai HIEN TAI cua cong viec.
 */
export const FLOW_PROGRESS_COLUMNS = `
  (SELECT COUNT(*) FROM card_flow_steps fs JOIN card_flows f ON f.id = fs.flow_id
    WHERE f.card_id = k.id AND f.status = k.status) AS flow_total,
  (SELECT COUNT(*) FROM card_flow_steps fs JOIN card_flows f ON f.id = fs.flow_id
    WHERE f.card_id = k.id AND f.status = k.status AND fs.done_at IS NOT NULL) AS flow_done`;

/** Buoc dang phai lam (buoc dau tien chua xong) cua quy trinh dang chay. */
export const FLOW_NEXT_STEP_COLUMN = `
  (SELECT fs.content FROM card_flow_steps fs JOIN card_flows f ON f.id = fs.flow_id
    WHERE f.card_id = k.id AND f.status = k.status AND fs.done_at IS NULL
    ORDER BY fs.position, fs.id LIMIT 1) AS flow_next_step`;

/** "Quy trình 2/4 · tiếp: Kiểm thử" — cho dong meta va ngu canh AI; null khi khong co. */
export function flowProgressText(row: Record<string, unknown>): string | null {
  const total = Number(row.flow_total ?? 0);
  if (total === 0) return null;
  const done = Number(row.flow_done ?? 0);
  const next = row.flow_next_step ? ` · tiếp: ${String(row.flow_next_step)}` : '';
  return `Quy trình ${done}/${total}${next}`;
}
