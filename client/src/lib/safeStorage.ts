export function storageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function storageSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Trình duyệt chặn storage thì trạng thái trong bộ nhớ vẫn dùng được.
  }
}
