import {
  permissionKey,
  type PermissionAction,
  type PermissionResource,
  type PermissionScope,
} from '@workflow/contracts';
import { useAuthStore } from '../stores/authStore';

/*
 * Doc quyen o phia client.
 *
 * Day chi de VE giao dien — an mot menu khong phai la chan mot hanh dong. May
 * chu kiem lai moi request (requireResource trong app.ts), va do moi la cho thuc
 * thi. Hai lop doc lap nhau va deu can: thieu lop nay thi nguoi dung bam vao mot
 * menu roi nhan 403 ma khong hieu vi sao; thieu lop kia thi menu an di van goi
 * thang API duoc.
 */

export type PermissionKey = `${PermissionResource}:${PermissionAction}`;

/** Pham vi cua mot quyen, `none` khi khong co. */
export function useScope(resource: PermissionResource, action: PermissionAction): PermissionScope {
  return useAuthStore((s) => s.user?.permissions?.[permissionKey(resource, action)] ?? 'none');
}

export function usePermission(resource: PermissionResource, action: PermissionAction): boolean {
  return useScope(resource, action) !== 'none';
}

/**
 * Kiem nhieu quyen cung luc, dung cho menu.
 *
 * Tra ve mot HAM chu khong phai mot mang boolean: so luong muc menu thay doi
 * theo nhom, ma so luong hook goi trong mot component thi khong duoc phep doi
 * giua cac lan render.
 */
export function usePermissionCheck(): (key: PermissionKey | undefined) => boolean {
  const permissions = useAuthStore((s) => s.user?.permissions);
  return (key) => {
    if (!key) return true;
    return (permissions?.[key] ?? 'none') !== 'none';
  };
}
