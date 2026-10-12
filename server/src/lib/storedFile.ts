import path from 'node:path';
import { FILES_DIR } from '../db/connection.ts';
import { HttpError } from './validate.ts';

/**
 * Duong dan tuyet doi cua mot tep trong kho, tu `documents.stored_name`.
 *
 * Moi cho doc tep theo ten luu trong CSDL phai qua day thay vi `path.join(FILES_DIR, ...)`:
 * duong upload tu sinh ten an toan, nhung du lieu cu / ban nhap / CSDL bi chen co the
 * mang `../` hoac duong dan tuyet doi, va mot link chia se cong khai se gui ra dung tep
 * ngoai kho do (vd `.env`). Ten khong nam trong kho thi coi nhu tep khong ton tai.
 */
export function storedFilePath(storedName: string): string {
  const root = path.resolve(FILES_DIR);
  const file = path.resolve(root, String(storedName));
  if (!file.startsWith(`${root}${path.sep}`)) {
    throw new HttpError(404, 'Không tìm thấy tệp');
  }
  return file;
}
