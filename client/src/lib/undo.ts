import { useUiStore } from '../stores/uiStore';
import { t } from '../i18n/vi';

/**
 * Xoa co the hoan tac (kieu Gmail).
 *
 * May chu chi co DELETE cung — xoa roi khong lay lai duoc — nen thay vi goi ngay,
 * ta an muc do khoi giao dien truoc, hien toast "Hoàn tác" va chi that su goi API
 * sau khi het gio. Bam Hoàn tác thi huy bo dem va tra giao dien ve nhu cu.
 *
 * `commit` chay khi het gio; `revert` chay khi nguoi dung hoan tac.
 */
export function undoableDelete({
  message,
  commit,
  revert,
  delay = 8000,
}: {
  message: string;
  commit: () => void;
  revert: () => void;
  delay?: number;
}) {
  const timer = setTimeout(commit, delay);
  useUiStore.getState().pushToast(message, 'success', {
    label: t.common.undo,
    run: () => {
      clearTimeout(timer);
      revert();
    },
  });
}
