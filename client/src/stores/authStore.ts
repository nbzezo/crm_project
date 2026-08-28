import { create } from 'zustand';

type AuthStatus = 'checking' | 'authenticated' | 'anonymous';

interface AuthState {
  status: AuthStatus;
  username: string | null;
  /** Gọi một lần khi tải app (AuthGate). */
  checkSession: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Client API gọi khi gặp 401 giữa chừng — đá người dùng về màn đăng nhập. */
  markSignedOut: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'checking',
  username: null,

  checkSession: async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = (await res.json()) as { username: string };
        set({ status: 'authenticated', username: data.username });
      } else {
        set({ status: 'anonymous', username: null });
      }
    } catch {
      set({ status: 'anonymous', username: null });
    }
  },

  login: async (username, password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      let message = 'Đăng nhập thất bại';
      try {
        const data = (await res.json()) as { error?: string };
        if (data.error) message = data.error;
      } catch {
        /* body không phải JSON */
      }
      throw new Error(message);
    }
    const data = (await res.json()) as { username: string };
    set({ status: 'authenticated', username: data.username });
  },

  logout: async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      set({ status: 'anonymous', username: null });
    }
  },

  markSignedOut: () => {
    if (get().status !== 'anonymous') set({ status: 'anonymous', username: null });
  },
}));
