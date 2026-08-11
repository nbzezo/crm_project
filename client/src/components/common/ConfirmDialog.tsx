import { Modal } from './Modal';
import { Button } from './ui';
import { t } from '../../i18n/vi';

interface Props {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title = 'Xác nhận',
  message,
  confirmLabel = t.common.delete,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      width="max-w-md"
      footer={
        <>
          <Button onClick={onCancel}>{t.common.cancel}</Button>
          <Button variant="danger" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-tr-subtle">{message}</p>
    </Modal>
  );
}
