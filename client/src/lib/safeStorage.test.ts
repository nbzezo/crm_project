import { afterEach, describe, expect, it, vi } from 'vitest';
import { storageGet, storageSet } from './safeStorage';

afterEach(() => vi.unstubAllGlobals());

describe('safeStorage', () => {
  it('không làm hỏng giao diện khi trình duyệt chặn localStorage', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
      },
    });

    expect(storageGet('theme')).toBeNull();
    expect(() => storageSet('theme', 'dark')).not.toThrow();
  });
});
