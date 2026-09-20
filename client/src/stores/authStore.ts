import { create } from 'zustand';
import type { PermissionMap } from '@workflow/contracts';

type AuthStatus = 'checking' | 'authenticated' | 'anonymous';

/** Ho so nguoi dang dang nhap — dung hinh dang voi PublicUser cua may chu. */
export interface AuthUser {
  id: number;
  username: string;
  email: string | null;
  full_name: string | null;
  /**
   * Dong `contacts` gan voi tai khoan nay.
   *
   * Day la cau noi giua "nguoi dang nhap" va "nguoi trong so danh ba" — thu ma
   * truoc v38 la co singleton `contacts.is_me`. Man hinh nao can biet "toi la ai"
   * (bo loc Viec cua toi, nhan "(tôi)" tren o chon nguoi phu trach) doc o day.
   */
  contact_id: number | null;
  contact_name: string | null;
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  pending_invite: boolean;

  /*
   * Quyen da gop tu moi vi tri nguoi nay dang giu, dang { "deals:read": "subtree" }.
   * KHONG co khoa = khong co quyen (may chu luu thua, xem migrate-v39.sql).
   *
   * Day chi de VE giao dien — an mot menu khong phai la chan. May chu kiem lai
   * mọi request; hai lop nay doc lap va deu can thiet.
   */
  permissions?: PermissionMap;
  /** Tang moi lan ai do doi phan quyen — client so lech de biet khi nao nap lai. */
  permissions_version?: number;
  positions?: { id: number; name: string; code: string | null; scope_unit_name: string | null }[];
  org_unit?: { id: number; name: string; kind_name: string | null } | null;
}

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  /** Gọi một lần khi tải app (AuthGate). */
  checkSession: () => Promise<void>;
  login: (login: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Client API gọi khi gặp 401 giữa chừng — đá người dùng về màn đăng nhập. */
  markSignedOut: () => void;
  /** Sau khi đặt lại mật khẩu qua liên kết, máy chủ đã mở sẵn phiên mới. */
  setUser: (user: AuthUser) => void;
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error || fallback;
  } catch {
    return fallback;
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'checking',
  user: null,

  checkSession: async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        set({ status: 'authenticated', user: (await res.json()) as AuthUser });
      } else {
        set({ status: 'anonymous', user: null });
      }
    } catch {
      set({ status: 'anonymous', user: null });
    }
  },

  login: async (login, password) => {
    /* Cố ý không đi qua api/client.ts: wrapper đó coi 401 là "phiên hết hạn" và
       gọi markSignedOut, trong khi 401 ở đây chỉ là gõ sai mật khẩu. */
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: login, password }),
    });
    if (!res.ok) throw new Error(await errorMessage(res, 'Đăng nhập thất bại'));
    set({ status: 'authenticated', user: (await res.json()) as AuthUser });
  },

  logout: async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      set({ status: 'anonymous', user: null });
    }
  },

  markSignedOut: () => {
    if (get().status !== 'anonymous') set({ status: 'anonymous', user: null });
  },

  setUser: (user) => set({ status: 'authenticated', user }),
}));

/** Tiện ích đọc nhanh, tránh mỗi nơi tự viết `s.user?.…`. */
export const useMyContactId = (): number | null => useAuthStore((s) => s.user?.contact_id ?? null);
