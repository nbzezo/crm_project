import { api } from '../../api/client';

export interface LockStatus {
  has_pin: boolean;
  can_email: boolean;
}

export const LOCK_STATUS_KEY = ['lock-screen'] as const;

export const lockApi = {
  status: () => api.get<LockStatus>('/api/lock-screen'),
  setPin: (pin: string, currentPin?: string) =>
    api.put<{ has_pin: boolean }>('/api/lock-screen/pin', { pin, current_pin: currentPin }),
  removePin: (currentPin: string) =>
    api.post<{ has_pin: boolean }>('/api/lock-screen/pin/remove', { current_pin: currentPin }),
  verify: (pin: string) => api.post<{ ok: boolean }>('/api/lock-screen/verify', { pin }),
  sendPin: () => api.post<{ sent_to: string }>('/api/lock-screen/send-pin'),
};

/** Chi giu chu so, toi da 6. */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6);
}
