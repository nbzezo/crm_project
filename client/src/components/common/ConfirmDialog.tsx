import type { ReactNode } from 'react';
import { Modal } from './Modal';
import { Button } from './ui';
import { t } from '../../i18n/vi';

interface Props {
  open: boolean;
  title?: string;
  /** Cau chinh. Hau qua cu the (ai/bao nhieu ban ghi bi anh huong) dat o `details`. */
  message: ReactNode;
  /** Danh sach hau qua, hien ngay duoi `message`. */
  details?: ReactNode[];
  confirmLabel?: string;
  /** `danger` cho thao tac pha huy (mac dinh), `primary` cho xac nhan thuong. */
  tone?: 'danger' | 'primary';
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Hop xac nhan dung chung. Quy uoc: tieu de la cau hoi co ten doi tuong, than
 * noi hau qua, nut xac nhan ghi dung hanh dong ("Khoá tài khoản", khong "OK").
 * Nut Huy dung truoc nen nhan tieu diem dau tien — Enter vo y khong pha gi.
 */
export function ConfirmDialog({
  open,
  title = 'Xác nhận',
  message,
  details,
  confirmLabel = t.common.delete,
  tone = 'danger',
  pending = false,
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
          <Button variant={tone} onClick={onConfirm} disabled={pending}>
            {pending ? 'Đang xử lý…' : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-tr-subtle">{message}</div>
      {details && details.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-tr-subtle">
          {details.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
