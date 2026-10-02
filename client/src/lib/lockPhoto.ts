/*
 * Anh nen man cho do nguoi dung tai len (1.14.0).
 *
 * Luu trong localStorage cua TUNG MAY (nhu lua chon canh): anh la so thich ca nhan,
 * khong can len may chu. Thu nho ve canh dai toi da 1920px, JPEG ~0.82 — mot anh
 * man hinh rong thuong con 250–600KB, vua han muc ~5MB cua localStorage.
 */

const PHOTO_KEY = 'workflow.lock.photo';
const CHANGE_EVENT = 'workflow:lock-photo';
const MAX_EDGE = 1920;

export function readLockPhoto(): string | null {
  try {
    return localStorage.getItem(PHOTO_KEY);
  } catch {
    return null;
  }
}

function notify(): void {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function removeLockPhoto(): void {
  try {
    localStorage.removeItem(PHOTO_KEY);
  } catch {
    // Khong xoa duoc thi thoi — lan doc sau van tra ve anh cu.
  }
  notify();
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    /* onload chu khong phai image.decode(): decode() co the treo mai khi tab dang an. */
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('decode'));
      image.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Thu nho, nen va luu anh. Nem loi tieng Viet khi tep khong phai anh hoac may het cho. */
export async function saveLockPhoto(file: File): Promise<void> {
  if (!file.type.startsWith('image/')) throw new Error('Hãy chọn một tệp ảnh (JPG, PNG, WebP…)');
  let image: HTMLImageElement;
  try {
    image = await loadImage(file);
  } catch {
    throw new Error('Không đọc được ảnh này, hãy thử ảnh khác');
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
  try {
    localStorage.setItem(PHOTO_KEY, dataUrl);
  } catch {
    throw new Error('Ảnh quá lớn để lưu trên máy này, hãy chọn ảnh nhỏ hơn');
  }
  notify();
}

/** Dang ky nghe thay doi anh (ca tab nay lan tab khac). Tra ve ham huy. */
export function onLockPhotoChange(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === PHOTO_KEY) listener();
  };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener('storage', onStorage);
  };
}
